from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.helpers import get_current_user, require_permission
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from events.enums import ActionType, TriggerableEvent
from events.queue import ActionQueue
from typings import Permission

router = APIRouter(prefix="/api", tags=["trigger-rules"])


def _repo() -> TriggerRuleRepo:
    return TriggerRuleRepo()


def _get_queue() -> ActionQueue:
    return ActionQueue.get_instance()


# ───────── Pydantic Schemas ─────────


class CreateRuleBody(BaseModel):
    event_type: str
    name: str
    description: str | None = None
    enabled: bool = True
    priority: int = 0


class UpdateRuleBody(BaseModel):
    event_type: str | None = None
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    priority: int | None = None


class ToggleRuleBody(BaseModel):
    enabled: bool


class CreateActionBody(BaseModel):
    action_type: str
    payload: dict
    duration: int = -1
    cumulative: bool = False
    sort_order: int = 0


class UpdateActionBody(BaseModel):
    action_type: str | None = None
    payload: dict | None = None
    duration: int | None = None
    cumulative: bool | None = None
    sort_order: int | None = None


def _serialize_queue_item(item) -> dict:
    return {
        "id": item.id,
        "action_type": item.action_type.value,
        "payload": item.payload,
        "duration": item.duration,
        "cumulative": item.cumulative,
        "priority": item.priority,
        "status": item.status.value,
        "origin": item.origin,
        "display_name": item.display_name,
        "elapsed": item.elapsed,
        "trigger_action_id": item.trigger_action_id,
        "trigger_rule_id": item.trigger_rule_id,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "started_at": item.started_at.isoformat() if item.started_at else None,
    }


# ───────── Queue Control endpoints ─────────


@router.get("/queue")
async def get_queue(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Get current queue state."""
    queue = _get_queue()
    items = queue.get_items()
    return {
        **queue.get_status(),
        "items": [_serialize_queue_item(i) for i in items],
    }


@router.post("/queue/cancel/{item_id}")
async def cancel_queue_item(
    item_id: str,
    current_user: dict = Depends(require_permission(Permission.WRITE_UNITS)),
):
    """Cancel a specific item in the queue."""
    queue = _get_queue()
    success = await queue.cancel(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return {"status": "ok"}


@router.post("/queue/cancel-all")
async def cancel_all_queue(
    current_user: dict = Depends(require_permission(Permission.WRITE_UNITS)),
):
    """Cancel all items in the queue."""
    queue = _get_queue()
    count = await queue.cancel_all()
    return {"status": "ok", "cancelled": count}


@router.post("/queue/pause")
async def pause_queue(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Pause queue processing."""
    queue = _get_queue()
    queue.pause()
    return {"status": "ok", "paused": True}


@router.post("/queue/resume")
async def resume_queue(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    """Resume queue processing."""
    queue = _get_queue()
    queue.resume()
    return {"status": "ok", "paused": False}


# ───────── Event Reference endpoints ─────────


@router.get("/events/types")
async def list_event_types(current_user: dict = Depends(get_current_user)):
    """List all available triggerable event types."""
    return [{"value": e.value, "name": e.name} for e in TriggerableEvent]


@router.get("/events/action-types")
async def list_action_types(current_user: dict = Depends(get_current_user)):
    """List all action types with their expected payload schemas."""
    schemas = {
        ActionType.PROFILE: {
            "profile": "string (A-J or X for random)",
            "level_pct": "integer (percentage, default 100)",
        },
        ActionType.LEVEL: {
            "units": "string (e.g. '123', '12RM', '23RO')",
            "channels": "string (e.g. 'AB', 'ABRM')",
            "operation": "string (prefix: '', '+', '-', '%+', '%-')",
            "value": "string (level value, e.g. '30', '+10')",
        },
        ActionType.MULT: {
            "target": "string (usage name or 'all')",
            "pct": "integer (percentage to add/subtract)",
            "random": "boolean (randomize between 0 and pct)",
        },
        ActionType.CHASTER_TIME_UPDATE: {
            "duration_minutes": "integer (positive to add, negative to remove)",
            "only_max": "boolean (only update max, not current time)",
        },
    }

    return [
        {"value": t.value, "name": t.name, "payload_schema": schemas.get(t, {})}
        for t in ActionType
    ]
