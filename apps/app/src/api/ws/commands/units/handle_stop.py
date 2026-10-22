import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, UnitsStopCommand
from hardware.ramp import ramp_manager
from store import Store
from typings import Permission, UnitDict

store = Store()
logger = structlog.get_logger("pes")


@command(UnitsStopCommand, Permission.WRITE_UNITS)
async def handle_units_stop(
    msg: UnitsStopCommand, ctx: CommandContext
) -> CommandResult:
    """
    Stop one unit: cancel every software ramp, then drop both channels to zero.
    """
    unit = UnitDict(msg.payload.id)

    # Cancel all four ramp fields without restoring their ramp max first;
    # the explicit level write below is the single source of truth.
    ramp_manager.stop_unit(unit, restore=False)

    changes = {
        "updated": True,
        "ch_A": 0,
        "ch_B": 0,
    }
    store.update_unit_dict(unit, changes)

    logger.info(f"[WS|units:stop] Stopped {unit.value} and cancelled its ramps")

    ctx.notifier.notify(
        "units:update",
        {
            "id": unit.value,
            "changes": changes,
        },
    )

    return CommandResult(status="ok", message=f"{unit.value} stopped.")
