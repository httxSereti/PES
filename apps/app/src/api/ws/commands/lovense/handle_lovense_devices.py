"""Lovense device preference commands (alias, tags, cap, policy)."""

from __future__ import annotations

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import (
    CommandResult,
    LovenseDeviceDeleteCommand,
    LovenseDeviceUpdateCommand,
)
from typings import Permission

from ._hub import get_hub


@command(LovenseDeviceDeleteCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_device_delete(
    msg: LovenseDeviceDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await get_hub().delete_device(msg.payload.device_id)
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseDeviceUpdateCommand, Permission.WRITE_DEVICES)
async def handle_lovense_device_update(
    msg: LovenseDeviceUpdateCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await get_hub().update_device(
            msg.payload.device_id,
            alias=msg.payload.alias,
            tags=msg.payload.tags,
            max_intensity_pct=msg.payload.max_intensity_pct,
            control_policy=msg.payload.control_policy,
        )
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))
