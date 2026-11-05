from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SessionsRenameCommand
from services.session import rename_session
from typings import Permission


@command(SessionsRenameCommand, Permission.HOST)
async def handle_sessions_rename(
    msg: SessionsRenameCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await rename_session(msg.payload.session_id, msg.payload.name)
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", message="Session renamed")
