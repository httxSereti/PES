"""Native FlowSpec runtime.

The runtime evaluates a `FlowSpec` graph for one event. It supports branches,
parallel paths, guards, data nodes, gates, sub-flows, effects and terminals.
It has no access to `Store`, `ActionQueue` or hardware: it only produces
`FlowEffect` records that the dispatcher turns into `QueueItem`s.
"""

from __future__ import annotations

import fnmatch
import random
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable, Iterable, Mapping

import structlog

from events.conditions import (
    ConditionSpec,
    build_condition_context,
    evaluate_condition,
    evaluate_conditions,
)

from .expressions import MISSING, evaluate_expression, render_value, resolve_path, truthy
from .spec import FlowEdge, FlowNode, FlowSpec

logger = structlog.get_logger("pes")

_TRIGGER_TYPES = {
    "trigger.event",
    "trigger.schedule",
    "trigger.manual",
    "trigger.webhook",
}
_DATA_TYPES = {
    "data.actor",
    "data.state",
    "data.variable",
    "data.constant",
    "data.json",
    "data.template",
    "data.math",
    "data.compare",
    "data.select",
    "data.random",
    "data.now",
    "data.coalesce",
}
_LOGIC_TYPES = {
    "logic.guard",
    "logic.switch",
    "logic.all",
    "logic.any",
    "logic.not",
    "logic.cooldown",
    "logic.throttle",
    "logic.dedupe",
    "logic.window",
    "logic.sequence",
    "logic.parallel",
    "logic.delay",
    "logic.repeat",
    "logic.foreach",
    "logic.subflow",
    "logic.stop",
}
_EFFECT_PRESETS = {
    "effect.level": "LEVEL",
    "effect.mult": "MULT",
    "effect.profile": "PROFILE",
    "effect.chaster_time": "CHASTER_TIME_UPDATE",
    "effect.lovense": "LOVENSE_SET",
    "effect.puryfi": "PURYFI_SET_ENABLED",
    "effect.training": "TRAINING_START",
    "effect.webhook": "WEBHOOK_SEND",
    "effect.discord": "WEBHOOK_SEND",
}
_TERMINAL_TYPES = {"terminal.log", "terminal.alert"}
_SUBFLOW_TYPES = {"logic.subflow", "flow.call"}

_EFFECT_META_KEYS = {
    "action_type",
    "action_id",
    "payload",
    "params",
    "duration",
    "cumulative",
    "modifiers",
    "amplifier_fields",
    "repeat",
    "repeat_interval_seconds",
    "delay",
    "delay_seconds",
    "condition",
    "label",
}

_MAX_EFFECTS = 64
_MAX_REPEAT = 10
_MAX_FOREACH = 32
_MAX_SUBFLOW_DEPTH = 8


@dataclass
class FlowEffect:
    node_id: str
    action_type: str
    payload: dict[str, Any] = field(default_factory=dict)
    duration: int = -1
    cumulative: bool = False
    modifiers: list[dict[str, Any]] = field(default_factory=list)
    repeat: int = 1
    repeat_interval_seconds: int = 0
    delay_seconds: int = 0
    iteration: int = 0
    iteration_items: list[Any] | None = None


@dataclass
class FlowEmission:
    node_id: str
    event_type: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class FlowTrace:
    node_id: str
    node_type: str
    status: str = "ok"
    value: Any = None
    reason: str | None = None
    duration_ms: int = 0


@dataclass
class FlowRuntimeResult:
    matched: bool = False
    status: str = "skipped"
    effects: list[FlowEffect] = field(default_factory=list)
    emissions: list[FlowEmission] = field(default_factory=list)
    traces: list[FlowTrace] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    skipped_reason: str | None = None
    trigger_node_id: str | None = None


@dataclass
class _NodeResult:
    active: bool = False
    value: Any = None
    output_ports: set[str] = field(default_factory=set)
    delay_seconds: int = 0
    repeat: int = 1
    repeat_interval_seconds: int = 0
    reason: str | None = None
    trace_status: str = "ok"
    sub_result: FlowRuntimeResult | None = None
    warnings: list[str] = field(default_factory=list)


class FlowGateState:
    """Persistent gates for node-level cooldown/throttle/window/dedupe."""

    def __init__(self) -> None:
        self._cooldowns: dict[str, float] = {}
        self._windows: dict[str, deque[float]] = {}
        self._budgets: dict[str, deque[float]] = {}
        self._dedupe: dict[str, float] = {}

    def cooldown(self, key: str, seconds: int) -> bool:
        if seconds <= 0:
            return True
        now = time.monotonic()
        last = self._cooldowns.get(key, 0.0)
        if last and now - last < seconds:
            return False
        self._cooldowns[key] = now
        return True

    def dedupe(self, key: str, ttl: int) -> bool:
        if ttl <= 0:
            return True
        now = time.monotonic()
        last = self._dedupe.get(key)
        if last is not None and now - last < ttl:
            return False
        self._dedupe[key] = now
        return True

    def throttle(self, key: str, count: int, seconds: int) -> bool:
        if count <= 0 or seconds <= 0:
            return True
        now = time.monotonic()
        window = self._budgets.setdefault(key, deque())
        cutoff = now - seconds
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= count:
            return False
        window.append(now)
        return True

    def window(self, key: str, count: int, seconds: int) -> bool:
        if count <= 1 or seconds <= 0:
            return True
        now = time.monotonic()
        hits = self._windows.setdefault(key, deque())
        cutoff = now - seconds
        while hits and hits[0] < cutoff:
            hits.popleft()
        hits.append(now)
        if len(hits) < count:
            return False
        hits.clear()
        return True


SubflowResolver = Callable[[str], Awaitable[FlowSpec | Mapping[str, Any] | None]]


def _preview(value: Any) -> Any:
    if value is MISSING:
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        text = value if isinstance(value, str) else value
        return text if not isinstance(text, str) or len(text) <= 300 else text[:300] + "…"
    if isinstance(value, Mapping):
        return {str(key): _preview(item) for key, item in list(value.items())[:12]}
    if isinstance(value, (list, tuple)):
        return [_preview(item) for item in list(value)[:12]]
    if hasattr(value, "__dataclass_fields__"):
        return {"type": type(value).__name__}
    return repr(value)[:300]


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


class FlowRuntime:
    def __init__(
        self,
        *,
        subflow_resolver: SubflowResolver | None = None,
        gate_store: FlowGateState | None = None,
        max_effects: int = _MAX_EFFECTS,
    ) -> None:
        self._resolver = subflow_resolver
        self._gates = gate_store or FlowGateState()
        self._max_effects = max_effects

    async def execute(
        self,
        spec: FlowSpec,
        *,
        event_type: str,
        event_data: Mapping[str, Any] | None,
        actor: Any = None,
        session: Mapping[str, Any] | None = None,
        state: Mapping[str, Any] | None = None,
        variables: Mapping[str, Any] | None = None,
        run_id: str | None = None,
        manual: bool = False,
        apply_limits: bool = True,
        stack: Iterable[str] = (),
        invoked: bool = False,
    ) -> FlowRuntimeResult:
        context = build_condition_context(event_data, actor, session)
        context["state"] = dict(state or {})
        context["vars"] = {
            **(spec.variables or {}),
            **dict(variables or {}),
        }
        context["flow"] = {"id": spec.id, "name": spec.name, "version": spec.version}
        context["run"] = {"id": run_id or spec.id, "manual": manual}
        context["now"] = datetime.now(UTC).isoformat()
        return await self._execute_spec(
            spec,
            context=context,
            event_type=event_type,
            manual=manual,
            apply_limits=apply_limits,
            stack=list(stack),
            depth=0,
            base_delay=0,
            base_repeat=1,
            invoked=invoked,
        )

    async def _execute_spec(
        self,
        spec: FlowSpec,
        *,
        context: dict[str, Any],
        event_type: str,
        manual: bool,
        apply_limits: bool,
        stack: list[str],
        depth: int,
        base_delay: int,
        base_repeat: int,
        invoked: bool,
    ) -> FlowRuntimeResult:
        result = FlowRuntimeResult()
        if depth >= _MAX_SUBFLOW_DEPTH:
            result.warnings.append("maximum sub-flow depth reached")
            result.skipped_reason = "max_depth"
            return result

        nodes = [FlowNode.model_validate(raw) for raw in spec.nodes]
        by_id = {node.id: node for node in nodes}
        if len(by_id) != len(nodes):
            result.warnings.append("duplicate node ids")
            result.status = "error"
            return result

        outgoing: dict[str, list[FlowEdge]] = defaultdict(list)
        incoming: dict[str, list[FlowEdge]] = defaultdict(list)
        for raw_edge in spec.edges:
            edge = FlowEdge.model_validate(raw_edge)
            if edge.source not in by_id or edge.target not in by_id:
                result.warnings.append(
                    f"edge references an unknown node: {edge.source}->{edge.target}"
                )
                continue
            outgoing[edge.source].append(edge)
            incoming[edge.target].append(edge)

        order = self._topological_order(nodes, outgoing, incoming)
        if order is None:
            result.warnings.append("the graph contains a cycle")
            result.status = "error"
            return result

        outgoing_ports = {
            node.id: {edge.source_port for edge in outgoing[node.id]}
            for node in nodes
        }

        active: set[str] = set()
        ports: dict[str, set[str]] = {}
        values: dict[str, Any] = {}
        delays: dict[str, int] = {}
        repeats: dict[str, int] = {}
        intervals: dict[str, int] = {}

        triggers = [node for node in nodes if node.type in _TRIGGER_TYPES]
        if not triggers:
            result.warnings.append("flow has no trigger node")
            result.status = "error"
            return result

        for node in triggers:
            matched = invoked or self._trigger_matches(node, event_type, manual)
            trace = FlowTrace(
                node_id=node.id,
                node_type=node.type,
                status="passed" if matched else "skipped",
                value={"event_type": event_type, "manual": manual},
                reason=None if matched else "trigger did not match",
            )
            result.traces.append(trace)
            if matched:
                active.add(node.id)
                ports[node.id] = {"out", "event", "value"}
                values[node.id] = {
                    "event": context.get("event", {}),
                    "actor": context.get("actor", {}),
                    "session": context.get("session", {}),
                }
                delays[node.id] = base_delay
                repeats[node.id] = base_repeat
                intervals[node.id] = 0
                result.matched = True
                result.trigger_node_id = result.trigger_node_id or node.id

        if not result.matched:
            result.status = "skipped"
            result.skipped_reason = "trigger_not_matched"
            return result

        halted = False
        for node in order:
            if node.type in _TRIGGER_TYPES:
                continue
            if halted:
                result.traces.append(
                    FlowTrace(
                        node_id=node.id,
                        node_type=node.type,
                        status="skipped",
                        reason="flow stopped",
                    )
                )
                continue

            incoming_edges = incoming[node.id]
            active_in = [
                edge
                for edge in incoming_edges
                if edge.source in active
                and (
                    edge.source_port in ports[edge.source]
                    or "out" in ports[edge.source]
                    and edge.source_port not in {"true", "false", "default"}
                    and not edge.source_port.startswith("case:")
                )
            ]
            if not active_in and incoming_edges:
                result.traces.append(
                    FlowTrace(
                        node_id=node.id,
                        node_type=node.type,
                        status="skipped",
                        reason="no active incoming branch",
                    )
                )
                continue
            if not active_in and node.type not in _DATA_TYPES:
                result.traces.append(
                    FlowTrace(
                        node_id=node.id,
                        node_type=node.type,
                        status="skipped",
                        reason="not reachable",
                    )
                )
                continue

            incoming_delay = max((delays.get(edge.source, 0) for edge in active_in), default=base_delay)
            incoming_repeat = max((repeats.get(edge.source, 1) for edge in active_in), default=base_repeat)
            incoming_interval = max((intervals.get(edge.source, 0) for edge in active_in), default=0)
            input_values = [values.get(edge.source, MISSING) for edge in active_in]
            input_by_port = {
                edge.target_port: values.get(edge.source, MISSING)
                for edge in active_in
            }

            started = time.perf_counter()
            try:
                outcome = await self._eval_node(
                    node,
                    context=context,
                    input_values=input_values,
                    input_by_port=input_by_port,
                    outgoing_ports=outgoing_ports.get(node.id, set()),
                    event_type=event_type,
                    manual=manual,
                    apply_limits=apply_limits,
                    stack=stack,
                    depth=depth,
                    incoming_delay=incoming_delay,
                    incoming_repeat=incoming_repeat,
                    incoming_interval=incoming_interval,
                )
            except Exception as exc:  # a node error must never crash the bus
                logger.exception("[FlowRuntime] Node failed", node_id=node.id, node_type=node.type)
                result.warnings.append(f"node {node.id} failed: {exc}")
                result.traces.append(
                    FlowTrace(
                        node_id=node.id,
                        node_type=node.type,
                        status="error",
                        reason=str(exc),
                    )
                )
                continue

            duration_ms = int((time.perf_counter() - started) * 1000)
            result.warnings.extend(outcome.warnings)
            result.traces.append(
                FlowTrace(
                    node_id=node.id,
                    node_type=node.type,
                    status=outcome.trace_status if outcome.active else "skipped",
                    value=_preview(outcome.value),
                    reason=outcome.reason,
                    duration_ms=duration_ms,
                )
            )
            if not outcome.active:
                continue

            active.add(node.id)
            ports[node.id] = outcome.output_ports or {"out"}
            values[node.id] = outcome.value
            delays[node.id] = outcome.delay_seconds
            repeats[node.id] = outcome.repeat
            intervals[node.id] = outcome.repeat_interval_seconds

            if isinstance(outcome.value, FlowEffect):
                if len(result.effects) >= self._max_effects:
                    result.warnings.append("maximum effects per flow reached")
                    halted = True
                    continue
                result.effects.append(outcome.value)
            if isinstance(outcome.value, FlowEmission):
                result.emissions.append(outcome.value)
            if outcome.sub_result is not None:
                for effect in outcome.sub_result.effects:
                    effect.node_id = f"{node.id}/{effect.node_id}"
                result.effects.extend(outcome.sub_result.effects)
                result.emissions.extend(outcome.sub_result.emissions)
                result.warnings.extend(outcome.sub_result.warnings)
                result.traces.extend(
                    FlowTrace(
                        node_id=f"{node.id}/{trace.node_id}",
                        node_type=trace.node_type,
                        status=trace.status,
                        value=trace.value,
                        reason=trace.reason,
                        duration_ms=trace.duration_ms,
                    )
                    for trace in outcome.sub_result.traces
                )
            if node.type == "logic.stop":
                halted = True

        result.status = "matched" if result.effects or result.emissions else "skipped"
        if not result.effects and not result.emissions:
            result.skipped_reason = "no_effects"
        return result

    async def _eval_node(
        self,
        node: FlowNode,
        *,
        context: dict[str, Any],
        input_values: list[Any],
        input_by_port: dict[str, Any],
        outgoing_ports: set[str],
        event_type: str,
        manual: bool,
        apply_limits: bool,
        stack: list[str],
        depth: int,
        incoming_delay: int,
        incoming_repeat: int,
        incoming_interval: int,
    ) -> _NodeResult:
        config = node.config or {}
        first_input = next((value for value in input_values if value is not MISSING), MISSING)

        if node.type == "logic.guard":
            passed = self._evaluate_guard(config, context)
            branch_ports = (
                {"true"} if passed else {"false"}
            ) if outgoing_ports & {"true", "false"} else ({"out"} if passed else set())
            return _NodeResult(
                active=passed or bool(branch_ports),
                value=passed,
                output_ports=branch_ports,
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
                reason=None if passed else "condition did not match",
            )

        if node.type == "logic.switch":
            expression = config.get("expr")
            if isinstance(expression, str) and expression.strip():
                selector = evaluate_expression(expression, context)
                if selector is MISSING:
                    selector = self._resolve_operand(expression, context)
            else:
                selector = self._resolve_operand(
                    config.get("field") or first_input, context
                )
            key = str(selector)
            case_ports = {port for port in outgoing_ports if port.startswith("case:") or port == "default"}
            if case_ports:
                matched_port = f"case:{key}"
                allowed = config.get("cases")
                if isinstance(allowed, list) and allowed and key not in [str(item) for item in allowed]:
                    matched_port = ""
                if matched_port and matched_port in case_ports:
                    ports = {matched_port}
                    active_branch = True
                elif "default" in case_ports:
                    ports = {"default"}
                    active_branch = True
                else:
                    ports = {matched_port} if matched_port else set()
                    active_branch = False
                return _NodeResult(
                    active=active_branch,
                    value=selector,
                    output_ports=ports,
                    delay_seconds=incoming_delay,
                    repeat=incoming_repeat,
                    repeat_interval_seconds=incoming_interval,
                    reason=None if active_branch else f"no branch for {key}",
                )
            return _NodeResult(
                active=True,
                value=selector,
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type in _DATA_TYPES:
            value = self._eval_data(node.type, config, context, first_input)
            return _NodeResult(
                active=value is not MISSING,
                value=None if value is MISSING else value,
                output_ports={"out", "value", self._data_port(value)},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
                reason=None if value is not MISSING else "no value",
            )

        if node.type == "logic.all":
            passed = all(truthy(value) for value in input_values)
            return self._bool_result(passed, incoming_delay, incoming_repeat, incoming_interval)
        if node.type == "logic.any":
            passed = any(truthy(value) for value in input_values)
            return self._bool_result(passed, incoming_delay, incoming_repeat, incoming_interval)
        if node.type == "logic.not":
            passed = not any(truthy(value) for value in input_values)
            return self._bool_result(passed, incoming_delay, incoming_repeat, incoming_interval)

        if node.type in {"logic.sequence", "logic.parallel"}:
            return _NodeResult(
                active=True,
                value=first_input,
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type == "logic.delay":
            seconds = max(0, int(render_value(config.get("seconds", config.get("delay", 0)), context) or 0))
            return _NodeResult(
                active=True,
                value=first_input,
                output_ports={"out"},
                delay_seconds=incoming_delay + seconds,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type == "logic.repeat":
            count = int(render_value(config.get("count", 2), context) or 2)
            count = max(1, min(_MAX_REPEAT, count))
            interval = max(0, int(config.get("interval_seconds", 0) or 0))
            return _NodeResult(
                active=True,
                value=first_input,
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=min(_MAX_REPEAT, incoming_repeat * count),
                repeat_interval_seconds=interval or incoming_interval,
            )

        if node.type == "logic.foreach":
            collection = first_input
            if not isinstance(collection, (list, tuple)):
                collection = render_value(config.get("items", []), context)
            if not isinstance(collection, (list, tuple)):
                return _NodeResult(active=False, reason="foreach input is not a list")
            count = max(1, min(_MAX_FOREACH, len(collection)))
            return _NodeResult(
                active=bool(collection),
                value=collection,
                output_ports={"out", "item"},
                delay_seconds=incoming_delay,
                repeat=min(_MAX_FOREACH, incoming_repeat * count),
                repeat_interval_seconds=incoming_interval,
                reason=None if collection else "empty collection",
            )

        if node.type == "logic.stop":
            return _NodeResult(
                active=True,
                value=None,
                output_ports=set(),
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type in {"logic.cooldown", "logic.throttle", "logic.window", "logic.dedupe"}:
            allowed = self._eval_gate(
                node.type,
                config,
                node.id,
                apply_limits,
                str((context.get("flow") or {}).get("id") or ""),
            )
            return _NodeResult(
                active=allowed,
                value=allowed,
                output_ports={"out", "true"} if allowed else {"false"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
                reason=None if allowed else f"{node.type} blocked",
            )

        if node.type in _SUBFLOW_TYPES:
            return await self._eval_subflow(
                node,
                config=config,
                context=context,
                event_type=event_type,
                manual=manual,
                apply_limits=apply_limits,
                stack=stack,
                depth=depth,
                incoming_delay=incoming_delay,
                incoming_repeat=incoming_repeat,
            )

        if node.type == "effect.emit_event":
            event_name = str(render_value(config.get("event_type") or config.get("event") or "", context))
            payload = render_value(config.get("payload") or config.get("data") or {}, context)
            if not event_name:
                return _NodeResult(active=False, reason="missing event_type")
            return _NodeResult(
                active=True,
                value=FlowEmission(node_id=node.id, event_type=event_name, payload=dict(payload or {})),
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type in _EFFECT_PRESETS or node.type == "effect.action":
            effect = self._build_effect(
                node,
                config=config,
                context=context,
                input_values=input_values,
                input_by_port=input_by_port,
                incoming_delay=incoming_delay,
                incoming_repeat=incoming_repeat,
                incoming_interval=incoming_interval,
            )
            if effect is None:
                return _NodeResult(active=False, reason="invalid effect")
            return _NodeResult(
                active=True,
                value=effect,
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type in _TERMINAL_TYPES:
            message = render_value(
                config.get("message") or config.get("text") or config.get("value") or "",
                context,
            )
            return _NodeResult(
                active=True,
                value=str(message),
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        if node.type == "effect.notify":
            message = render_value(config.get("message") or config.get("text") or "", context)
            return _NodeResult(
                active=True,
                value=str(message),
                output_ports={"out"},
                delay_seconds=incoming_delay,
                repeat=incoming_repeat,
                repeat_interval_seconds=incoming_interval,
            )

        return _NodeResult(active=False, reason=f"unsupported node type: {node.type}")

    def _eval_gate(
        self,
        node_type: str,
        config: dict[str, Any],
        node_id: str,
        apply_limits: bool,
        flow_id: str = "",
    ) -> bool:
        if not apply_limits:
            return True
        key = str(config.get("key") or config.get("gate_key") or node_id)
        if flow_id:
            key = f"{flow_id}:{key}"
        if node_type == "logic.cooldown":
            return self._gates.cooldown(key, int(config.get("seconds", 60) or 60))
        if node_type == "logic.dedupe":
            return self._gates.dedupe(key, int(config.get("ttl_seconds", 300) or 300))
        if node_type == "logic.throttle":
            return self._gates.throttle(
                key,
                int(config.get("count", 10) or 10),
                int(config.get("seconds", 60) or 60),
            )
        return self._gates.window(
            key,
            int(config.get("count", 10) or 10),
            int(config.get("seconds", 60) or 60),
        )

    def _build_effect(
        self,
        node: FlowNode,
        *,
        config: dict[str, Any],
        context: dict[str, Any],
        input_values: list[Any],
        input_by_port: dict[str, Any],
        incoming_delay: int,
        incoming_repeat: int,
        incoming_interval: int,
    ) -> FlowEffect | None:
        condition = input_by_port.get("condition")
        if condition is not None and not truthy(condition):
            return None
        raw_type = config.get("action_type") or config.get("action_id")
        if node.type in _EFFECT_PRESETS and not raw_type:
            raw_type = _EFFECT_PRESETS[node.type]
        if not raw_type:
            return None
        action_type = str(getattr(raw_type, "value", raw_type))

        payload_config = config.get("payload") or config.get("params")
        if payload_config is None:
            payload_config = {
                key: value for key, value in config.items() if key not in _EFFECT_META_KEYS
            }
        payload = render_value(payload_config or {}, context)
        if not isinstance(payload, dict):
            return None

        try:
            duration = int(render_value(config.get("duration", -1), context) or -1)
        except (TypeError, ValueError):
            duration = -1
        cumulative = bool(config.get("cumulative", False))
        modifiers = render_value(config.get("modifiers") or [], context)
        if not isinstance(modifiers, list):
            modifiers = []

        amplifier = input_by_port.get("amplifier")
        numeric_amplifier = _as_number(amplifier)
        if numeric_amplifier is not None and numeric_amplifier != 1:
            fields = config.get("amplifier_fields") or ["value", "duration"]
            modifiers.append(
                {
                    "type": "scale",
                    "factor": max(0.01, numeric_amplifier),
                    "fields": list(fields),
                }
            )

        repeat = max(1, min(_MAX_FOREACH, incoming_repeat * max(1, int(config.get("repeat", 1) or 1))))
        delay = incoming_delay + max(0, int(config.get("delay_seconds", config.get("delay", 0)) or 0))
        interval = max(0, int(config.get("repeat_interval_seconds", 0) or 0)) or incoming_interval
        iteration_items = next(
            (
                list(value)
                for value in input_values
                if isinstance(value, (list, tuple))
            ),
            None,
        )
        return FlowEffect(
            node_id=node.id,
            action_type=action_type,
            payload=payload,
            duration=duration,
            cumulative=cumulative,
            modifiers=modifiers,
            repeat=repeat,
            repeat_interval_seconds=interval,
            delay_seconds=delay,
            iteration_items=iteration_items,
        )

    async def _eval_subflow(
        self,
        node: FlowNode,
        *,
        config: dict[str, Any],
        context: dict[str, Any],
        event_type: str,
        manual: bool,
        apply_limits: bool,
        stack: list[str],
        depth: int,
        incoming_delay: int,
        incoming_repeat: int,
    ) -> _NodeResult:
        rule_id = str(config.get("rule_id") or config.get("flow_id") or "")
        if not rule_id:
            return _NodeResult(active=False, reason="sub-flow has no rule_id")
        version = config.get("version")
        key = f"{rule_id}@{version}" if version not in (None, "", 0, "0") else rule_id
        if key in stack:
            warning = f"sub-flow cycle detected: {key}"
            logger.warning("[FlowRuntime] " + warning, node_id=node.id)
            return _NodeResult(active=False, reason=warning, warnings=[warning])
        if self._resolver is None:
            return _NodeResult(active=False, reason="no sub-flow resolver")
        spec = await self._resolver(key)
        if spec is None:
            warning = f"sub-flow not found: {key}"
            return _NodeResult(active=False, reason=warning, warnings=[warning])
        nested = spec if isinstance(spec, FlowSpec) else FlowSpec.model_validate(spec)
        nested_context = dict(context)
        nested_context["flow"] = {
            "id": nested.id,
            "name": nested.name,
            "version": nested.version,
        }
        nested_context["vars"] = {
            **(nested.variables or {}),
            **(context.get("vars") or {}),
        }
        sub = await self._execute_spec(
            nested,
            context=nested_context,
            event_type=event_type,
            manual=manual,
            apply_limits=apply_limits,
            stack=[*stack, key],
            depth=depth + 1,
            base_delay=incoming_delay,
            base_repeat=incoming_repeat,
            invoked=True,
        )
        return _NodeResult(
            active=sub.matched,
            value={
                "status": sub.status,
                "effects": len(sub.effects),
                "rule_id": rule_id,
            },
            output_ports={"out", "value"},
            delay_seconds=incoming_delay,
            repeat=incoming_repeat,
            reason=sub.skipped_reason,
            sub_result=sub,
        )

    @staticmethod
    def _data_port(value: Any) -> str:
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, (int, float)):
            return "number"
        if isinstance(value, str):
            return "string"
        if isinstance(value, Mapping):
            return "json"
        return "value"

    @staticmethod
    def _bool_result(
        value: bool, delay: int, repeat: int, interval: int
    ) -> _NodeResult:
        return _NodeResult(
            active=True,
            value=value,
            output_ports={"out", "true" if value else "false", "boolean"},
            delay_seconds=delay,
            repeat=repeat,
            repeat_interval_seconds=interval,
        )

    @staticmethod
    def _resolve_operand(value: Any, context: Mapping[str, Any]) -> Any:
        if isinstance(value, str):
            resolved = resolve_path(context, value)
            if resolved is not MISSING:
                return resolved
        return render_value(value, context)

    def _eval_data(
        self,
        node_type: str,
        config: dict[str, Any],
        context: dict[str, Any],
        first_input: Any,
    ) -> Any:
        if node_type == "data.actor":
            return context.get("actor") or {}
        if node_type == "data.state":
            path = config.get("path") or config.get("field")
            if not path:
                return context.get("state") or {}
            path = str(path)
            full_path = path if path.startswith("state.") else f"state.{path}"
            return resolve_path({"state": context.get("state") or {}}, full_path)
        if node_type == "data.variable":
            path = str(config.get("path") or config.get("name") or "")
            full_path = path if path.startswith("vars.") else f"vars.{path}"
            return resolve_path({"vars": context.get("vars") or {}}, full_path)
        if node_type == "data.constant":
            return config.get("value")
        if node_type == "data.json":
            return render_value(config.get("value", config.get("json")), context)
        if node_type == "data.template":
            template = config.get("template", config.get("value", ""))
            return render_value(template, context)
        if node_type == "data.math":
            expression = config.get("expr")
            if isinstance(expression, str) and expression.strip():
                value = evaluate_expression(expression, context)
                return None if value is MISSING else value
            left = self._resolve_operand(config.get("left", first_input), context)
            right = self._resolve_operand(config.get("right", 0), context)
            op = str(config.get("op") or config.get("operation") or "add")
            left_num = _as_number(left)
            right_num = _as_number(right)
            if left_num is None or right_num is None:
                return None
            operations = {
                "add": lambda: left_num + right_num,
                "sub": lambda: left_num - right_num,
                "mul": lambda: left_num * right_num,
                "div": lambda: left_num / right_num if right_num else None,
                "mod": lambda: left_num % right_num if right_num else None,
                "min": lambda: min(left_num, right_num),
                "max": lambda: max(left_num, right_num),
                "pow": lambda: left_num ** min(10, right_num),
            }
            return operations.get(op, operations["add"])()
        if node_type == "data.compare":
            expression = config.get("expr")
            if isinstance(expression, str) and expression.strip():
                value = evaluate_expression(expression, context)
                return bool(value) if value is not MISSING else False
            condition = config.get("condition")
            if condition is None:
                condition = {
                    "field": config.get("left") or config.get("field") or "event",
                    "op": config.get("op") or "eq",
                    "value": render_value(config.get("right", config.get("value")), context),
                }
            return evaluate_condition(condition, context)
        if node_type == "data.select":
            condition = config.get("condition", config.get("expr") or first_input)
            if isinstance(condition, Mapping):
                passed = evaluate_condition(condition, context)
            elif isinstance(condition, str):
                value = evaluate_expression(condition, context)
                passed = bool(value) if value is not MISSING else bool(condition)
            elif config.get("field"):
                passed = evaluate_condition(
                    {
                        "field": config.get("field"),
                        "op": config.get("op", "eq"),
                        "value": config.get("value"),
                    },
                    context,
                )
            else:
                passed = truthy(condition)
            return render_value(
                config.get("if_true", config.get("true", 1))
                if passed
                else config.get("if_false", config.get("false", 0)),
                context,
            )
        if node_type == "data.random":
            rng = random.Random(f"{context.get('run', {}).get('id')}:{config.get('seed', '')}")
            choices = config.get("choices")
            if isinstance(choices, list) and choices:
                return choices[rng.randrange(len(choices))]
            low = config.get("min", 0)
            high = config.get("max", 100)
            try:
                low_num = int(low)
                high_num = int(high)
                return low_num if low_num == high_num else rng.randint(min(low_num, high_num), max(low_num, high_num))
            except (TypeError, ValueError):
                return None
        if node_type == "data.now":
            fmt = str(config.get("format", "iso"))
            now = datetime.now(UTC)
            if fmt == "epoch":
                return int(now.timestamp())
            if fmt and fmt not in {"iso", "strftime"}:
                return now.strftime(fmt)
            return now.isoformat()
        if node_type == "data.coalesce":
            values = config.get("values")
            if not isinstance(values, list):
                values = [first_input]
            for value in values:
                rendered = self._resolve_operand(value, context)
                if rendered is not None and rendered is not MISSING and rendered != "":
                    return rendered
            return None
        return MISSING

    @staticmethod
    def _evaluate_guard(config: dict[str, Any], context: Mapping[str, Any]) -> bool:
        conditions = config.get("conditions")
        if isinstance(conditions, list) and conditions:
            return evaluate_conditions(
                conditions,
                str(config.get("condition_mode", "all")),
                context,
            )
        condition = config.get("condition")
        if isinstance(condition, Mapping):
            return evaluate_condition(condition, context)
        expression = config.get("expr")
        if isinstance(expression, str) and expression.strip():
            value = evaluate_expression(expression, context)
            return bool(value) if value is not MISSING else False
        field_name = config.get("field")
        if field_name:
            return evaluate_condition(
                {
                    "field": field_name,
                    "op": config.get("op", "eq"),
                    "value": config.get("value"),
                },
                context,
            )
        return True

    @staticmethod
    def _trigger_matches(node: FlowNode, event_type: str, manual: bool) -> bool:
        config = node.config or {}
        if node.type == "trigger.manual":
            return manual
        if node.type == "trigger.schedule":
            return manual
        if node.type == "trigger.webhook":
            patterns = config.get("event_types") or config.get("event_type") or ["webhook.received"]
        else:
            patterns = config.get("event_types") or config.get("event_type") or config.get("event")
        if isinstance(patterns, str):
            patterns = [patterns]
        if not patterns:
            return True
        return any(fnmatch.fnmatch(event_type, str(pattern)) for pattern in patterns)

    @staticmethod
    def _topological_order(
        nodes: list[FlowNode],
        outgoing: dict[str, list[FlowEdge]],
        incoming: dict[str, list[FlowEdge]],
    ) -> list[FlowNode] | None:
        indegree = {node.id: len(incoming.get(node.id, [])) for node in nodes}
        queue = deque([node.id for node in nodes if indegree[node.id] == 0])
        by_id = {node.id: node for node in nodes}
        ordered: list[FlowNode] = []
        while queue:
            node_id = queue.popleft()
            ordered.append(by_id[node_id])
            for edge in outgoing.get(node_id, []):
                indegree[edge.target] -= 1
                if indegree[edge.target] == 0:
                    queue.append(edge.target)
        if len(ordered) != len(nodes):
            return None
        return ordered
