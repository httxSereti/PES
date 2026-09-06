from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, SessionStartCommand
from services.session import start_session
from typings import Permission


@command(SessionStartCommand, Permission.SESSION_MANAGE)
async def handle_session_start(
    msg: SessionStartCommand, ctx: CommandContext
) -> CommandResult:
    try:
        session = await start_session(
            session_type=msg.payload.type,
            name=msg.payload.name,
            description=msg.payload.description,
            unit_ids=msg.payload.unit_ids,
            sensor_ids=msg.payload.sensor_ids,
            created_by=ctx.user.id,
        )
    except ValueError as e:
        return CommandResult(status="error", message=str(e))

    return CommandResult(
        status="ok",
        message=f"Session started: {session['name']} ({session['type']})",
    )
