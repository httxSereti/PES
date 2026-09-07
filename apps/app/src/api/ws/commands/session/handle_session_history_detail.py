from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SessionsHistoryDetailCommand
from services.session import get_history_detail, send_personal
from typings import Permission


@command(SessionsHistoryDetailCommand, Permission.SESSION_READ)
async def handle_session_history_detail(
    msg: SessionsHistoryDetailCommand, ctx: CommandContext
) -> CommandResult:
    try:
        detail = await get_history_detail(msg.payload.session_id, ctx.user.id)
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("sessions:history_detail", detail, ctx.user.id)
    return CommandResult(status="ok")
