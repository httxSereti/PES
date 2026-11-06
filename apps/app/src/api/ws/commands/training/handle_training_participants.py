from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingParticipantsCommand
from services.session import send_personal
from services.training import list_training_participants
from typings import Permission


@command(TrainingParticipantsCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_participants(
    msg: TrainingParticipantsCommand, ctx: CommandContext
) -> CommandResult:
    try:
        participants = list_training_participants()
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:participants", participants, ctx.user.id)
    return CommandResult(status="ok")
