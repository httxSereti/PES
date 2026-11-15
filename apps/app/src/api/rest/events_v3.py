"""Events v3 REST surface: simulation and rollout status.

Phase 0 is read-only: simulation evaluates the current rules and returns the
would-be queue items without persisting or enqueueing anything.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.helpers import require_permission, to_utc_iso
from api.ws.websocket_notifier import ws_notifier
from database.repositories.approval_repo import ApprovalRepo
from database.repositories.flow_repo import FlowRepo
from database.repositories.trigger_rule_repo import TriggerRuleRepo, rule_event_types
from database.repositories.triggered_event_repo import TriggeredEventRepo
from events.dispatcher import EventDispatcher
from events.enums import ActionType
from events.envelope import ActorRef
from events.flows import compile_trigger_rule
from events.queue import ActionQueue
from events.redaction import redact_payload
from events.serialization import queue_item_from_dict
from events.v3 import get_v3_config
from integrations import integration_registry
from typings import Permission

router = APIRouter(prefix="/api", tags=["events-v3"])


class DraftActionBody(BaseModel):
    action_type: ActionType
    payload: dict[str, Any] = Field(default_factory=dict)
    duration: int = -1
    cumulative: bool = False
    sort_order: int = 0
    modifiers: list[dict[str, Any]] = Field(default_factory=list)


class DraftRuleBody(BaseModel):
    name: str = "Draft rule"
    description: str | None = None
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    condition_mode: Literal["all", "any"] = "all"
    actions: list[DraftActionBody] = Field(default_factory=list)


class SimulateEventBody(BaseModel):
    event_type: str
    event_data: dict[str, Any] = Field(default_factory=dict)
    origin: str = "simulate"
    actor: ActorRef | None = None
    occurred_at: datetime | None = None
    correlation_id: str | None = None
    causation_id: str | None = None
    dedupe_key: str | None = None
    severity: str = "info"
    tags: list[str] = Field(default_factory=list)
    chain_depth: int = 0
    source_integration_id: str | None = None
    draft_rule: DraftRuleBody | None = None


def _dispatcher() -> EventDispatcher:
    try:
        return EventDispatcher.get_instance()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503, detail="Event dispatcher is not initialized"
        ) from exc


@router.post("/events/simulate")
async def simulate_event(
    body: SimulateEventBody,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """
    Dry-run an event against the current trigger rules.

    The response contains the canonical envelope, the matched rules, the
    resolved actions and a skip reason. It never touches the queue or the
    database, so it is safe to call while a session is running.
    """
    if not body.event_type.startswith("custom:") and integration_registry.get_event(
        body.event_type
    ) is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown event type '{body.event_type}'",
        )

    return await _dispatcher().simulate(
        event_type=body.event_type,
        event_data=body.event_data,
        origin=body.origin,
        actor=body.actor,
        occurred_at=body.occurred_at,
        correlation_id=body.correlation_id,
        causation_id=body.causation_id,
        dedupe_key=body.dedupe_key,
        severity=body.severity,
        tags=body.tags,
        chain_depth=body.chain_depth,
        source_integration_id=body.source_integration_id,
        draft_rule=body.draft_rule.model_dump() if body.draft_rule else None,
    )


@router.get("/events/v3/status")
async def events_v3_status(
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Expose the rollout flags so the UI and support can inspect them."""
    config = get_v3_config()
    return {
        "enabled": config.enabled,
        "shadow_mode": config.shadow_mode,
        "telemetry": config.telemetry,
        "scheduler": config.scheduler,
        "dedupe_ttl_seconds": config.dedupe_ttl_seconds,
        "retention_days": config.retention_days,
        "max_workers": config.max_workers,
    }


def _serialize_run(run, *, details: bool = False) -> dict[str, Any]:
    payload = {
        "id": run.id,
        "event_id": run.event_id,
        "flow_id": run.flow_id,
        "flow_version": run.flow_version,
        "status": run.status,
        "trigger_node_id": run.trigger_node_id,
        "correlation_id": run.correlation_id,
        "causation_id": run.causation_id,
        "started_at": to_utc_iso(run.started_at),
        "finished_at": to_utc_iso(run.finished_at),
        "latency_ms": run.latency_ms,
        "error": run.error,
        "trace": run.trace,
    }
    if details:
        payload["node_runs"] = [
            {
                "id": node.id,
                "node_id": node.node_id,
                "node_type": node.node_type,
                "status": node.status,
                "iteration": node.iteration,
                "started_at": to_utc_iso(node.started_at),
                "duration_ms": node.duration_ms,
                "input_preview": node.input_preview,
                "output_preview": node.output_preview,
                "reason": node.reason,
                "error": node.error,
            }
            for node in run.node_runs
        ]
        payload["effects"] = [
            {
                "id": effect.id,
                "node_id": effect.node_id,
                "effect_kind": effect.effect_kind,
                "target": effect.target,
                "params_before": effect.params_before,
                "params_after": effect.params_after,
                "modifiers": effect.modifiers,
                "clamp": effect.clamp,
                "blocked_reason": effect.blocked_reason,
                "status": effect.status,
                "queue_item_id": effect.queue_item_id,
                "idempotency_key": effect.idempotency_key,
                "created_at": to_utc_iso(effect.created_at),
                "applied_at": to_utc_iso(effect.applied_at),
                "reversed_at": to_utc_iso(effect.reversed_at),
            }
            for effect in run.effects
        ]
    return payload


@router.get("/events/flows/{rule_id}/spec")
async def get_flow_spec(
    rule_id: str,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Compile a trigger rule into the serializable FlowSpec graph."""
    rule = await TriggerRuleRepo().get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    spec, compiled = compile_trigger_rule(rule, rule_event_types(rule))
    return {
        "spec": spec.model_dump(mode="json"),
        "compiled": compiled.model_dump(mode="json"),
    }


@router.get("/events/runs")
async def list_flow_runs(
    event_id: str | None = None,
    flow_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """List recent flow runs, newest first."""
    runs = await FlowRepo().list_runs(
        event_id=event_id,
        flow_id=flow_id,
        limit=limit,
        offset=offset,
    )
    return [_serialize_run(run) for run in runs]


@router.get("/events/runs/{run_id}")
async def get_flow_run(
    run_id: str,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Full trace for one flow run: nodes + effect ledger."""
    run = await FlowRepo().get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Flow run not found")
    return _serialize_run(run, details=True)


@router.get("/events/{event_id}/trace")
async def get_event_trace(
    event_id: str,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Event envelope + all flow runs generated for it."""
    event = await TriggeredEventRepo().get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    runs = await FlowRepo().list_runs(event_id=event_id, limit=100)
    return {
        "event": {
            "id": event.id,
            "event_type": event.event_type,
            "origin": event.origin,
            "event_data": event.event_data,
            "triggered_at": to_utc_iso(event.triggered_at),
            "triggered_rules": event.triggered_rules,
            "source": event.source,
            "actor_id": event.actor_id,
            "correlation_id": event.correlation_id,
            "causation_id": event.causation_id,
            "severity": event.severity,
            "tags": event.tags,
            "version": event.version,
        },
        "runs": [_serialize_run(run) for run in runs],
    }


@router.post("/events/{event_id}/replay")
async def replay_event(
    event_id: str,
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """Dry-run the persisted event against the current rules."""
    event = await TriggeredEventRepo().get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    result = await _dispatcher().simulate(
        event_type=event.event_type,
        event_data=event.event_data or {},
        origin="replay",
        correlation_id=event.correlation_id,
        causation_id=event.id,
        dedupe_key=event.dedupe_key,
        severity=event.severity or "info",
        tags=event.tags or [],
    )
    result["replay_of"] = event.id
    return result


def _redacted_approval_action(item: dict) -> dict:
    action_type = str(item.get("action_type") or "")
    definition = integration_registry.get_action(action_type)
    return {
        "action_type": item.get("action_type"),
        "display_name": item.get("display_name"),
        "duration": item.get("duration"),
        "cumulative": item.get("cumulative"),
        "payload": redact_payload(
            item.get("payload") or {},
            definition.secret_fields if definition else (),
        ),
    }


def _serialize_approval(request) -> dict[str, Any]:
    return {
        "id": request.id,
        "event_id": request.event_id,
        "rule_id": request.rule_id,
        "rule_name": request.rule_name,
        "status": request.status,
        "actions": [
            _redacted_approval_action(item) for item in (request.items or [])
        ],
        "summary": request.summary,
        "requested_at": to_utc_iso(request.requested_at),
        "expires_at": to_utc_iso(request.expires_at),
        "resolved_at": to_utc_iso(request.resolved_at),
        "resolved_by": request.resolved_by,
        "reason": request.reason,
    }


def _expired(request) -> bool:
    expires = request.expires_at
    if expires is None:
        return False
    now = datetime.now(UTC)
    if expires.tzinfo is None:
        now = now.replace(tzinfo=None)
    return expires < now


class ApprovalDecision(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.get("/events/approvals")
async def list_approvals(
    status: Literal["pending", "approved", "rejected", "expired"] | None = "pending",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_permission(Permission.READ_EVENTS)),
):
    """List approval requests, pending first. Expired requests are swept lazily."""
    repo = ApprovalRepo()
    await repo.expire_stale()
    requests = await repo.list(status=status, limit=limit, offset=offset)
    return [_serialize_approval(request) for request in requests]


@router.post("/events/approvals/{request_id}/approve")
async def approve_request(
    request_id: str,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Approve a pending request and enqueue its deferred actions."""
    repo = ApprovalRepo()
    request = await repo.get(request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if request.status == "expired" or _expired(request):
        await repo.resolve(request_id, status="expired", reason="timeout")
        raise HTTPException(status_code=410, detail="Approval request expired")
    if request.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Approval request is already {request.status}",
        )

    try:
        queue = ActionQueue.get_instance()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Action queue not initialized")

    try:
        items = [queue_item_from_dict(raw) for raw in (request.items or [])]
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Approval payload is no longer valid: {exc}",
        )
    updated = await repo.resolve(
        request_id,
        status="approved",
        resolved_by=str(current_user.get("id") or ""),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if items:
        queue.enqueue(items)
    ws_notifier.notify(
        "approvals:update",
        {"status": "ok", "id": request_id, "action": "approved"},
    )
    return _serialize_approval(updated)


@router.post("/events/approvals/{request_id}/reject")
async def reject_request(
    request_id: str,
    decision: ApprovalDecision,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Reject a pending request. Its actions are never enqueued."""
    repo = ApprovalRepo()
    request = await repo.get(request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if request.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Approval request is already {request.status}",
        )
    updated = await repo.resolve(
        request_id,
        status="rejected",
        resolved_by=str(current_user.get("id") or ""),
        reason=decision.reason,
    )
    ws_notifier.notify(
        "approvals:update",
        {"status": "ok", "id": request_id, "action": "rejected"},
    )
    return _serialize_approval(updated)
