from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingSessionDetailCommand
from services.session import send_personal
from services.training import get_session_detail
from typings import Permission


@command(TrainingSessionDetailCommand, Permission.TRAINING_EDGING_READ)
async def handle_training_session_detail(
    msg: TrainingSessionDetailCommand, ctx: CommandContext
) -> CommandResult:
    try:
        detail = await get_session_detail(msg.payload.session_id)
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:session_detail", detail, ctx.user.id)
    return CommandResult(status="ok")