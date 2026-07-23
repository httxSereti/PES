import structlog

from api.ws.websocket_notifier import WebSocketNotifier
from api.ws.loaders.trigger_rules_loader import _serialize_rule
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from events.enums import ActionType

logger = structlog.get_logger("pes")


async def handle_trigger_rule_create(
    payload: dict, ws_notifier: WebSocketNotifier
) -> dict:
    """
    Create a new TriggerRule together with its actions.

    Expected payload:
        {
            "name": str,
            "description": str | None,
            "event_type": str,
            "enabled": bool,
            "priority": int,
            "actions": [
                {
                    "action_type": str,
                    "payload": dict,
                    "duration": int,
                    "cumulative": bool,
                    "sort_order": int,
                },
                ...
            ],
            "labels": [str, ...],  # label names, existing reused / new created
        }
    """
    name = payload.get("name")
    event_type = payload.get("event_type")
    actions = payload.get("actions", [])
    labels = payload.get("labels", [])

    if not name or not event_type:
        return {"status": "error", "message": "Missing name or event_type"}

    # Validate action types up front so we don't create a half-built rule
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

        rule = await repo.create_rule(
            event_type=event_type,
            name=name,
            description=payload.get("description"),
            enabled=payload.get("enabled", True),
            priority=payload.get("priority", 0),
        )

        for index, action in enumerate(actions):
            await repo.create_action(
                trigger_rule_id=rule.id,
                action_type=action["action_type"],
                payload=action.get("payload", {}),
                duration=action.get("duration", -1),
                cumulative=action.get("cumulative", False),
                sort_order=action.get("sort_order", index),
            )

        # Resolve labels by name (reuse existing, create missing) and attach
        created_labels = await repo.set_labels_for_rule(rule.id, labels)

        # Re-fetch with actions + labels eagerly loaded for serialization
        full_rule = await repo.get_rule(rule.id)
        serialized = _serialize_rule(full_rule)

    except KeyError:
        logger.exception(
            "[WS|trigger_rules:create] Failed to create TriggerRule",
            name=name,
            event_type=event_type,
        )
        return {"status": "error", "message": "Can't create TriggerRule! (KeyError)"}

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

    # Broadcast to every client so their lists stay in sync
    ws_notifier.notify("trigger_rules:create", {"rule": serialized})

    logger.info(
        "[WS|trigger_rules:create] Created TriggerRule",
        trigger_rule_id=rule.id,
        actions=len(actions),
    )

    return {"status": "ok", "rule": serialized}
