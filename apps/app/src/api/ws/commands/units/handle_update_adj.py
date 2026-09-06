from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, UnitsUpdateAdjCommand
from typings import Permission, UnitDict
import structlog

store = Store()
logger = structlog.get_logger("pes")


@command(UnitsUpdateAdjCommand, Permission.WRITE_UNITS)
async def handle_update_adj(
    msg: UnitsUpdateAdjCommand, ctx: CommandContext
) -> CommandResult:
    """
    Update the adj of one or more Units
    """

    # loop over units
    for unit_id, unit_changes in msg.payload.items():
        unit = UnitDict(unit_id)
        snapshot = store.get_unit_dict(unit)

        changes = {"updated": True}
        notification_changes = {}
        log_msgs = []

        if unit_changes.adj_1 is not None:
            new_adj_1 = unit_changes.adj_1
            changes["adj_1"] = new_adj_1
            notification_changes["adj_1"] = new_adj_1
            log_msgs.append({"adj_1": {"old": snapshot.get("adj_1"), "new": new_adj_1}})

        if unit_changes.adj_2 is not None:
            new_adj_2 = unit_changes.adj_2
            changes["adj_2"] = new_adj_2
            notification_changes["adj_2"] = new_adj_2
            log_msgs.append({"adj_2": {"old": snapshot.get("adj_2"), "new": new_adj_2}})

        if not notification_changes:
            continue

        logger.info(f"[WS|units:update_adj] Updated {unit_id}", changes=log_msgs)

        # save changes
        store.update_unit_dict(unit, changes)

        ctx.notifier.notify(
            "units:update",
            {
                "id": unit_id,
                "changes": notification_changes,
            },
        )

    return CommandResult(status="ok")
