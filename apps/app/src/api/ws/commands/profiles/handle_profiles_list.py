from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesListCommand
from services import profiles as profiles_service
from services.session import send_personal
from typings import Permission


@command(ProfilesListCommand, Permission.READ_PROFILES)
async def handle_profiles_list(
    msg: ProfilesListCommand, ctx: CommandContext
) -> CommandResult:
    """Send the saved-profile catalog to the requester as `profiles:load`."""
    payload = profiles_service.list_profiles()
    await send_personal("profiles:load", payload, ctx.user.id)
    return CommandResult(status="ok")
