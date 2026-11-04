from api.ws.commands.training._access import is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingPauseCommand
from services.training import pause_edging_session
from typings import Permission


@command(TrainingPauseCommand, Permission.HOST)
async def handle_training_pause(
    msg: TrainingPauseCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await pause_edging_session(
            msg.payload.session_id,
            viewer_id=ctx.user.id,
            is_host=is_host(ctx),
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", message="Session paused", session=session)
