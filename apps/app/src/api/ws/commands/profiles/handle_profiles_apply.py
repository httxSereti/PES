import structlog
from cuid2 import cuid_wrapper

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesApplyCommand
from events.enums import ActionType, QueueItemStatus
from events.models import QueueItem
from events.queue import ActionQueue
from services import profiles as profiles_service
from store import Store
from typings import Permission

logger = structlog.get_logger("pes")

generate_id = cuid_wrapper()

store = Store()


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

    # A unit filter that matches nothing would "succeed" while changing
    # nothing, so require at least one unit the profile actually targets.
    units: list[str] | None = None
    if p.units:
        try:
            document = profiles_service.load_profile(p.name)
        except profiles_service.ProfileError as err:
            return CommandResult(status="error", message=str(err))
        targets = document.get("threads_settings")
        if not isinstance(targets, dict):
            targets = {}
        units = [unit for unit in p.units if unit in targets]
        skipped = [unit for unit in p.units if unit not in targets]
        if skipped:
            logger.warning(
                f"[WS|profiles:apply] Profile '{p.name}' does not target "
                f"{', '.join(skipped)}"
            )
        if not units:
            return CommandResult(
                status="error",
                message=(
                    f"Profile '{p.name}' does not target "
                    f"{', '.join(p.units)}"
                ),
            )

    # A profile item is non-cumulative: without this it would just wait
    # behind the running one (forever, when that one has no duration).
    # Supersede it instead, unless the caller asked to queue.
    active = store.get_active_profile()
    if active is not None and p.replace:
        try:
            await ActionQueue.get_instance().cancel(active["queue_item_id"])
        except RuntimeError:
            return CommandResult(status="error", message="Queue unavailable")
        logger.info(
            f"[WS|profiles:apply] Replaced running profile '{active['name']}'"
        )

    payload: dict = {"profile": p.name, "level_pct": p.level_pct}
    if units:
        payload["units"] = units
    unit_suffix = f" [{', '.join(units)}]" if units else ""

    item = QueueItem(
        id=generate_id(),
        action_type=ActionType.PROFILE,
        payload=payload,
        duration=p.duration,
        cumulative=False,
        priority=0,
        status=QueueItemStatus.WAITING,
        origin=f"manual:{ctx.user.display_name or ctx.user.id}",
        display_name=f"Profile: {p.name} at {p.level_pct}%{unit_suffix}",
    )

    try:
        ActionQueue.get_instance().enqueue([item])
    except RuntimeError as err:
        logger.error(f"[WS|profiles:apply] {err}")
        return CommandResult(status="error", message="Queue unavailable")

    # The item waits until the next queue tick: broadcast the new pending
    # list so every client shows (and can cancel) the queued apply.
    ctx.notifier.notify(
        "profiles:pending", profiles_service.list_pending_applies()
    )
    return CommandResult(status="ok")
