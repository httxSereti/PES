from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingUpdateCommand
from services.training import update_edging_session
from store import Store
from typings import Permission


@command(TrainingUpdateCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_update(
    msg: TrainingUpdateCommand, ctx: CommandContext
) -> CommandResult:
    payload = msg.payload
    is_host = Store().check_permission(ctx.user.id, Permission.HOST)
    try:
        session = await update_edging_session(
            payload.session_id,
            is_host=is_host,
            name=payload.name,
            goals=[g.model_dump() for g in payload.goals] if payload.goals is not None else None,
            auto_stop_on_goal=payload.auto_stop_on_goal,
            notes=payload.notes,
            rating=payload.rating,
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", session=session)