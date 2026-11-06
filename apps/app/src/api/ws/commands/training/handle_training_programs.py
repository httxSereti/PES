from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingProgramsCommand
from services.session import send_personal
from services.training import list_programs
from typings import Permission


@command(TrainingProgramsCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_programs(
    msg: TrainingProgramsCommand, ctx: CommandContext
) -> CommandResult:
    try:
        programs = await list_programs()
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:programs", programs, ctx.user.id)
    return CommandResult(status="ok")
