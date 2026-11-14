"""Compile a trigger rule or a flow spec into a small operation list."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from events.conditions import ConditionSpec
from events.modifiers import validate_modifier

from .spec import CompiledFlow, CompiledOp, FlowEdge, FlowNode, FlowSpec


def _action_type(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _compile_action(action: Any) -> dict[str, Any]:
    modifiers: list[dict[str, Any]] = []
    for raw in getattr(action, "modifiers", []) or []:
        try:
            modifiers.append(
                validate_modifier(raw).model_dump(mode="json")
            )
        except Exception:
            # Invalid modifiers are ignored at execution time too; keep the
            # compiler permissive and surface a warning via the caller.
            continue
    return {
        "action_type": _action_type(action.action_type),
        "payload": dict(action.payload or {}),
        "duration": int(action.duration),
        "cumulative": bool(action.cumulative),
        "modifiers": modifiers,
    }


def compile_trigger_rule(
    rule: Any,
    event_types: list[str],
) -> tuple[FlowSpec, CompiledFlow]:
    """Build the linear flow graph for a trigger rule and compile it."""

    nodes: list[FlowNode] = [
        FlowNode(
            id="trigger",
            type="trigger.event",
            config={"event_types": list(event_types)},
        )
    ]
    edges: list[FlowEdge] = []
    warnings: list[str] = []

    previous = "trigger"
    for index, raw_condition in enumerate(getattr(rule, "conditions", []) or []):
        try:
            condition = ConditionSpec.model_validate(raw_condition)
        except Exception as exc:
            warnings.append(f"condition {index} is invalid: {exc}")
            continue
        node_id = f"condition_{index}"
        nodes.append(
            FlowNode(
                id=node_id,
                type="logic.guard",
                config={
                    "condition": condition.model_dump(mode="json"),
                    "mode": getattr(rule, "condition_mode", "all") or "all",
                },
            )
        )
        edges.append(FlowEdge(source=previous, target=node_id))
        previous = node_id

    actions = list(getattr(rule, "actions", []) or [])
    if not actions:
        warnings.append("flow has no actions")

    for index, action in enumerate(actions):
        try:
            config = _compile_action(action)
        except Exception as exc:
            warnings.append(f"action {index} is invalid: {exc}")
            continue
        node_id = f"action_{index}"
        nodes.append(FlowNode(id=node_id, type="effect.action", config=config))
        edges.append(FlowEdge(source=previous, target=node_id))

    spec = FlowSpec(
        id=f"flow:{getattr(rule, 'id', 'draft')}",
        name=getattr(rule, "name", "Flow"),
        nodes=nodes,
        edges=edges,
        variables={},
        created_from=getattr(rule, "id", None),
    )
    compiled = compile_flow_spec(spec)
    compiled.warnings = warnings + compiled.warnings
    return spec, compiled


def compile_flow_spec(spec: FlowSpec) -> CompiledFlow:
    """Topologically compile a flow spec into `match/eval/emit` operations."""

    warnings: list[str] = []
    nodes = [FlowNode.model_validate(raw) for raw in spec.nodes]
    by_id = {node.id: node for node in nodes}
    if len(by_id) != len(nodes):
        warnings.append("duplicate node ids")

    adjacency: dict[str, list[str]] = defaultdict(list)
    indegree: dict[str, int] = {node.id: 0 for node in nodes}
    for raw_edge in spec.edges:
        edge = (
            raw_edge
            if isinstance(raw_edge, FlowEdge)
            else FlowEdge.model_validate(raw_edge)
        )
        if edge.source not in by_id or edge.target not in by_id:
            warnings.append(f"edge references an unknown node: {edge.source}->{edge.target}")
            continue
        adjacency[edge.source].append(edge.target)
        indegree[edge.target] += 1

    queue = deque([node.id for node in nodes if indegree[node.id] == 0])
    ordered: list[str] = []
    while queue:
        node_id = queue.popleft()
        ordered.append(node_id)
        for target in adjacency[node_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    if len(ordered) != len(spec.nodes):
        warnings.append("flow contains a cycle; using declaration order")
        ordered = [node.id for node in spec.nodes]

    ops: list[CompiledOp] = []
    for node_id in ordered:
        node = by_id[node_id]
        if node.type == "trigger.event":
            event_types = node.config.get("event_types") or []
            ops.append(
                CompiledOp(
                    op="match_event",
                    node_id=node.id,
                    config={"event_types": list(event_types)},
                )
            )
        elif node.type == "logic.guard":
            config = node.config or {}
            condition = config.get("condition")
            mode = config.get("mode", "all")
            if not condition:
                warnings.append(f"guard {node.id} has no condition")
                continue
            try:
                condition = ConditionSpec.model_validate(condition).model_dump(mode="json")
            except Exception as exc:
                warnings.append(f"guard {node.id} is invalid: {exc}")
                continue
            ops.append(
                CompiledOp(
                    op="eval_condition",
                    node_id=node.id,
                    config={"condition": condition, "mode": mode},
                )
            )
        elif node.type == "effect.action":
            config = node.config or {}
            if not config.get("action_type"):
                warnings.append(f"action {node.id} has no action_type")
                continue
            ops.append(CompiledOp(op="emit_action", node_id=node.id, config=config))
        elif node.type == "flow.call":
            config = node.config or {}
            if not config.get("rule_id"):
                warnings.append(f"subflow {node.id} has no rule_id")
                continue
            ops.append(CompiledOp(op="call_flow", node_id=node.id, config=config))
        else:
            warnings.append(f"unknown node type: {node.type}")

    return CompiledFlow(
        flow_id=spec.id,
        flow_version=spec.version,
        ops=ops,
        warnings=warnings,
    )
