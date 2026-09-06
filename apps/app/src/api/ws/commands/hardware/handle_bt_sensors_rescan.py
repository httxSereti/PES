import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, HardwareRescanBtSensorsCommand
from store import Store
from typings import Permission

store = Store()
logger = structlog.get_logger("pes")


@command(HardwareRescanBtSensorsCommand, Permission.WRITE_SENSORS)
async def handle_bt_sensors_rescan(
    msg: HardwareRescanBtSensorsCommand, ctx: CommandContext
) -> CommandResult:
    """
    Restart the connexion search of one BT sensor
    """
    sensor_id = msg.payload.id

    if sensor_id not in store.get_all_sensors_settings():
        return CommandResult(status="error", message=f"Unknown sensor: {sensor_id}")

    store.request_hardware_rescan(sensor_id)

    logger.info(
        "[WS|hardware:rescan_bt_sensors] Sensor rescan requested",
        sensor_name=sensor_id,
    )

    return CommandResult(status="ok")
