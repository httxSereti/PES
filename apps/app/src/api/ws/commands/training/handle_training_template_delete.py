from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingTemplateDeleteCommand
from services.session import send_personal
from services.training import delete_template, list_templates
from typings import Permission


@command(TrainingTemplateDeleteCommand, Permission.TRAINING_EDGING_MANAGE)
async def handle_training_template_delete(
    msg: TrainingTemplateDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await delete_template(msg.payload.template_id)
        templates = await list_templates()
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:templates", templates, ctx.user.id)
    return CommandResult(status="ok", message="Template deleted")
