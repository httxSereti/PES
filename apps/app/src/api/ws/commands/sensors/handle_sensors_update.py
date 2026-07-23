import structlog
from store import Store
from api.ws.websocket_notifier import WebSocketNotifier

store = Store()
logger = structlog.get_logger("pes")


async def handle_sensors_update(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Handle sensor update
    """
    try:
        for sensorName, value in payload.items():
            store.update_sensor_fields(sensorName, value)
    except KeyError:
        return {"status": "error", "message": "Can't update Sensor! (KeyError)"}

    logger.info("[WS|sensors:update] Updated Sensors", sensors=payload.keys())

    return {"status": "ok"}
