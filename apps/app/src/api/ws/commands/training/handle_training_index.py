from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingIndexCommand
from services.session import send_personal
from services.training import get_overview
from typings import Permission


@command(TrainingIndexCommand, Permission.TRAINING_EDGING_READ)
async def handle_training_index(
    msg: TrainingIndexCommand, ctx: CommandContext
) -> CommandResult:
    try:
        overview = await get_overview()
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:overview", overview, ctx.user.id)
    return CommandResult(status="ok")