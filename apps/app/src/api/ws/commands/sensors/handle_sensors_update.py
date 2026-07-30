import structlog
from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SensorsUpdateCommand
from typings import Permission

store = Store()
logger = structlog.get_logger("pes")


@command(SensorsUpdateCommand, Permission.WRITE_SENSORS)
async def handle_sensors_update(
    msg: SensorsUpdateCommand, ctx: CommandContext
) -> CommandResult:
    """
    Handle sensor update
    """
    try:
        for sensorName, value in msg.payload.items():
            store.update_sensor_fields(sensorName, value)
    except KeyError:
        return CommandResult(
            status="error", message="Can't update Sensor! (KeyError)"
        )

    logger.info("[WS|sensors:update] Updated Sensors", sensors=msg.payload.keys())

    return CommandResult(status="ok")
