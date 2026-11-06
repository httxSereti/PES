"""Lovense manual control commands (set, stop, pulse, battery, identify)."""

from __future__ import annotations

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import (
    CommandResult,
    LovenseBatteryCommand,
    LovenseIdentifyCommand,
    LovensePulseCommand,
    LovenseSetCommand,
    LovenseStopAllCommand,
    LovenseStopCommand,
)
from typings import Permission

from ._hub import get_hub, rate_limited, target_permission_error


@command(LovenseSetCommand, Permission.WRITE_DEVICES)
async def handle_lovense_set(
    msg: LovenseSetCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        targets = msg.payload.targets.model_dump()
        denied = target_permission_error(hub, targets, ctx.user)
        if denied:
            return CommandResult(status="error", message=denied)
        if rate_limited(hub, str(ctx.user.id)):
            return CommandResult(status="error", message="Lovense command rate limit exceeded")
        count = await hub.set_output(
            targets,
            msg.payload.output,
            msg.payload.feature,
            msg.payload.value,
            mode=msg.payload.mode,
            ramp_ms=msg.payload.ramp_ms,
            owner=f"manual:{ctx.user.id}",
            priority=30,
            ttl=float(hub.manual_hold_seconds),
            force=msg.payload.force,
        )
        if count == 0:
            return CommandResult(
                status="error",
                message="No matching online device/output (check the target and ownership)",
            )
        return CommandResult(status="ok", message=f"Updated {count} output(s)")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseStopCommand, Permission.WRITE_DEVICES)
async def handle_lovense_stop(
    msg: LovenseStopCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        targets = msg.payload.targets.model_dump()
        denied = target_permission_error(hub, targets, ctx.user)
        if denied:
            return CommandResult(status="error", message=denied)
        count = await hub.stop_outputs(
            targets, msg.payload.output
        )
        return CommandResult(status="ok", message=f"Stopped {count} output(s)")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseStopAllCommand, Permission.WRITE_DEVICES)
async def handle_lovense_stop_all(
    msg: LovenseStopAllCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await get_hub().stop_all(f"manual:{ctx.user.id}")
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovensePulseCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pulse(
    msg: LovensePulseCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        targets = msg.payload.targets.model_dump()
        denied = target_permission_error(hub, targets, ctx.user)
        if denied:
            return CommandResult(status="error", message=denied)
        if rate_limited(hub, str(ctx.user.id)):
            return CommandResult(status="error", message="Lovense command rate limit exceeded")
        await hub.pulse(
            targets,
            msg.payload.output,
            msg.payload.value,
            msg.payload.attack_ms,
            msg.payload.hold_ms,
            msg.payload.release_ms,
            owner=f"manual:{ctx.user.id}",
        )
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseBatteryCommand, Permission.READ_DEVICES)
async def handle_lovense_battery(
    msg: LovenseBatteryCommand, ctx: CommandContext
) -> CommandResult:
    try:
        rows = await get_hub().read_batteries(msg.payload.device_ids or None)
        return CommandResult(
            status="ok", message=f"Read {len(rows)} battery level(s)"
        )
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseIdentifyCommand, Permission.WRITE_DEVICES)
async def handle_lovense_identify(
    msg: LovenseIdentifyCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        denied = target_permission_error(
            hub, {"device_ids": [msg.payload.device_id]}, ctx.user
        )
        if denied:
            return CommandResult(status="error", message=denied)
        await hub.identify(msg.payload.device_id)
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))
