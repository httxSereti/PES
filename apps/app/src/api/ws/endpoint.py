"""
WebSocket endpoint (`/ws`): JWT auth, audience-gated init sequence, and
runtime-validated command dispatch through the @command registry.
"""

import asyncio
import json

import jwt
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from api.helpers.jwt_helpers import ALGORITHM, SECRET_KEY
from api.ws.context import CommandContext
from api.ws.registry import COMMAND_SPECS_BY_TYPE, load_commands
from api.ws.schema import (
    MESSAGE_AUDIENCE,
    WS_SCHEMA_VERSION,
    CommandResult,
    InboundMessage,
)
from api.ws.websocket_notifier import ws_notifier
from hardware.ramp import ramp_manager
from store import Store
from typings import Permission

logger = structlog.get_logger("pes")

store = Store()

router = APIRouter()

# Auto-discover handlers and fill COMMAND_SPECS_BY_TYPE at import time.
load_commands()

_inbound_adapter = TypeAdapter(InboundMessage)


async def _send_init_sequence(websocket: WebSocket, user) -> None:
    """Connect handshake + state dump, each piece gated by its audience."""
    perms = user.get_permissions()

    def allowed(msg_type: str) -> bool:
        audience = MESSAGE_AUDIENCE.get(msg_type)
        return (
            audience is None
            or Permission.HOST in perms
            or audience in perms
        )

    await websocket.send_json(
        {
            "type": "connected",
            "payload": {
                "message": "WebSocket connected successfully",
                "userId": user.id,
                "schemaVersion": WS_SCHEMA_VERSION,
            },
        }
    )

    if allowed("sensors:init"):
        await websocket.send_json(
            {"type": "sensors:init", "payload": store.get_all_sensors_settings()}
        )

    if allowed("units:init"):
        await websocket.send_json(
            {"type": "units:init", "payload": store.get_all_units_settings()}
        )

    if allowed("ramps:init"):
        await websocket.send_json(
            {"type": "ramps:init", "payload": ramp_manager.get_all()}
        )

    if allowed("hardware:init"):
        await websocket.send_json(
            {"type": "hardware:init", "payload": store.get_hardware_settings()}
        )

    # Replay the last 250 triggered events (members only)
    if allowed("events:history"):
        await ws_notifier.send_history(user.id, store.websocket)

    # Live training session snapshot (training readers)
    if allowed("training:init"):
        from services.training import get_live_snapshot

        await websocket.send_json(
            {"type": "training:init", "payload": await get_live_snapshot()}
        )

    # Load trigger rules + labels (admins only)
    if allowed("trigger_rules:load"):
        await ws_notifier.load_datas(user.id, store.websocket)


async def _reply_error(websocket: WebSocket, msg_id: str | None, message: str):
    await websocket.send_json(
        {
            "id": msg_id,
            "type": "command",
            "payload": CommandResult(status="error", message=message).model_dump(
                exclude_none=True
            ),
        }
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    user = None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user = store.get_user(user_id) if user_id else None

        if user is None or not user.is_active:
            await websocket.close(code=4001, reason="Unknown or inactive user")
            return

        # Register the connection with the user's effective permissions
        await store.websocket.connect(user.id, websocket, user.get_permissions())

        await _send_init_sequence(websocket, user)

        # Heartbeat and command handling
        while True:
            try:
                text = await asyncio.wait_for(websocket.receive_text(), timeout=60)

                try:
                    message = _inbound_adapter.validate_python(json.loads(text))
                except (json.JSONDecodeError, ValidationError) as e:
                    logger.warning(
                        "[WS] Rejected malformed inbound message",
                        user_id=user.id,
                        error=str(e),
                    )
                    await _reply_error(websocket, None, "Malformed message")
                    continue

                # Keepalive
                if message.type == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                spec = COMMAND_SPECS_BY_TYPE.get(message.type)
                if spec is None:
                    await _reply_error(
                        websocket, message.id, f"Unknown command: {message.type}"
                    )
                    continue

                if not user.has_permission(spec.permission):
                    await _reply_error(
                        websocket,
                        message.id,
                        f"Missing permission: {spec.permission.name}",
                    )
                    continue

                ctx = CommandContext(user=user, msg_id=message.id, notifier=ws_notifier)
                result = await spec.handler(message, ctx)

                await websocket.send_json(
                    {
                        "id": message.id,
                        "type": "command",
                        "payload": result.model_dump(exclude_none=True),
                    }
                )

            except TimeoutError:
                logger.debug("💓 Sending heartbeat ping")
                await websocket.send_json({"type": "ping"})
                continue

    except jwt.PyJWTError:
        logger.exception("❌ JWT error:")
        await websocket.close(code=4001, reason="Invalid token")

    except WebSocketDisconnect:
        logger.info(f"🔴 Client disconnected: {user and user.id}")

    except Exception:
        logger.exception(f"🔴 WebSocket error for {user and user.id}")

    finally:
        if user:
            store.websocket.disconnect(user.id)
