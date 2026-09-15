import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesDuplicateCommand
from services import profiles as profiles_service
from typings import Permission

logger = structlog.get_logger("pes")


@command(ProfilesDuplicateCommand, Permission.WRITE_PROFILES)
async def handle_profiles_duplicate(
    msg: ProfilesDuplicateCommand, ctx: CommandContext
) -> CommandResult:
    """Copy an existing profile under a new name."""
    p = msg.payload

    try:
        summary = profiles_service.duplicate_profile(
            p.name, p.new_name, ctx.user.display_name or ctx.user.id
        )
    except profiles_service.ProfileError as err:
        logger.warning(f"[WS|profiles:duplicate] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    ctx.notifier.notify("profiles:saved", {"profile": summary, "created": True})
    return CommandResult(status="ok")
