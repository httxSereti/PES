from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesExportCommand
from services import profiles as profiles_service
from services.session import send_personal
from typings import Permission


@command(ProfilesExportCommand, Permission.READ_PROFILES)
async def handle_profiles_export(
    msg: ProfilesExportCommand, ctx: CommandContext
) -> CommandResult:
    """Send the raw profile document to the requester as `profiles:exported`."""
    name = msg.payload.name
    try:
        document = profiles_service.load_profile(name)
    except profiles_service.ProfileError as err:
        return CommandResult(status="error", message=str(err))

    await send_personal(
        "profiles:exported", {"name": name, "document": document}, ctx.user.id
    )
    return CommandResult(status="ok")
