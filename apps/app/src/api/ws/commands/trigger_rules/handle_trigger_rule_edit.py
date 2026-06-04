import structlog

from api.ws.websocket_notifier import WebSocketNotifier
from api.ws.loaders.trigger_rules_loader import _serialize_rule
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from events.enums import ActionType

logger = structlog.get_logger("pes")


async def handle_trigger_rule_edit(
    payload: dict, ws_notifier: WebSocketNotifier
) -> dict:
    """
    Edit an existing TriggerRule: update its fields and fully replace its
    actions and labels.

    Expected payload (same as create, plus rule_id):
        {
            "rule_id": str,
            "name": str,
            "description": str | None,
            "event_type": str,
            "enabled": bool,
            "priority": int,
            "actions": [ { action_type, payload, duration, cumulative, sort_order }, ... ],
            "labels": [str, ...],
        }
    """
    rule_id = payload.get("rule_id")
    name = payload.get("name")
    event_type = payload.get("event_type")
    actions = payload.get("actions", [])
    labels = payload.get("labels", [])

    if not rule_id:
        return {"status": "error", "message": "Missing rule_id"}
    if not name or not event_type:
        return {"status": "error", "message": "Missing name or event_type"}

    # Validate action types up front so we don't half-rewrite the rule
    for action in actions:
        try:
            ActionType(action.get("action_type"))
        except ValueError:
            return {
                "status": "error",
                "message": f"Invalid action_type. Must be one of: {[t.value for t in ActionType]}",
            }

    try:
        repo = TriggerRuleRepo()

        rule = await repo.update_rule(
            rule_id=rule_id,
            event_type=event_type,
            name=name,
            description=payload.get("description"),
            enabled=payload.get("enabled", True),
            priority=payload.get("priority", 0),
        )
        if not rule:
            return {"status": "error", "message": "Rule not found"}

        # Full replace of actions
        await repo.delete_actions_for_rule(rule_id)
        for index, action in enumerate(actions):
            await repo.create_action(
                trigger_rule_id=rule_id,
                action_type=action["action_type"],
                payload=action.get("payload", {}),
                duration=action.get("duration", -1),
                cumulative=action.get("cumulative", False),
                sort_order=action.get("sort_order", index),
            )

        # Resolve labels by name (reuse existing, create missing) and attach
        created_labels = await repo.set_labels_for_rule(rule_id, labels)

        # Re-fetch with actions + labels eagerly loaded for serialization
        full_rule = await repo.get_rule(rule_id)
        serialized = _serialize_rule(full_rule)

    except KeyError:
        logger.exception(
            "[WS|trigger_rules:edit] Failed to edit TriggerRule",
            trigger_rule_id=rule_id,
        )
        return {"status": "error", "message": "Can't edit TriggerRule! (KeyError)"}

    # Broadcast newly created labels so every client's label picker stays in sync
    for label in created_labels:
        ws_notifier.notify(
            "trigger_rules:create_label",
            {
                "id": label.id,
                "name": label.name,
                "description": label.description,
            },
        )

    # Broadcast the full updated rule so every client's list stays in sync
    ws_notifier.notify(
        "trigger_rules:update",
        {"id": rule_id, "changes": {k: v for k, v in serialized.items() if k != "id"}},
    )

    logger.info(
        "[WS|trigger_rules:edit] Edited TriggerRule",
        trigger_rule_id=rule_id,
        actions=len(actions),
    )

    return {"status": "ok", "rule": serialized}
