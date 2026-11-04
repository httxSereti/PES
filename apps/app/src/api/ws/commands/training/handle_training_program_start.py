from api.ws.commands.training._access import active_app_session_id, is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingProgramStartCommand
from services.training import start_program
from typings import Permission


@command(TrainingProgramStartCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_program_start(
    msg: TrainingProgramStartCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await start_program(
            msg.payload.program_id,
            created_by=ctx.user.id,
            is_host=is_host(ctx),
            app_session_id=active_app_session_id(),
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(
        status="ok", message="Next program step created", session=session
    )
