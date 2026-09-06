from utils import calculate_magic_number
from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, UnitsUpdateLevelCommand
from typings import Permission, UnitDict
import structlog

store = Store()
logger = structlog.get_logger("pes")


@command(UnitsUpdateLevelCommand, Permission.WRITE_UNITS)
async def handle_update_level(
    msg: UnitsUpdateLevelCommand, ctx: CommandContext
) -> CommandResult:
    """
    Update the intensity level of one or more Units using "magic number" number with random and operators
    """

    # loop over units, then changes
    for unit_id, unit_changes in msg.payload.items():
        unit = UnitDict(unit_id)
        snapshot = store.get_unit_dict(unit)
        changes = {}

        # only the fields the client actually set (model_dump drops the Nones)
        for field, field_value in unit_changes.model_dump(exclude_none=True).items():
            if field == "ch_A" or field == "ch_B":
                # calc new value using lexer for operators
                new_value = calculate_magic_number(snapshot[field], str(field_value))

                logger.info(
                    f"[WS|units:update_level] Adjust {unit_id}",
                    changes={
                        "unit_id": unit_id,
                        "field": {
                            "name": field,
                            "old": snapshot[field],
                            "new": new_value,
                            "operators": field_value,
                        },
                    },
                )
                changes[field] = new_value

        # updated
        if changes:
            changes["updated"] = True
            store.update_unit_dict(unit, changes)

            ctx.notifier.notify(
                "units:update",
                {"id": unit_id, "changes": changes},
            )

    return CommandResult(status="ok")
