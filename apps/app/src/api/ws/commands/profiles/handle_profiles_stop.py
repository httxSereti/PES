import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesStopCommand
from events.queue import ActionQueue
from store import Store
from typings import Permission

logger = structlog.get_logger("pes")

store = Store()


@command(ProfilesStopCommand, Permission.WRITE_UNITS)
async def handle_profiles_stop(
    msg: ProfilesStopCommand, ctx: CommandContext
) -> CommandResult:
    """Stop the profile currently applied by the executor (reverses it)."""
    active = store.get_active_profile()
    if active is None:
        return CommandResult(status="error", message="No profile is running")

    try:
        cancelled = await ActionQueue.get_instance().cancel(active["queue_item_id"])
    except RuntimeError:
        return CommandResult(status="error", message="Queue unavailable")

    if not cancelled:
        return CommandResult(status="error", message="Profile is no longer running")

    logger.info(f"[WS|profiles:stop] Stopped profile '{active['name']}'")
    return CommandResult(status="ok")
