"""Managed Intiface Engine commands."""

from __future__ import annotations

import asyncio

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import (
    CommandResult,
    LovenseIntifaceRestartCommand,
    LovenseIntifaceStartCommand,
    LovenseIntifaceStopCommand,
)
from typings import Permission

from ._hub import get_hub


def _result(status: dict) -> CommandResult:
    if status.get("status") in {"error", "not_found"}:
        return CommandResult(
            status="error",
            message=str(status.get("last_error") or "Intiface unavailable"),
        )
    return CommandResult(status="ok", message=str(status.get("status")))


@command(LovenseIntifaceStartCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_intiface_start(
    msg: LovenseIntifaceStartCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        asyncio.create_task(hub.start_intiface(), name="lovense-intiface-start")
        return CommandResult(status="ok", message="starting")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseIntifaceStopCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_intiface_stop(
    msg: LovenseIntifaceStopCommand, ctx: CommandContext
) -> CommandResult:
    try:
        return _result(await get_hub().stop_intiface())
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseIntifaceRestartCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_intiface_restart(
    msg: LovenseIntifaceRestartCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        asyncio.create_task(hub.restart_intiface(), name="lovense-intiface-restart")
        return CommandResult(status="ok", message="restarting")
    except Exception as err:
        return CommandResult(status="error", message=str(err))
