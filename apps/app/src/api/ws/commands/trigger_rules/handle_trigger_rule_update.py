import structlog
from store import Store
from api.ws.websocket_notifier import WebSocketNotifier
from database.connection import Database
from database.models import TriggerRule


store = Store()
logger = structlog.get_logger("pes")


async def handle_trigger_rule_update(
    payload: dict, ws_notifier: WebSocketNotifier
) -> dict:
    """
    Handle TriggerRule update
    """
    rule_id = payload.get("rule_id", "")

    try:
        if not rule_id:
            return {"status": "error", "message": "Missing rule id"}

        async with Database.get_instance().session_maker() as session:
            rule = await session.get(TriggerRule, rule_id)

            if not rule:
                return {"status": "error", "message": "Missing rule"}

            name = payload.get("name", None)
            description = payload.get("description", None)
            event_type = payload.get("event_type", None)
            enabled = payload.get("enabled", None)
            priority = payload.get("priority", None)

            if name is not None:
                rule.name = name
            if description is not None:
                rule.description = description
            if enabled is not None:
                rule.enabled = enabled
            if priority is not None:
                rule.priority = priority
            if event_type is not None:
                rule.event_type = event_type

            await session.commit()
            await session.refresh(rule)

        ws_notifier.notify(
            "trigger_rules:update",
            {
                "status": "ok",
                "id": rule_id,
                "partial": True,
                "changes": {k: v for k, v in payload.items() if k != "rule_id"},
            },
        )

        # return {"status": "ok"}

    except KeyError:
        logger.exception(
            "[WS|trigger_rules:update] Failed to update TriggerRule",
            trigger_rule_id=rule_id,
            changes=payload.keys(),
        )

        return {"status": "error", "message": "Can't update TriggerRule! (KeyError)"}

    logger.info(
        "[WS|trigger_rules:update] Updated TriggerRule",
        trigger_rule_id=rule_id,
        changes=payload.keys(),
    )

    return {"status": "ok"}
