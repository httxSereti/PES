from api.ws.commands.training._access import active_app_session_id, is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingStartCommand
from services.training import start_edging_session
from typings import Permission


@command(TrainingStartCommand, Permission.HOST)
async def handle_training_start(
    msg: TrainingStartCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await start_edging_session(
            msg.payload.session_id,
            viewer_id=ctx.user.id,
            is_host=is_host(ctx),
            app_session_id=active_app_session_id(),
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", message="Session started", session=session)
