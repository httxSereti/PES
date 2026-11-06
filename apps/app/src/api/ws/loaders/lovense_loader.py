import structlog

from api.ws.websocket_manager import WebSocketManager

logger = structlog.get_logger("pes")


async def lovense_loader(client_id: str, ws_manager: WebSocketManager):
    """Send the Lovense snapshot (nodes, devices, patterns, runs) to a client."""
    from integrations import integration_registry

    integration = integration_registry.get("lovense")
    if integration is None:
        return
    hub = getattr(integration, "hub", None)
    if hub is None:
        return
    snapshot = hub.snapshot()
    await ws_manager.send_personal_message(
        message={"type": "lovense:init", "payload": snapshot},
        client_id=client_id,
    )
    logger.info(
        "[Lovense] Sent snapshot",
        client_id=client_id,
        devices=len(snapshot.get("devices") or []),
        patterns=len(snapshot.get("patterns") or []),
    )
