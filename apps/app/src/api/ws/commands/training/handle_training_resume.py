from api.ws.commands.training._access import is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingResumeCommand
from services.training import resume_edging_session
from typings import Permission


@command(TrainingResumeCommand, Permission.HOST)
async def handle_training_resume(
    msg: TrainingResumeCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await resume_edging_session(
            msg.payload.session_id,
            viewer_id=ctx.user.id,
            is_host=is_host(ctx),
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", message="Session resumed", session=session)
