from api.ws.commands.training._access import active_app_session_id, is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingCreateCommand
from services.training import create_edging_session
from typings import Permission


@command(TrainingCreateCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_create(
    msg: TrainingCreateCommand, ctx: CommandContext
) -> CommandResult:
    host = is_host(ctx)
    try:
        session = await create_edging_session(
            name=msg.payload.name,
            goals=[g.model_dump() for g in msg.payload.goals],
            auto_stop_on_goal=msg.payload.auto_stop_on_goal,
            is_host=host,
            created_by=ctx.user.id,
            app_session_id=active_app_session_id(),
            participant_ids=msg.payload.participant_ids,
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", session=session)
