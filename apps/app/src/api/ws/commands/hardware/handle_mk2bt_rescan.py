import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, HardwareRescanMk2btCommand
from constants import BT_UNITS
from store import Store
from typings import Permission

store = Store()
logger = structlog.get_logger("pes")


@command(HardwareRescanMk2btCommand, Permission.WRITE_UNITS)
async def handle_mk2bt_rescan(
    msg: HardwareRescanMk2btCommand, ctx: CommandContext
) -> CommandResult:
    """
    Restart the connexion search of one 2B unit
    """
    unit_id = msg.payload.id

    if unit_id not in BT_UNITS:
        return CommandResult(status="error", message=f"Unknown unit: {unit_id}")

    store.request_hardware_rescan(unit_id)

    logger.info("[WS|hardware:rescan_mk2bt] Unit rescan requested", unit_name=unit_id)

    return CommandResult(status="ok")
