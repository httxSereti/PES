import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, RampsStartCommand
from hardware.ramp import ramp_manager
from typings import Permission, UnitDict

logger = structlog.get_logger("pes")


@command(RampsStartCommand, Permission.WRITE_UNITS)
async def handle_ramps_start(
    msg: RampsStartCommand, ctx: CommandContext
) -> CommandResult:
    """
    Start a software ramp on one unit field (replaces any existing one)
    """
    p = msg.payload

    try:
        ramp_manager.start(
            UnitDict(p.unit),
            p.field,
            timer=p.timer,
            step=p.step,
            mode=p.mode,
            duration=p.duration,
            max_value=p.max_value,
        )
    except ValueError as err:
        logger.warning(f"[WS|ramps:start] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    return CommandResult(status="ok")
