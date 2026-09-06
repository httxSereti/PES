import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, RampsStopCommand
from hardware.ramp import ramp_manager
from typings import Permission, UnitDict

logger = structlog.get_logger("pes")


@command(RampsStopCommand, Permission.WRITE_UNITS)
async def handle_ramps_stop(
    msg: RampsStopCommand, ctx: CommandContext
) -> CommandResult:
    """
    Stop a software ramp on one unit field
    """
    p = msg.payload

    try:
        ramp_manager.stop(UnitDict(p.unit), p.field, restore=p.restore)
    except KeyError as err:
        logger.warning(f"[WS|ramps:stop] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    return CommandResult(status="ok")
