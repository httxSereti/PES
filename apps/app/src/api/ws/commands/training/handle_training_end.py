from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingEndCommand
from services.training import end_edging_session
from typings import Permission


@command(TrainingEndCommand, Permission.HOST)
async def handle_training_end(
    msg: TrainingEndCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await end_edging_session(
            msg.payload.session_id, status=msg.payload.status
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", session=session)