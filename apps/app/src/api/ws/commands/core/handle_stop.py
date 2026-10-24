import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, CoreStopCommand
from services.neutralize import neutralize_all
from typings import Permission

logger = structlog.get_logger("pes")


@command(CoreStopCommand, Permission.WRITE_UNITS)
async def handle_stop(msg: CoreStopCommand, ctx: CommandContext) -> CommandResult:
    """
    Emergency shutdown: neutralize the queue, ramps and every unit.
    """

    # Single neutralize path shared with session end and app shutdown.
    await neutralize_all(reason="core:stop")

    logger.info(
        "[WS|core:stop] Neutralized every unit, ramp, multiplier, profile "
        "& action queue"
    )

    ctx.notifier.notify(
        "core:stop", {"status": "ok", "message": "%SYSTEM% shutdown all devices."}
    )

    return CommandResult(status="ok", message="%SYSTEM% stopped all devices.")
