import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesSaveCommand
from services import profiles as profiles_service
from typings import Permission

logger = structlog.get_logger("pes")


@command(ProfilesSaveCommand, Permission.WRITE_PROFILES)
async def handle_profiles_save(
    msg: ProfilesSaveCommand, ctx: CommandContext
) -> CommandResult:
    """Snapshot the current unit state (and ramps) into a profile file."""
    p = msg.payload
    created = not profiles_service.profile_exists(p.name)

    try:
        summary = profiles_service.save_profile(
            p.name,
            description=p.description,
            include_ramps=p.include_ramps,
            created_by=ctx.user.display_name or ctx.user.id,
            overwrite=p.overwrite,
        )
    except profiles_service.ProfileError as err:
        logger.warning(f"[WS|profiles:save] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    # Broadcast so every open profile list updates (sender included)
    ctx.notifier.notify(
        "profiles:saved", {"profile": summary, "created": created}
    )
    return CommandResult(status="ok")
