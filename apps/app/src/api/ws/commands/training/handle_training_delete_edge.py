from api.ws.commands.training._access import is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingDeleteEdgeCommand
from services.training import delete_edging_edge
from typings import Permission


@command(TrainingDeleteEdgeCommand, Permission.HOST)
async def handle_training_delete_edge(
    msg: TrainingDeleteEdgeCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await delete_edging_edge(
            msg.payload.session_id,
            edge_id=msg.payload.edge_id,
            viewer_id=ctx.user.id,
            is_host=is_host(ctx),
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(status="ok", session=session)
