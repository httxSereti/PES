import structlog
from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, UnitsUpdatePowerModeCommand
from typings import Permission, UnitDict

logger = structlog.get_logger("pes")
store = Store()


@command(UnitsUpdatePowerModeCommand, Permission.WRITE_UNITS)
async def handle_update_power_mode(
    msg: UnitsUpdatePowerModeCommand, ctx: CommandContext
) -> CommandResult:
    """
    Update the power mode (Low, High, Dynamic) of one or more Units
    """

    for unit_id, unit_changes in msg.payload.items():
        power_mode = unit_changes.power_mode

        if power_mode not in ["L", "H", "D"]:
            continue

        unit = UnitDict(unit_id)

        logger.info(
            f"[WS|units:update_power_mode] Updated power mode for {unit_id} to '{power_mode}'"
        )

        changes = {"updated": True}

        if power_mode == "L":
            changes["level_h"] = False
            changes["level_d"] = False
        elif power_mode == "H":
            changes["level_h"] = True
            changes["level_d"] = False
        elif power_mode == "D":
            changes["level_d"] = True

        # save changes
        store.update_unit_dict(unit, changes)

        ctx.notifier.notify(
            "units:update",
            {
                "id": unit_id,
                "changes": changes,
            },
        )

    return CommandResult(status="ok")
