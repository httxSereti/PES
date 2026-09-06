import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, HardwareUpdateMk2btCommand
from constants import BT_UNITS
from store import Store
from typings import Permission

store = Store()
logger = structlog.get_logger("pes")


@command(HardwareUpdateMk2btCommand, Permission.WRITE_UNITS)
async def handle_mk2bt_update(
    msg: HardwareUpdateMk2btCommand, ctx: CommandContext
) -> CommandResult:
    """
    Enable/disable the connexion search of one 2B unit at runtime
    """
    unit_id = msg.payload.id

    if unit_id not in BT_UNITS:
        return CommandResult(status="error", message=f"Unknown unit: {unit_id}")

    store.set_hardware_enabled(unit_id, msg.payload.enabled)

    logger.info(
        "[WS|hardware:update_mk2bt] Unit connexion toggled",
        unit_name=unit_id,
        enabled=msg.payload.enabled,
    )

    return CommandResult(status="ok")
