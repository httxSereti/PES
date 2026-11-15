"""Canvas graph API: load, apply, version and diff trigger-rule flows."""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.helpers import require_permission, to_utc_iso
from api.ws.loaders.trigger_rules_loader import _serialize_rule
from api.ws.websocket_notifier import ws_notifier
from database.repositories.trigger_rule_graph_repo import TriggerRuleGraphRepo
from database.repositories.trigger_rule_repo import (
    TriggerActionSpec,
    TriggerRuleRepo,
    rule_event_types,
)
from events.dispatcher import EventDispatcher
from events.flows import (
    FlowSpec,
    GraphValidationError,
    compile_flow_spec,
    compile_graph,
    diff_graphs,
    ensure_positions,
    graph_event_types,
    graph_from_rule,
    validate_graph,
)
from typings import Permission

logger = structlog.get_logger("pes")

router = APIRouter(prefix="/api/events", tags=["flow-graphs"])


class GraphSaveRequest(BaseModel):
    graph: FlowSpec
    apply: bool = True
    message: str | None = None


class ManualRunRequest(BaseModel):
    event_data: dict[str, Any] = Field(default_factory=dict)


def _current_graph(rule: Any, *, from_rule: bool) -> tuple[FlowSpec, bool, list[str]]:
    warnings: list[str] = []
    if not from_rule and rule.graph:
        try:
            return ensure_positions(FlowSpec.model_validate(rule.graph)), True, warnings
        except Exception as exc:
            warnings.append(f"saved graph is invalid, rebuilt from rule: {exc}")
    return graph_from_rule(rule, rule_event_types(rule)), False, warnings


async def _load_subflows(graph: FlowSpec) -> dict[str, Any]:
    subflows: dict[str, Any] = {}
    for node in graph.nodes:
        if node.type != "flow.call":
            continue
        rule_id = str((node.config or {}).get("rule_id") or "")
        if not rule_id or rule_id in subflows:
            continue
        subflow = await TriggerRuleRepo().get_rule(rule_id)
        if subflow is not None:
            subflows[rule_id] = subflow
    return subflows


def _notify_rule_update(rule_id: str, updated: Any) -> None:
    serialized = _serialize_rule(updated)
    ws_notifier.notify(
        "trigger_rules:update",
        {
            "id": rule_id,
            "changes": {
                key: value for key, value in serialized.items() if key != "id"
            },
        },
    )


async def _apply_graph(
    rule_id: str,
    graph: FlowSpec,
    *,
    created_by: str | None,
) -> dict[str, Any]:
    rule = await TriggerRuleRepo().get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    warnings = validate_graph(graph)
    event_types = graph_event_types(graph)
    if not event_types:
        if any(
            node.type in {"trigger.manual", "trigger.schedule"}
            for node in graph.nodes
        ):
            event_types = ["system.manual"]
        else:
            raise HTTPException(
                status_code=400,
                detail="the graph trigger needs at least one event type",
            )

    subflows = await _load_subflows(graph)
    try:
        plan = compile_graph(graph, subflows=subflows, strict=True)
    except GraphValidationError as exc:
        # Branches, switches and non-linear DAGs cannot be represented as a
        # legacy TriggerRule. Keep the legacy actions as a fallback and let
        # the native FlowSpec runtime execute the saved graph.
        warnings.append(f"graph saved as runtime-only: {exc}")
        updated = await TriggerRuleRepo().update_rule(
            rule_id, event_types=event_types
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        _notify_rule_update(rule_id, updated)
        graph.created_from = rule_id
        saved = await TriggerRuleGraphRepo().save_graph(
            rule_id,
            graph.model_dump(mode="json"),
            created_by=created_by,
        )
        if saved is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        compiled = compile_flow_spec(graph)
        return {
            "graph": graph.model_dump(mode="json"),
            "version": saved.version,
            "applied": False,
            "runtime_only": True,
            "warnings": [*warnings, *compiled.warnings],
            "compiled": compiled.model_dump(mode="json"),
        }

    specs = [
        TriggerActionSpec(
            action_type=action.action_type,
            payload=action.payload,
            duration=action.duration,
            cumulative=action.cumulative,
            sort_order=action.sort_order,
            modifiers=action.modifiers,
        )
        for action in plan.actions
    ]
    updated, _ = await TriggerRuleRepo().replace_rule_with_actions(
        rule_id=rule_id,
        event_types=plan.event_types,
        name=rule.name,
        description=rule.description,
        enabled=rule.enabled,
        priority=rule.priority,
        actions=specs,
        labels=[label.name for label in rule.labels],
        conditions=plan.conditions,
        condition_mode=rule.condition_mode or "all",
        cooldown_seconds=rule.cooldown_seconds or 0,
        window_count=rule.window_count or 0,
        window_seconds=rule.window_seconds or 0,
        budget_count=rule.budget_count or 0,
        budget_window_seconds=rule.budget_window_seconds or 3600,
        budget_per_actor=bool(rule.budget_per_actor),
        requires_approval=bool(rule.requires_approval),
        approval_timeout_seconds=rule.approval_timeout_seconds or 300,
        notify_on_fire=bool(rule.notify_on_fire),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    _notify_rule_update(rule_id, updated)

    graph.created_from = rule_id
    saved = await TriggerRuleGraphRepo().save_graph(
        rule_id,
        graph.model_dump(mode="json"),
        created_by=created_by,
    )
    if saved is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    compiled = compile_flow_spec(graph)
    return {
        "graph": graph.model_dump(mode="json"),
        "version": saved.version,
        "applied": True,
        "runtime_only": False,
        "warnings": [*plan.warnings, *compiled.warnings],
        "compiled": compiled.model_dump(mode="json"),
    }


@router.get("/rules/{rule_id}/graph")
async def get_rule_graph(
    rule_id: str,
    from_rule: bool = Query(default=False),
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Saved canvas graph, or a graph rebuilt from the current rule."""
    rule = await TriggerRuleRepo().get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    graph, saved, warnings = _current_graph(rule, from_rule=from_rule)
    compiled = compile_flow_spec(graph)
    return {
        "graph": graph.model_dump(mode="json"),
        "version": int(rule.graph_version or 0),
        "saved": saved,
        "warnings": [*warnings, *compiled.warnings],
        "compiled": compiled.model_dump(mode="json"),
    }


@router.put("/rules/{rule_id}/graph")
async def save_rule_graph(
    rule_id: str,
    body: GraphSaveRequest,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """
    Validate a canvas graph, optionally apply it to the rule, and snapshot it.

    Applying a graph rewrites the rule's event types, conditions and actions.
    Other rule fields (cooldown, budgets, approvals, labels, priority) are
    preserved. Sub-flow calls inline the referenced rule's conditions/actions.
    """
    if not body.apply:
        warnings = validate_graph(body.graph)
        runtime_only = False
        try:
            plan = compile_graph(
                body.graph,
                subflows=await _load_subflows(body.graph),
                strict=True,
            )
            warnings.extend(plan.warnings)
        except GraphValidationError as exc:
            runtime_only = True
            warnings.append(f"graph saved as runtime-only: {exc}")
        saved = await TriggerRuleGraphRepo().save_graph(
            rule_id,
            body.graph.model_dump(mode="json"),
            created_by=str(current_user.get("id") or ""),
        )
        if saved is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        compiled = compile_flow_spec(body.graph)
        return {
            "graph": body.graph.model_dump(mode="json"),
            "version": saved.version,
            "applied": False,
            "runtime_only": runtime_only,
            "warnings": [*warnings, *compiled.warnings],
            "compiled": compiled.model_dump(mode="json"),
        }
    return await _apply_graph(
        rule_id,
        body.graph,
        created_by=str(current_user.get("id") or ""),
    )


@router.post("/rules/{rule_id}/run")
async def run_rule_manually(
    rule_id: str,
    body: ManualRunRequest,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Execute a rule's FlowSpec through a manual/schedule trigger."""
    try:
        dispatcher = EventDispatcher.get_instance()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Event dispatcher not initialized")
    result = await dispatcher.run_rule_manual(
        rule_id,
        event_data=body.event_data,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result


@router.get("/rules/{rule_id}/versions")
async def list_rule_graph_versions(
    rule_id: str,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    rule = await TriggerRuleRepo().get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    versions = await TriggerRuleGraphRepo().list_versions(rule_id)
    return [
        {
            "id": row.id,
            "version": row.version,
            "created_at": to_utc_iso(row.created_at),
            "created_by": row.created_by,
            "nodes": len((row.graph or {}).get("nodes") or []),
            "current": row.version == int(rule.graph_version or 0),
        }
        for row in versions
    ]


@router.get("/rules/{rule_id}/versions/{version}")
async def get_rule_graph_version(
    rule_id: str,
    version: int,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    row = await TriggerRuleGraphRepo().get_version(rule_id, version)
    if row is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return {
        "version": row.version,
        "created_at": to_utc_iso(row.created_at),
        "created_by": row.created_by,
        "graph": row.graph,
    }


@router.get("/rules/{rule_id}/diff")
async def diff_rule_graph_versions(
    rule_id: str,
    from_version: int = Query(...),
    to_version: int | None = Query(default=None),
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Visual diff between two graph versions (or a version and current)."""
    rule = await TriggerRuleRepo().get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    old_row = await TriggerRuleGraphRepo().get_version(rule_id, from_version)
    if old_row is None:
        raise HTTPException(status_code=404, detail="From version not found")
    old_graph = FlowSpec.model_validate(old_row.graph)

    if to_version is None or int(to_version) == int(rule.graph_version or 0):
        new_graph, _, _ = _current_graph(rule, from_rule=False)
        new_label = int(rule.graph_version or 0)
    else:
        new_row = await TriggerRuleGraphRepo().get_version(
            rule_id, int(to_version)
        )
        if new_row is None:
            raise HTTPException(status_code=404, detail="To version not found")
        new_graph = FlowSpec.model_validate(new_row.graph)
        new_label = new_row.version

    diff = diff_graphs(old_graph, new_graph)
    diff["from_version"] = from_version
    diff["to_version"] = new_label
    return {
        "from_version": from_version,
        "to_version": new_label,
        "diff": diff,
        "from_graph": old_graph.model_dump(mode="json"),
        "to_graph": new_graph.model_dump(mode="json"),
    }


@router.post("/rules/{rule_id}/versions/{version}/restore")
async def restore_rule_graph_version(
    rule_id: str,
    version: int,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    row = await TriggerRuleGraphRepo().get_version(rule_id, version)
    if row is None:
        raise HTTPException(status_code=404, detail="Version not found")
    graph = FlowSpec.model_validate(row.graph)
    return await _apply_graph(
        rule_id,
        ensure_positions(graph),
        created_by=str(current_user.get("id") or ""),
    )
