import structlog

from api.ws.websocket_notifier import WebSocketNotifier
from constants import BT_UNITS
from store import Store

store = Store()
logger = structlog.get_logger("pes")


async def handle_mk2bt_update(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Enable/disable the connexion search of one 2B unit at runtime
    """
    unit_id = payload.get("id")

    if unit_id not in BT_UNITS:
        return {"status": "error", "message": f"Unknown unit: {unit_id}"}

    store.set_hardware_enabled(unit_id, bool(payload.get("enabled")))

    logger.info(
        "[WS|hardware:update_mk2bt] Unit connexion toggled",
        unit_name=unit_id,
        enabled=payload.get("enabled"),
    )

    return {"status": "ok"}


async def handle_bt_sensors_update(
    payload: dict, ws_notifier: WebSocketNotifier
) -> dict:
    """
    Enable/disable the connexion search of one BT sensor at runtime
    """
    sensor_id = payload.get("id")

    if sensor_id not in store.get_all_sensors_settings():
        return {"status": "error", "message": f"Unknown sensor: {sensor_id}"}

    store.set_hardware_enabled(sensor_id, bool(payload.get("enabled")))

    logger.info(
        "[WS|hardware:update_bt_sensors] Sensor connexion toggled",
        sensor_name=sensor_id,
        enabled=payload.get("enabled"),
    )

    return {"status": "ok"}


async def handle_mk2bt_rescan(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Restart the connexion search of one 2B unit
    """
    unit_id = payload.get("id")

    if unit_id not in BT_UNITS:
        return {"status": "error", "message": f"Unknown unit: {unit_id}"}

    store.request_hardware_rescan(unit_id)

    logger.info("[WS|hardware:rescan_mk2bt] Unit rescan requested", unit_name=unit_id)

    return {"status": "ok"}


async def handle_bt_sensors_rescan(
    payload: dict, ws_notifier: WebSocketNotifier
) -> dict:
    """
    Restart the connexion search of one BT sensor
    """
    sensor_id = payload.get("id")

    if sensor_id not in store.get_all_sensors_settings():
        return {"status": "error", "message": f"Unknown sensor: {sensor_id}"}

    store.request_hardware_rescan(sensor_id)

    logger.info(
        "[WS|hardware:rescan_bt_sensors] Sensor rescan requested",
        sensor_name=sensor_id,
    )

    return {"status": "ok"}
