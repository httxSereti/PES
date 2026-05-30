import structlog
from api.ws.websocket_manager import WebSocketManager
from database.repositories.trigger_rule_repo import TriggerRuleRepo

logger = structlog.get_logger("pes")


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
        "action_type": action.action_type.value
        if hasattr(action.action_type, "value")
        else action.action_type,
        "payload": action.payload,
        "duration": action.duration,
        "cumulative": action.cumulative,
        "sort_order": action.sort_order,
    }


async def trigger_rules_loader(client_id: str, ws_manager: WebSocketManager):
    """
    Send all trigger rules to a single newly connected client.
    """

    repo = TriggerRuleRepo()
    trigger_rules = await repo.get_all_rules()
    payload = [_serialize_rule(r) for r in trigger_rules]

    await ws_manager.send_personal_message(
        message={"type": "trigger_rules:load", "payload": payload},
        client_id=client_id,
    )
    logger.info(
        f"[WSNotifier] Sent {len(payload)} trigger rules",
        client_id=client_id,
    )
