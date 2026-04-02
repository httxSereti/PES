from utils import Logger
from store import Store
from api.ws.websocket_notifier import WebSocketNotifier
from typings import UnitDict

store = Store()


async def handle_update_power_mode(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Update the power mode (Low, High, Dynamic) of one or more Units
    """

    for unit_id, unit_changes in payload.items():
        power_mode = unit_changes.get("power_mode")

        if power_mode not in ["L", "H", "D"]:
            continue

        unit = UnitDict(unit_id)
        snapshot = store.get_unit_dict(unit)

        Logger.info(
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

        ws_notifier.notify(
            "units:update",
            {
                "id": unit_id,
                "changes": changes,
            },
        )

    return {"status": "ok"}
