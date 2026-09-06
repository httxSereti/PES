import structlog
from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, UnitsUpdateModeCommand
from typings import Permission, UnitDict

from constants import MODE_2B

store = Store()
logger = structlog.get_logger("pes")


@command(UnitsUpdateModeCommand, Permission.WRITE_UNITS)
async def handle_update_mode(
    msg: UnitsUpdateModeCommand, ctx: CommandContext
) -> CommandResult:
    """
    Update the mode of one or more Units, set channelA & channelB to zero
    """

    # loop over units
    for unit_id, unit_changes in msg.payload.items():
        new_mode = unit_changes.mode

        # if we're changing mode and is a 2B mode (0-16)
        if new_mode is None or not (0 <= new_mode < len(MODE_2B)):
            continue

        unit = UnitDict(unit_id)
        snapshot = store.get_unit_dict(unit)

        logger.info(
            f"[WS|units:update_mode] Updated mode for {unit_id}",
            unit_name=unit_id,
            changes={
                "old_mode": snapshot["mode"],
                "new_mode": new_mode,
                "ch_A": 0,
                "ch_B": 0,
            },
        )

        changes = {
            "updated": True,
            "mode": new_mode,
            "ch_A": 0,
            "ch_B": 0,
        }

        # reset adj_2 for mode without adj2
        if MODE_2B[new_mode]["adj_2"] == "":
            changes["adj_2"] = snapshot["adj_1"]

        # save changes
        store.update_unit_dict(unit, changes)

        ctx.notifier.notify(
            "units:update",
            {
                "id": unit_id,
                "changes": {
                    "mode": new_mode,
                    "ch_A": 0,
                    "ch_B": 0,
                },
            },
        )

    return CommandResult(status="ok")
