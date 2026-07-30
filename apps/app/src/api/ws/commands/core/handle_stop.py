import structlog
from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, CoreStopCommand
from events.queue import ActionQueue
from typings import Permission, UnitDict
from constants import BT_UNITS


store = Store()
logger = structlog.get_logger("pes")


@command(CoreStopCommand, Permission.WRITE_UNITS)
async def handle_stop(msg: CoreStopCommand, ctx: CommandContext) -> CommandResult:
    """
    Emergency shutdown all units
    """

    # cancel every queued/running action (absorbed from the legacy endpoint,
    # which did this before dispatching core:stop)
    await ActionQueue.get_instance().cancel_all()

    # loop over units and stop it
    for unit_str in BT_UNITS:
        unit = UnitDict(unit_str)
        store.update_unit_dict(
            unit,
            {
                "updated": True,
                "ch_A": 0,
                "ch_B": 0,
            },
        )

    # log
    logger.info("[WS|core:stop] Stopped every units & action queue")

    ctx.notifier.notify(
        "core:stop", {"status": "ok", "message": "%SYSTEM% shutdown all devices."}
    )

    return CommandResult(status="ok", message="%SYSTEM% stopped all devices.")
