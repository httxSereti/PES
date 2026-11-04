from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingTemplateSaveCommand
from services.session import send_personal
from services.training import list_templates, save_template
from typings import Permission


@command(TrainingTemplateSaveCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_template_save(
    msg: TrainingTemplateSaveCommand, ctx: CommandContext
) -> CommandResult:
    payload = msg.payload
    try:
        await save_template(
            template_id=payload.template_id,
            name=payload.name,
            goals=[goal.model_dump() for goal in payload.goals],
            auto_stop_on_goal=payload.auto_stop_on_goal,
            created_by=ctx.user.id,
            mode=payload.mode,
        )
        templates = await list_templates()
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:templates", templates, ctx.user.id)
    return CommandResult(status="ok", message="Template saved")
