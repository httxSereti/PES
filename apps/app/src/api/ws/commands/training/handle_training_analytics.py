from api.ws.commands.training._access import is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingAnalyticsCommand
from services.session import send_personal
from services.training import get_analytics
from typings import Permission


@command(TrainingAnalyticsCommand, Permission.TRAINING_EDGING_READ)
async def handle_training_analytics(
    msg: TrainingAnalyticsCommand, ctx: CommandContext
) -> CommandResult:
    try:
        analytics = await get_analytics(
            viewer_id=ctx.user.id,
            is_host=is_host(ctx),
        )
    except Exception as e:
        return CommandResult(status="error", message=str(e))

    await send_personal("training:analytics", analytics, ctx.user.id)
    return CommandResult(status="ok")
