from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SessionsHistoryCommand
from services.session import get_history, send_personal
from typings import Permission


@command(SessionsHistoryCommand, Permission.SESSION_READ)
async def handle_session_history(
    msg: SessionsHistoryCommand, ctx: CommandContext
) -> CommandResult:
    try:
        history = await get_history()
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("sessions:history", history, ctx.user.id)
    return CommandResult(status="ok")
