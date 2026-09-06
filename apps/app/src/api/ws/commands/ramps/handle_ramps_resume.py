import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, RampsResumeCommand
from hardware.ramp import ramp_manager
from typings import Permission, UnitDict

logger = structlog.get_logger("pes")


@command(RampsResumeCommand, Permission.WRITE_UNITS)
async def handle_ramps_resume(
    msg: RampsResumeCommand, ctx: CommandContext
) -> CommandResult:
    """
    Resume a paused software ramp on one unit field
    """
    p = msg.payload

    try:
        ramp_manager.resume(UnitDict(p.unit), p.field)
    except KeyError as err:
        logger.warning(f"[WS|ramps:resume] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    return CommandResult(status="ok")
