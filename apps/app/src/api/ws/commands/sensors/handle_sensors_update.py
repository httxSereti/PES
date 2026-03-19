from store import Store
from api.ws.websocket_notifier import WebSocketNotifier

store = Store()


async def handle_sensors_update(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Handle sensor update
    """

    for sensorName, value in payload.items():
        store.update_sensor_fields(sensorName, value)

    return {"status": "ok"}
