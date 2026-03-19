from store import Store
from api.ws.websocket_notifier import WebSocketNotifier
from typings import UnitDict
from constants import BT_UNITS

store = Store()


async def handle_stop(_payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Emergency shutdown all units
    """

    # loop over units and stop it
    for unit_str in BT_UNITS:
        unit = UnitDict(unit_str)
        store.update_unit_dict(
            unit,
            {
                "updated": True,
                "ch_A": 0,
                "ch_A_max": 0,
                "ch_B": 0,
                "ch_B_max": 0,
            },
        )

    ws_notifier.notify(
        "core:stop", {"status": "ok", "message": "%SYSTEM% shutdown all devices."}
    )

    return {"status": "ok", "message": "%SYSTEM% stopped all devices."}
