from api.ws.commands.training._access import is_host
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TrainingRecordEdgeCommand
from services.training import record_edging_edge
from typings import Permission


@command(TrainingRecordEdgeCommand, Permission.TRAINING_EDGING_READ)
async def handle_training_record_edge(
    msg: TrainingRecordEdgeCommand, ctx: CommandContext
) -> CommandResult:
    host = is_host(ctx)
    try:
        result = await record_edging_edge(
            msg.payload.session_id,
            difficulty=msg.payload.difficulty,
            outcome=msg.payload.outcome,
            recorded_by=ctx.user.id,
            source="host" if host else "member",
            client_edge_id=msg.payload.client_edge_id,
            note=msg.payload.note,
            viewer_id=ctx.user.id,
            is_host=host,
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(
        status="ok",
        session=result["session"],
        edge=result["edge"],
    )
