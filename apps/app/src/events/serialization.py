"""Serialize queue items for approval persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from events.enums import ActionType
from events.models import QueueItem


def queue_item_to_dict(item: QueueItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "action_type": item.action_type.value,
        "payload": dict(item.payload or {}),
        "duration": item.duration,
        "cumulative": item.cumulative,
        "priority": item.priority,
        "origin": item.origin,
        "display_name": item.display_name,
        "trigger_action_id": item.trigger_action_id,
        "trigger_rule_id": item.trigger_rule_id,
        "applied_modifiers": list(item.applied_modifiers or []),
        "causation_depth": item.causation_depth,
        "created_at": item.created_at.isoformat(),
        "not_before": item.not_before.isoformat() if item.not_before else None,
        "iteration": item.iteration,
        "repeat_count": item.repeat_count,
    }


def queue_item_from_dict(data: dict[str, Any]) -> QueueItem:
    created_at = data.get("created_at")
    not_before = data.get("not_before")
    return QueueItem(
        id=str(data["id"]),
        action_type=ActionType(data["action_type"]),
        payload=dict(data.get("payload") or {}),
        duration=int(data.get("duration", 0)),
        cumulative=bool(data.get("cumulative", False)),
        priority=int(data.get("priority", 0)),
        origin=str(data.get("origin", "")),
        display_name=data.get("display_name"),
        trigger_action_id=data.get("trigger_action_id"),
        trigger_rule_id=data.get("trigger_rule_id"),
        applied_modifiers=list(data.get("applied_modifiers") or []),
        causation_depth=int(data.get("causation_depth", 0)),
        created_at=(
            datetime.fromisoformat(created_at) if created_at else datetime.now()
        ),
        not_before=datetime.fromisoformat(not_before) if not_before else None,
        iteration=int(data.get("iteration", 0)),
        repeat_count=int(data.get("repeat_count", 1)),
    )
