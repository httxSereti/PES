from store import Store
from api.ws.websocket_notifier import WebSocketNotifier
from typings import UnitDict
import structlog

store = Store()
logger = structlog.get_logger("pes")


async def handle_update_adj(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Update the adj of one or more Units
    """

    # loop over units
    for unit_id, unit_changes in payload.items():
        unit = UnitDict(unit_id)
        snapshot = store.get_unit_dict(unit)

        changes = {"updated": True}
        notification_changes = {}
        log_msgs = []

        if "adj_1" in unit_changes:
            new_adj_1 = unit_changes["adj_1"]
            changes["adj_1"] = new_adj_1
            notification_changes["adj_1"] = new_adj_1
            log_msgs.append({"adj_1": {"old": snapshot.get("adj_1"), "new": new_adj_1}})

        if "adj_2" in unit_changes:
            new_adj_2 = unit_changes["adj_2"]
            changes["adj_2"] = new_adj_2
            notification_changes["adj_2"] = new_adj_2
            log_msgs.append({"adj_2": {"old": snapshot.get("adj_2"), "new": new_adj_2}})

        if not notification_changes:
            continue

        logger.info(f"[WS|units:update_adj] Updated {unit_id}", changes=log_msgs)

        # save changes
        store.update_unit_dict(unit, changes)

        ws_notifier.notify(
            "units:update",
            {
                "id": unit_id,
                "changes": notification_changes,
            },
        )

    return {"status": "ok"}
