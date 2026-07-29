"""
WebSocket endpoint (`/ws`) and the command handler registry.
"""

import asyncio
import json

import jwt
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.helpers.jwt_helpers import ALGORITHM, SECRET_KEY
from api.ws.commands import (
    handle_bt_sensors_rescan,
    handle_bt_sensors_update,
    handle_mk2bt_rescan,
    handle_mk2bt_update,
    handle_sensors_update,
    handle_stop,
    handle_trigger_rule_create,
    handle_trigger_rule_delete,
    handle_trigger_rule_edit,
    handle_trigger_rule_update,
    handle_update_adj,
    handle_update_level,
    handle_update_mode,
    handle_update_power_mode,
)
from api.ws.schema import WS_SCHEMA_VERSION
from api.ws.websocket_notifier import ws_notifier
from events.queue import ActionQueue
from store import Store
from typings import Permission

logger = structlog.get_logger("pes")

store = Store()

router = APIRouter()

HANDLERS = {
    "core:stop": (handle_stop, Permission.WRITE_UNITS),
    "hardware:update_mk2bt": (handle_mk2bt_update, Permission.WRITE_UNITS),
    "hardware:rescan_mk2bt": (handle_mk2bt_rescan, Permission.WRITE_UNITS),
    "hardware:update_bt_sensors": (handle_bt_sensors_update, Permission.WRITE_SENSORS),
    "hardware:rescan_bt_sensors": (handle_bt_sensors_rescan, Permission.WRITE_SENSORS),
    "sensors:update": (handle_sensors_update, Permission.WRITE_SENSORS),
    "units:update_level": (handle_update_level, Permission.WRITE_UNITS),
    "units:update_mode": (handle_update_mode, Permission.WRITE_UNITS),
    "units:update_power_mode": (handle_update_power_mode, Permission.WRITE_UNITS),
    "units:update_adj": (handle_update_adj, Permission.WRITE_UNITS),
    "trigger_rules:update": (handle_trigger_rule_update, Permission.ADMIN),
    "trigger_rules:create": (handle_trigger_rule_create, Permission.ADMIN),
    "trigger_rules:edit": (handle_trigger_rule_edit, Permission.ADMIN),
    "trigger_rules:delete": (handle_trigger_rule_delete, Permission.ADMIN),
}


# WebSocket API
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    user_id = None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        # connect User to WebSocket
        await store.websocket.connect(user_id, websocket)

        # Send initial connection message
        await websocket.send_json(
            {
                "type": "connected",
                "payload": {
                    "message": "WebSocket connected successfully",
                    "userId": user_id,
                    "schemaVersion": WS_SCHEMA_VERSION,
                },
            }
        )

        await websocket.send_json(
            {"type": "sensors:init", "payload": store.get_all_sensors_settings()}
        )

        await websocket.send_json(
            {"type": "units:init", "payload": store.get_all_units_settings()}
        )

        await websocket.send_json(
            {"type": "hardware:init", "payload": store.get_hardware_settings()}
        )

        # Replay the last 250 triggered events to the newly connected client
        await ws_notifier.send_history(user_id, store.websocket)

        # Load datas
        await ws_notifier.load_datas(user_id, store.websocket)

        # Heartbeat and Message handling
        while True:
            try:
                # Wait for messages from client with timeout
                text = await asyncio.wait_for(websocket.receive_text(), timeout=60)

                message = json.loads(text)
                if message.get("type") != "ping":
                    print(f"📨 Received: {json.dumps(message, indent=2)}")

                msg_id = message.get("id")
                msg_type = message.get("type")
                msg_payload = message.get("payload")

                """
                    Reply to ping for keepalive
                """
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                # TODO: remove after trigger rule/events update
                if msg_type == "core:stop":
                    await ActionQueue.get_instance().cancel_all()

                # fetch command to use
                handler_tuple = HANDLERS.get(msg_type)

                # has registered command
                if handler_tuple:
                    handler_fn, required_permission = handler_tuple

                    # user has permission to execute command
                    if store.check_permission(user_id, required_permission):
                        result = await handler_fn(msg_payload, ws_notifier)

                        # answer command ok/error
                        await websocket.send_json(
                            {
                                "id": msg_id,
                                "type": "command",
                                "payload": result,
                            }
                        )
                    else:
                        await websocket.send_json(
                            {
                                "id": msg_id,
                                "type": "command",
                                "payload": {
                                    "status": "error",
                                    "message": f"Missing permission: {required_permission.name}",
                                },
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
        logger.info(f"🔴 Client disconnected: {user_id}", user_id=user_id)

    except Exception:
        logger.exception(f"🔴 WebSocket error for {user_id}", user_id=user_id)

    finally:
        if user_id:
            store.websocket.disconnect(user_id)
