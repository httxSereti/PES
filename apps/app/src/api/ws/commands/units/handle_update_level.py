from utils import Logger, calculate_magic_number
from store import Store
from api.ws.websocket_notifier import WebSocketNotifier
from typings import UnitDict

store = Store()


async def handle_update_level(payload: dict, ws_notifier: WebSocketNotifier) -> dict:
    """
    Update the intensity level of one or more Units using "magic number" number with random and operators
    """

    # loop over units, then changes
    for unit_id, unit_changes in payload.items():
        unit = UnitDict(unit_id)
        snapshot = store.get_unit_dict(unit)
        changes = {}

        for field, field_value in unit_changes.items():
            if field == "ch_A" or field == "ch_B":
                # calc new value using lexer for operators
                new_value = calculate_magic_number(snapshot[field], str(field_value))

                Logger.info(
                    f"[WS|units:update_level] Adjust {unit_id}@'{field}' from '{snapshot[field]}' to '{new_value}' with '{field_value}'"
                )
                changes[field] = new_value

        # updated
        if changes:
            changes["updated"] = True
            store.update_unit_dict(unit, changes)

            ws_notifier.notify(
                "units:update",
                {"id": unit_id, "changes": changes},
            )

    return {"status": "ok"}
