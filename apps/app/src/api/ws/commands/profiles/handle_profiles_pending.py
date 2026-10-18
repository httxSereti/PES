from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesPendingCommand
from services import profiles as profiles_service
from services.session import send_personal
from typings import Permission


@command(ProfilesPendingCommand, Permission.READ_UNITS)
async def handle_profiles_pending(
    msg: ProfilesPendingCommand, ctx: CommandContext
) -> CommandResult:
    """Send the queued (waiting) profile applies to the requester."""
    payload = profiles_service.list_pending_applies()
    await send_personal("profiles:pending", payload, ctx.user.id)
    return CommandResult(status="ok")
