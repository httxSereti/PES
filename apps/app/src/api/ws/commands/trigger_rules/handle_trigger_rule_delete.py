import structlog

from api.ws.websocket_notifier import WebSocketNotifier
from database.repositories.trigger_rule_repo import TriggerRuleRepo

logger = structlog.get_logger("pes")


async def handle_trigger_rule_delete(
    payload: dict, ws_notifier: WebSocketNotifier
) -> dict:
    """
    Delete a TriggerRule (and its actions, via cascade).

    Expected payload: { "rule_id": str }
    """
    rule_id = payload.get("rule_id")

    if not rule_id:
        return {"status": "error", "message": "Missing rule_id"}

    deleted = await TriggerRuleRepo().delete_rule(rule_id)

    if not deleted:
        return {"status": "error", "message": "Rule not found"}

    # Broadcast so every client drops it from their list
    ws_notifier.notify("trigger_rules:delete", {"id": rule_id})

    logger.info(
        "[WS|trigger_rules:delete] Deleted TriggerRule",
        trigger_rule_id=rule_id,
    )

    return {"status": "ok", "id": rule_id}
