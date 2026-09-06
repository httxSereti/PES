import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, HardwareUpdateBtSensorsCommand
from store import Store
from typings import Permission

store = Store()
logger = structlog.get_logger("pes")


@command(HardwareUpdateBtSensorsCommand, Permission.WRITE_SENSORS)
async def handle_bt_sensors_update(
    msg: HardwareUpdateBtSensorsCommand, ctx: CommandContext
) -> CommandResult:
    """
    Enable/disable the connexion search of one BT sensor at runtime
    """
    sensor_id = msg.payload.id

    if sensor_id not in store.get_all_sensors_settings():
        return CommandResult(status="error", message=f"Unknown sensor: {sensor_id}")

    store.set_hardware_enabled(sensor_id, msg.payload.enabled)

    logger.info(
        "[WS|hardware:update_bt_sensors] Sensor connexion toggled",
        sensor_name=sensor_id,
        enabled=msg.payload.enabled,
    )

    return CommandResult(status="ok")
