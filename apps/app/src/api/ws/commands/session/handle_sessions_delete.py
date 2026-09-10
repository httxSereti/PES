from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SessionsDeleteCommand
from services.session import delete_session
from typings import Permission


@command(SessionsDeleteCommand, Permission.HOST)
async def handle_sessions_delete(
    msg: SessionsDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        deleted = await delete_session(msg.payload.session_id)
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    if not deleted:
        return CommandResult(status="error", message="Session not found")

    return CommandResult(
        status="ok",
        message="Session deleted",
    )
