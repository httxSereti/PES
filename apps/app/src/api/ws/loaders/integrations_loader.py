import structlog

from api.ws.websocket_manager import WebSocketManager
from integrations import integration_registry

logger = structlog.get_logger("pes")


async def integrations_loader(client_id: str, ws_manager: WebSocketManager) -> None:
    """Send the integrations catalog to a single newly connected client."""
    payload = integration_registry.catalog()

    await ws_manager.send_personal_message(
        message={"type": "integrations:load", "payload": payload},
        client_id=client_id,
    )

    logger.info(
        f"[WSNotifier] Sent {len(payload)} integrations",
        client_id=client_id,
    )
