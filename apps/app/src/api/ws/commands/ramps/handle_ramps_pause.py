import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, RampsPauseCommand
from hardware.ramp import ramp_manager
from typings import Permission, UnitDict

logger = structlog.get_logger("pes")


@command(RampsPauseCommand, Permission.WRITE_UNITS)
async def handle_ramps_pause(
    msg: RampsPauseCommand, ctx: CommandContext
) -> CommandResult:
    """
    Pause a software ramp on one unit field
    """
    p = msg.payload

    try:
        ramp_manager.pause(UnitDict(p.unit), p.field)
    except KeyError as err:
        logger.warning(f"[WS|ramps:pause] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    return CommandResult(status="ok")
