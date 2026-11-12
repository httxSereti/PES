import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, UnitsUpdateLimitsCommand
from services.unit_limits import unit_limits
from store import Store
from typings import Permission, UnitDict

store = Store()
logger = structlog.get_logger("pes")

_CHANNEL_BY_FIELD = {"ch_A_limit": "A", "ch_B_limit": "B"}


@command(UnitsUpdateLimitsCommand, Permission.HOST)
async def handle_update_limits(
    msg: UnitsUpdateLimitsCommand, ctx: CommandContext
) -> CommandResult:
    """
    Host-only: persist per-unit channel limits (start/warn/max) and broadcast
    them. Live levels are clamped immediately when the new max is lower.
    """
    for unit_id, unit_changes in msg.payload.items():
        unit = UnitDict(unit_id)

        new_limits: dict[str, dict] = {}
        for field, channel in _CHANNEL_BY_FIELD.items():
            limit = getattr(unit_changes, field)
            if limit is not None:
                new_limits[field] = limit.model_dump()
        if not new_limits:
            continue

        # Persist first: an unwritable config must not leave the rig with a
        # limit the host believes is saved.
        try:
            for field, limit in new_limits.items():
                unit_limits.set(unit_id, _CHANNEL_BY_FIELD[field], limit)
        except (OSError, ValueError) as err:
            logger.error(
                "[WS|units:update_limits] Failed to persist limits",
                unit_id=unit_id,
                error=str(err),
            )
            return CommandResult(
                status="error", message=f"Could not save limits: {err}"
            )

        changes = store.update_unit_limits(unit, new_limits)
        logger.info(
            f"[WS|units:update_limits] Updated {unit_id}",
            changes=changes,
            user=ctx.user.id,
        )
        ctx.notifier.notify("units:update", {"id": unit_id, "changes": changes})

    return CommandResult(status="ok")
