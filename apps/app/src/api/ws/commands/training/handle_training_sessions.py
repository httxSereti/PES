from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingSessionsCommand
from services.session import send_personal
from services.training import list_edging_sessions
from typings import Permission


@command(TrainingSessionsCommand, Permission.TRAINING_EDGING_READ)
async def handle_training_sessions(
    msg: TrainingSessionsCommand, ctx: CommandContext
) -> CommandResult:
    try:
        sessions = await list_edging_sessions()
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:sessions", sessions, ctx.user.id)
    return CommandResult(status="ok")