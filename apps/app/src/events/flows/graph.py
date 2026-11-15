"""Graph editing helpers: rule ↔ canvas graph, validation and diff."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Any, Iterable

from events.conditions import ConditionSpec
from events.enums import ActionType
from events.modifiers import validate_modifier

from .compiler import compile_trigger_rule
from .spec import FlowEdge, FlowNode, FlowSpec

_MAX_NODES = 200
_DEFAULT_X = 40
_DEFAULT_Y = 100
_COLUMN_WIDTH = 280


class GraphValidationError(ValueError):
    """The graph cannot be applied to a rule yet."""


@dataclass
class GraphAction:
    action_type: ActionType
    payload: dict[str, Any] = field(default_factory=dict)
    duration: int = -1
    cumulative: bool = False
    modifiers: list[dict[str, Any]] = field(default_factory=list)
    sort_order: int = 0


@dataclass
class GraphPlan:
    event_types: list[str]
    conditions: list[dict[str, Any]]
    actions: list[GraphAction]
    warnings: list[str] = field(default_factory=list)


def ensure_positions(spec: FlowSpec) -> FlowSpec:
    """Give every node a stable canvas position (declaration order)."""
    for index, node in enumerate(spec.nodes):
        if node.position is None:
            node.position = {
                "x": _DEFAULT_X + index * _COLUMN_WIDTH,
                "y": _DEFAULT_Y,
            }
    return spec


def graph_from_rule(rule: Any, event_types: Iterable[str]) -> FlowSpec:
    """Compile a trigger rule into an editable graph with default layout."""
    spec, _ = compile_trigger_rule(rule, list(event_types))
    return ensure_positions(spec)


def graph_event_types(spec: FlowSpec) -> list[str]:
    """Event patterns declared by trigger nodes (runtime indexing)."""
    patterns: list[str] = []
    for node in spec.nodes:
        if node.type == "trigger.webhook":
            raw = node.config.get("event_types") or node.config.get("event_type")
            patterns.extend(
                raw if isinstance(raw, list) else [raw or "webhook.received"]
            )
        elif node.type == "trigger.event":
            raw = (
                node.config.get("event_types")
                or node.config.get("event_type")
                or node.config.get("event")
            )
            if isinstance(raw, list):
                patterns.extend(raw)
            elif raw:
                patterns.append(raw)
    return list(dict.fromkeys(str(pattern).strip() for pattern in patterns if str(pattern).strip()))


def validate_graph(spec: FlowSpec) -> list[str]:
    """Structural validation for DAG graphs, including branching flows."""
    warnings: list[str] = []
    if len(spec.nodes) > _MAX_NODES:
        raise GraphValidationError(f"a graph can have at most {_MAX_NODES} nodes")
    by_id = {node.id: node for node in spec.nodes}
    if len(by_id) != len(spec.nodes):
        raise GraphValidationError("duplicate node ids")
    if not any(node.type.startswith("trigger.") for node in spec.nodes):
        raise GraphValidationError("a flow needs at least one trigger node")

    outgoing: dict[str, list[FlowEdge]] = {node_id: [] for node_id in by_id}
    incoming: dict[str, int] = {node_id: 0 for node_id in by_id}
    for raw_edge in spec.edges:
        edge = FlowEdge.model_validate(raw_edge)
        if edge.source not in by_id or edge.target not in by_id:
            raise GraphValidationError(
                f"edge references an unknown node: {edge.source}->{edge.target}"
            )
        outgoing[edge.source].append(edge)
        incoming[edge.target] += 1

    queue = deque([node_id for node_id, count in incoming.items() if count == 0])
    seen = 0
    while queue:
        node_id = queue.popleft()
        seen += 1
        for edge in outgoing[node_id]:
            incoming[edge.target] -= 1
            if incoming[edge.target] == 0:
                queue.append(edge.target)
    if seen != len(by_id):
        raise GraphValidationError("the graph contains a cycle")

    if not spec.edges:
        warnings.append("flow has no edges")
    return warnings


def _ordered_nodes(spec: FlowSpec, *, strict: bool) -> list[FlowNode]:
    by_id = {node.id: node for node in spec.nodes}
    if len(by_id) != len(spec.nodes):
        raise GraphValidationError("duplicate node ids")
    if len(spec.nodes) > _MAX_NODES:
        raise GraphValidationError(f"a graph can have at most {_MAX_NODES} nodes")

    triggers = [node for node in spec.nodes if node.type == "trigger.event"]
    if len(triggers) != 1:
        raise GraphValidationError("a flow needs exactly one trigger node")
    trigger = triggers[0]

    outgoing: dict[str, list[str]] = {node_id: [] for node_id in by_id}
    incoming: dict[str, list[str]] = {node_id: [] for node_id in by_id}
    for raw_edge in spec.edges:
        edge = (
            raw_edge
            if isinstance(raw_edge, FlowEdge)
            else FlowEdge.model_validate(raw_edge)
        )
        if edge.source not in by_id or edge.target not in by_id:
            raise GraphValidationError(
                f"edge references an unknown node: {edge.source}->{edge.target}"
            )
        outgoing[edge.source].append(edge.target)
        incoming[edge.target].append(edge.source)

    for node_id, targets in outgoing.items():
        if len(targets) > 1:
            raise GraphValidationError(
                f"node '{node_id}' has multiple outgoing edges; "
                "legacy TriggerRule conversion supports linear flows only"
            )
    for node_id, sources in incoming.items():
        if len(sources) > 1:
            raise GraphValidationError(
                f"node '{node_id}' has multiple incoming edges; "
                "legacy TriggerRule conversion supports linear flows only"
            )

    ordered: list[FlowNode] = [trigger]
    seen = {trigger.id}
    current = trigger.id
    while outgoing[current]:
        current = outgoing[current][0]
        if current in seen:
            raise GraphValidationError("the graph contains a cycle")
        seen.add(current)
        ordered.append(by_id[current])

    if len(seen) != len(spec.nodes):
        missing = sorted(set(by_id) - seen)
        raise GraphValidationError(
            "every node must be reachable from the trigger; "
            f"unreachable: {', '.join(missing[:5])}"
        )

    if strict:
        trigger_targets = outgoing[trigger.id]
        if not trigger_targets:
            raise GraphValidationError("the trigger node has no outgoing edge")
    return ordered


def compile_graph(
    spec: FlowSpec,
    *,
    subflows: dict[str, Any] | None = None,
    strict: bool = True,
) -> GraphPlan:
    """Compile a linear canvas graph into rule fields."""
    ordered = _ordered_nodes(spec, strict=strict)
    trigger = ordered[0]
    raw_event_types = trigger.config.get("event_types") or []
    if not isinstance(raw_event_types, list):
        raise GraphValidationError("trigger.event_types must be a list")
    event_types = list(dict.fromkeys(str(item).strip() for item in raw_event_types if str(item).strip()))
    if not event_types:
        raise GraphValidationError("the trigger node needs at least one event type")

    conditions: list[dict[str, Any]] = []
    actions: list[GraphAction] = []
    warnings: list[str] = []
    subflows = subflows or {}

    for node in ordered[1:]:
        if node.type == "logic.guard":
            config = node.config or {}
            raw_condition = config.get("condition") or config
            try:
                condition = ConditionSpec.model_validate(raw_condition)
            except Exception as exc:
                raise GraphValidationError(
                    f"condition node '{node.id}' is invalid: {exc}"
                ) from exc
            conditions.append(condition.model_dump(mode="json"))
            continue

        if node.type == "effect.action":
            config = node.config or {}
            raw_type = config.get("action_type")
            if hasattr(raw_type, "value"):
                raw_type = raw_type.value
            try:
                action_type = ActionType(str(raw_type))
            except ValueError as exc:
                raise GraphValidationError(
                    f"action node '{node.id}' has an unknown action_type "
                    f"{raw_type!r}"
                ) from exc
            payload = config.get("payload")
            if payload is None:
                payload = {}
            if not isinstance(payload, dict):
                raise GraphValidationError(
                    f"action node '{node.id}' payload must be an object"
                )
            modifiers = config.get("modifiers") or []
            if not isinstance(modifiers, list):
                raise GraphValidationError(
                    f"action node '{node.id}' modifiers must be a list"
                )
            for modifier in modifiers:
                try:
                    validate_modifier(modifier)
                except Exception as exc:
                    raise GraphValidationError(
                        f"action node '{node.id}' has an invalid modifier: {exc}"
                    ) from exc
            try:
                duration = int(config.get("duration", -1))
            except (TypeError, ValueError) as exc:
                raise GraphValidationError(
                    f"action node '{node.id}' duration must be an integer"
                ) from exc
            actions.append(
                GraphAction(
                    action_type=action_type,
                    payload=payload,
                    duration=duration,
                    cumulative=bool(config.get("cumulative", False)),
                    modifiers=modifiers,
                    sort_order=len(actions),
                )
            )
            continue

        if node.type == "flow.call":
            config = node.config or {}
            rule_id = str(config.get("rule_id") or "")
            if not rule_id:
                raise GraphValidationError(
                    f"subflow node '{node.id}' has no rule_id"
                )
            subflow_rule = subflows.get(rule_id)
            if subflow_rule is None:
                warnings.append(
                    f"subflow node '{node.id}' references a missing rule "
                    f"'{rule_id}' and was skipped"
                )
                continue
            for raw_condition in getattr(subflow_rule, "conditions", []) or []:
                try:
                    conditions.append(
                        ConditionSpec.model_validate(raw_condition).model_dump(
                            mode="json"
                        )
                    )
                except Exception:
                    warnings.append(
                        f"subflow '{rule_id}' has an invalid condition; skipped"
                    )
            for sub_action in getattr(subflow_rule, "actions", []) or []:
                actions.append(
                    GraphAction(
                        action_type=sub_action.action_type,
                        payload=dict(sub_action.payload or {}),
                        duration=int(sub_action.duration),
                        cumulative=bool(sub_action.cumulative),
                        modifiers=list(sub_action.modifiers or []),
                        sort_order=len(actions),
                    )
                )
            continue

        raise GraphValidationError(
            f"node '{node.id}' cannot be applied to a rule (type={node.type})"
        )

    if not actions:
        warnings.append("flow has no actions")

    return GraphPlan(
        event_types=event_types,
        conditions=conditions,
        actions=actions,
        warnings=warnings,
    )


def _semantic(value: Any) -> Any:
    """Strip UI-only fields before comparing nodes."""
    if isinstance(value, dict):
        return {
            key: _semantic(item)
            for key, item in value.items()
            if key not in {"position", "_ui"}
        }
    if isinstance(value, list):
        return [_semantic(item) for item in value]
    return value


def diff_graphs(old: FlowSpec, new: FlowSpec) -> dict[str, Any]:
    old_nodes = {
        node.id: node for node in (FlowNode.model_validate(raw) for raw in old.nodes)
    }
    new_nodes = {
        node.id: node for node in (FlowNode.model_validate(raw) for raw in new.nodes)
    }
    added_nodes = [new_nodes[key] for key in new_nodes.keys() - old_nodes.keys()]
    removed_nodes = [old_nodes[key] for key in old_nodes.keys() - new_nodes.keys()]
    changed_nodes = [
        new_nodes[key]
        for key in old_nodes.keys() & new_nodes.keys()
        if old_nodes[key].type != new_nodes[key].type
        or _semantic(old_nodes[key].config) != _semantic(new_nodes[key].config)
    ]

    def edge_key(edge: FlowEdge) -> str:
        return f"{edge.source}->{edge.target}:{edge.source_port}->{edge.target_port}"

    old_edge_models = [FlowEdge.model_validate(edge) for edge in old.edges]
    new_edge_models = [FlowEdge.model_validate(edge) for edge in new.edges]
    old_edges = {edge_key(edge): edge for edge in old_edge_models}
    new_edges = {edge_key(edge): edge for edge in new_edge_models}
    added_edges = [new_edges[key] for key in new_edges.keys() - old_edges.keys()]
    removed_edges = [old_edges[key] for key in old_edges.keys() - new_edges.keys()]

    return {
        "from_version": old.version,
        "to_version": new.version,
        "nodes": {
            "added": [node.model_dump(mode="json") for node in added_nodes],
            "removed": [node.model_dump(mode="json") for node in removed_nodes],
            "changed": [node.model_dump(mode="json") for node in changed_nodes],
        },
        "edges": {
            "added": [edge.model_dump(mode="json") for edge in added_edges],
            "removed": [edge.model_dump(mode="json") for edge in removed_edges],
        },
    }
