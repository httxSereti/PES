import structlog
from store import Store
from api.ws.websocket_notifier import WebSocketNotifier
from typings import UnitDict

from constants import MODE_2B

store = Store()
logger = structlog.get_logger("pes")


async def handle_update_mode(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Update the mode of one or more Units, set channelA & channelB to zero
    """

    # loop over units
    for unit_id, unit_changes in payload.items():
        new_mode = unit_changes.get("mode")

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
                "ch_A_max": 0,
                "ch_B": 0,
                "ch_B_max": 0,
            },
        )

        changes = {
            "updated": True,
            "mode": new_mode,
            "ch_A": 0,
            "ch_A_max": 0,
            "ch_B": 0,
            "ch_B_max": 0,
        }

        # reset adj_2 for mode without adj2
        if MODE_2B[new_mode]["adj_2"] == "":
            changes["adj_2"] = snapshot["adj_1"]

        # save changes
        store.update_unit_dict(unit, changes)

        ws_notifier.notify(
            "units:update",
            {
                "id": unit_id,
                "changes": {
                    "mode": new_mode,
                    "ch_A": 0,
                    "ch_A_max": 0,
                    "ch_B": 0,
                    "ch_B_max": 0,
                },
            },
        )

    return {"status": "ok"}
