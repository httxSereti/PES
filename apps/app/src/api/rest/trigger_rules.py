from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.connection import Database
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from events.enums import ActionType, TriggerableEvent
from events.queue import ActionQueue

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


# ───────── Serialization helpers ─────────


def _serialize_rule(rule) -> dict:
    return {
        "id": rule.id,
        "event_type": rule.event_type,
        "name": rule.name,
        "description": rule.description,
        "enabled": rule.enabled,
        "priority": rule.priority,
        "actions": [_serialize_action(a) for a in rule.actions],
    }


def _serialize_action(action) -> dict:
    return {
        "id": action.id,
        "trigger_rule_id": action.trigger_rule_id,
        "action_type": action.action_type.value if hasattr(action.action_type, "value") else action.action_type,
        "payload": action.payload,
        "duration": action.duration,
        "cumulative": action.cumulative,
        "sort_order": action.sort_order,
    }


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


# ───────── TriggerRule endpoints ─────────


@router.get("/trigger-rules")
async def list_rules(event_type: str | None = None):
    """List all trigger rules, optionally filtered by event_type."""
    repo = _repo()
    rules = await repo.get_all_rules(event_type=event_type)
    return [_serialize_rule(r) for r in rules]


@router.get("/trigger-rules/{rule_id}")
async def get_rule(rule_id: str):
    """Get a single trigger rule with its actions."""
    repo = _repo()
    rule = await repo.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _serialize_rule(rule)


@router.post("/trigger-rules", status_code=201)
async def create_rule(body: CreateRuleBody):
    """Create a new trigger rule."""
    repo = _repo()
    rule = await repo.create_rule(
        event_type=body.event_type,
        name=body.name,
        description=body.description,
        enabled=body.enabled,
        priority=body.priority,
    )
    return _serialize_rule(rule)


@router.put("/trigger-rules/{rule_id}")
async def update_rule(rule_id: str, body: UpdateRuleBody):
    """Update a trigger rule."""
    repo = _repo()
    rule = await repo.update_rule(
        rule_id=rule_id,
        event_type=body.event_type,
        name=body.name,
        description=body.description,
        enabled=body.enabled,
        priority=body.priority,
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _serialize_rule(rule)


@router.patch("/trigger-rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, body: ToggleRuleBody):
    """Toggle a trigger rule enabled/disabled."""
    repo = _repo()
    rule = await repo.toggle_rule(rule_id, body.enabled)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _serialize_rule(rule)


@router.delete("/trigger-rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a trigger rule and all its actions."""
    repo = _repo()
    deleted = await repo.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "ok"}


# ───────── TriggerAction endpoints ─────────


@router.post("/trigger-rules/{rule_id}/actions", status_code=201)
async def create_action(rule_id: str, body: CreateActionBody):
    """Add an action to a trigger rule."""
    repo = _repo()

    # Validate rule exists
    rule = await repo.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Validate action_type
    try:
        ActionType(body.action_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action_type. Must be one of: {[t.value for t in ActionType]}",
        )

    action = await repo.create_action(
        trigger_rule_id=rule_id,
        action_type=body.action_type,
        payload=body.payload,
        duration=body.duration,
        cumulative=body.cumulative,
        sort_order=body.sort_order,
    )
    return _serialize_action(action)


@router.put("/trigger-rules/{rule_id}/actions/{action_id}")
async def update_action(rule_id: str, action_id: str, body: UpdateActionBody):
    """Update an action within a trigger rule."""
    repo = _repo()

    if body.action_type:
        try:
            ActionType(body.action_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action_type. Must be one of: {[t.value for t in ActionType]}",
            )

    action = await repo.update_action(
        action_id=action_id,
        action_type=body.action_type,
        payload=body.payload,
        duration=body.duration,
        cumulative=body.cumulative,
        sort_order=body.sort_order,
    )
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return _serialize_action(action)


@router.delete("/trigger-rules/{rule_id}/actions/{action_id}")
async def delete_action(rule_id: str, action_id: str):
    """Delete an action from a trigger rule."""
    repo = _repo()
    deleted = await repo.delete_action(action_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"status": "ok"}


# ───────── Queue Control endpoints ─────────


@router.get("/queue")
async def get_queue():
    """Get current queue state."""
    queue = _get_queue()
    items = queue.get_items()
    return {
        **queue.get_status(),
        "items": [_serialize_queue_item(i) for i in items],
    }


@router.post("/queue/cancel/{item_id}")
async def cancel_queue_item(item_id: str):
    """Cancel a specific item in the queue."""
    queue = _get_queue()
    success = await queue.cancel(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return {"status": "ok"}


@router.post("/queue/cancel-all")
async def cancel_all_queue():
    """Cancel all items in the queue."""
    queue = _get_queue()
    count = await queue.cancel_all()
    return {"status": "ok", "cancelled": count}


@router.post("/queue/pause")
async def pause_queue():
    """Pause queue processing."""
    queue = _get_queue()
    queue.pause()
    return {"status": "ok", "paused": True}


@router.post("/queue/resume")
async def resume_queue():
    """Resume queue processing."""
    queue = _get_queue()
    queue.resume()
    return {"status": "ok", "paused": False}


# ───────── Event Reference endpoints ─────────


@router.get("/events/types")
async def list_event_types():
    """List all available triggerable event types."""
    return [{"value": e.value, "name": e.name} for e in TriggerableEvent]


@router.get("/events/action-types")
async def list_action_types():
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
        ActionType.CHASTER_TIME_ADD: {
            "duration_minutes": "integer (minutes to add)",
            "only_max": "boolean (only update max, not current time)",
        },
    }

    return [
        {"value": t.value, "name": t.name, "payload_schema": schemas.get(t, {})}
        for t in ActionType
    ]
