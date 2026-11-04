from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingTemplatesCommand
from services.session import send_personal
from services.training import list_templates
from typings import Permission


@command(TrainingTemplatesCommand, Permission.TRAINING_EDGING_READ)
async def handle_training_templates(
    msg: TrainingTemplatesCommand, ctx: CommandContext
) -> CommandResult:
    try:
        templates = await list_templates()
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:templates", templates, ctx.user.id)
    return CommandResult(status="ok")
