import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesDeleteCommand
from services import profiles as profiles_service
from typings import Permission

logger = structlog.get_logger("pes")


@command(ProfilesDeleteCommand, Permission.MANAGE_PROFILES)
async def handle_profiles_delete(
    msg: ProfilesDeleteCommand, ctx: CommandContext
) -> CommandResult:
    """Delete a profile file."""
    try:
        profiles_service.delete_profile(msg.payload.name)
    except profiles_service.ProfileError as err:
        logger.warning(f"[WS|profiles:delete] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    ctx.notifier.notify("profiles:deleted", {"name": msg.payload.name})
    return CommandResult(status="ok")
