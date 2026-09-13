import structlog

from api.ws.websocket_manager import WebSocketManager

logger = structlog.get_logger("pes")


async def profiles_loader(client_id: str, ws_manager: WebSocketManager):
    """Send the saved-profile catalog to a single newly connected client."""
    # Lazy import: `store` imports the WS notifier at module level, which
    # imports this loaders package — importing `services` (which imports
    # `store`) at module level here would close a circular import.
    from services import profiles as profiles_service

    profiles = profiles_service.list_profiles()

    await ws_manager.send_personal_message(
        message={"type": "profiles:load", "payload": profiles},
        client_id=client_id,
    )

    logger.info(
        f"[Profiles] Sent {len(profiles)} profiles",
        client_id=client_id,
    )
