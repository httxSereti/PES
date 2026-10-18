import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesStopCommand
from events.enums import ActionType
from events.queue import ActionQueue
from services import profiles as profiles_service
from store import Store
from typings import Permission

logger = structlog.get_logger("pes")

store = Store()


@command(ProfilesStopCommand, Permission.WRITE_UNITS)
async def handle_profiles_stop(
    msg: ProfilesStopCommand, ctx: CommandContext
) -> CommandResult:
    """Stop the running profile, or cancel one queued apply by id."""
    try:
        queue = ActionQueue.get_instance()
    except RuntimeError:
        return CommandResult(status="error", message="Queue unavailable")

    p = msg.payload
    if p.queue_item_id:
        item = next(
            (i for i in queue.get_items() if i.id == p.queue_item_id), None
        )
        if item is None:
            return CommandResult(
                status="error", message="That apply is no longer queued"
            )
        if item.action_type != ActionType.PROFILE:
            return CommandResult(
                status="error", message="That queue item is not a profile apply"
            )

        cancelled = await queue.cancel(p.queue_item_id)
        if not cancelled:
            return CommandResult(
                status="error", message="That apply is no longer queued"
            )

        logger.info(f"[WS|profiles:stop] Cancelled queued apply '{item.id}'")
        ctx.notifier.notify(
            "profiles:pending", profiles_service.list_pending_applies()
        )
        return CommandResult(status="ok")

    active = store.get_active_profile()
    if active is None:
        return CommandResult(status="error", message="No profile is running")

    cancelled = await queue.cancel(active["queue_item_id"])
    if not cancelled:
        return CommandResult(status="error", message="Profile is no longer running")

    logger.info(f"[WS|profiles:stop] Stopped profile '{active['name']}'")
    return CommandResult(status="ok")
