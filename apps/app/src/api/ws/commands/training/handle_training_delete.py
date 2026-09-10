from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingDeleteCommand
from services.training import delete_edging_session
from typings import Permission


@command(TrainingDeleteCommand, Permission.HOST)
async def handle_training_delete(
    msg: TrainingDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await delete_edging_session(msg.payload.session_id)
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", message="Session deleted")