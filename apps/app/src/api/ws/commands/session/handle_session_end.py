from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SessionEndCommand
from services.session import end_session
from typings import Permission


@command(SessionEndCommand, Permission.SESSION_MANAGE)
async def handle_session_end(
    msg: SessionEndCommand, ctx: CommandContext
) -> CommandResult:
    session = await end_session()
    if session is None:
        return CommandResult(status="error", message="No session is running")

    return CommandResult(
        status="ok",
        message=f"Session ended: {session['name']}",
    )
