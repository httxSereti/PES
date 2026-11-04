from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingProgramDeleteCommand
from services.session import send_personal
from services.training import delete_program, list_programs
from typings import Permission


@command(TrainingProgramDeleteCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_program_delete(
    msg: TrainingProgramDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await delete_program(msg.payload.program_id)
        programs = await list_programs()
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:programs", programs, ctx.user.id)
    return CommandResult(status="ok", message="Program deleted")
