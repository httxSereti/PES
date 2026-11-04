from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingProgramSaveCommand
from services.session import send_personal
from services.training import list_programs, save_program
from typings import Permission


@command(TrainingProgramSaveCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_program_save(
    msg: TrainingProgramSaveCommand, ctx: CommandContext
) -> CommandResult:
    payload = msg.payload
    try:
        await save_program(
            program_id=payload.program_id,
            name=payload.name,
            description=payload.description,
            steps=[
                {
                    "name": step.name,
                    "goals": [goal.model_dump() for goal in step.goals],
                    "auto_stop_on_goal": step.auto_stop_on_goal,
                }
                for step in payload.steps
            ],
            created_by=ctx.user.id,
        )
        programs = await list_programs()
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:programs", programs, ctx.user.id)
    return CommandResult(status="ok", message="Program saved")
