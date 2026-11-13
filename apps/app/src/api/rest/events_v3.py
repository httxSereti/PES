"""Events v3 REST surface: simulation and rollout status.

Phase 0 is read-only: simulation evaluates the current rules and returns the
would-be queue items without persisting or enqueueing anything.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.helpers import require_permission
from events.dispatcher import EventDispatcher
from events.envelope import ActorRef
from events.v3 import get_v3_config
from integrations import integration_registry
from typings import Permission

router = APIRouter(prefix="/api", tags=["events-v3"])


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
        "max_workers": config.max_workers,
    }
