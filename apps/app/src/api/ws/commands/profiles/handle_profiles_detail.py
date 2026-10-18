import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesDetailCommand
from services import profiles as profiles_service
from services.session import send_personal
from typings import Permission

logger = structlog.get_logger("pes")


@command(ProfilesDetailCommand, Permission.READ_PROFILES)
async def handle_profiles_detail(
    msg: ProfilesDetailCommand, ctx: CommandContext
) -> CommandResult:
    """Send the editable content of a profile as `profiles:detail`."""
    name = msg.payload.name
    try:
        detail = profiles_service.get_profile_detail(name)
    except profiles_service.ProfileError as err:
        return CommandResult(status="error", message=str(err))

    await send_personal("profiles:detail", detail, ctx.user.id)
    return CommandResult(status="ok")
