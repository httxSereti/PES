import structlog
from cuid2 import cuid_wrapper

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesApplyCommand
from events.enums import ActionType, QueueItemStatus
from events.models import QueueItem
from events.queue import ActionQueue
from services import profiles as profiles_service
from typings import Permission

logger = structlog.get_logger("pes")

generate_id = cuid_wrapper()


@command(ProfilesApplyCommand, Permission.WRITE_UNITS)
async def handle_profiles_apply(
    msg: ProfilesApplyCommand, ctx: CommandContext
) -> CommandResult:
    """Queue a profile apply so it is reversible and duration-aware."""
    p = msg.payload

    if p.duration == 0:
        return CommandResult(status="error", message="Duration must be -1 or > 0")
    if not profiles_service.profile_exists(p.name):
        return CommandResult(
            status="error", message=f"Profile '{p.name}' not found"
        )

    item = QueueItem(
        id=generate_id(),
        action_type=ActionType.PROFILE,
        payload={"profile": p.name, "level_pct": p.level_pct},
        duration=p.duration,
        cumulative=False,
        priority=0,
        status=QueueItemStatus.WAITING,
        origin=f"manual:{ctx.user.display_name or ctx.user.id}",
        display_name=f"Profile: {p.name} at {p.level_pct}%",
    )

    try:
        ActionQueue.get_instance().enqueue([item])
    except RuntimeError as err:
        logger.error(f"[WS|profiles:apply] {err}")
        return CommandResult(status="error", message="Queue unavailable")

    return CommandResult(status="ok")
