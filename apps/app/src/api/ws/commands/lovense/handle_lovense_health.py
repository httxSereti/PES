"""Lovense health command (personal reply)."""

from __future__ import annotations

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, LovenseHealthCommand
from typings import Permission

from ._hub import get_hub


@command(LovenseHealthCommand, Permission.READ_DEVICES)
async def handle_lovense_health(
    msg: LovenseHealthCommand, ctx: CommandContext
) -> CommandResult:
    ctx.notifier.notify_to_users(
        "lovense:health", get_hub().health(), [ctx.user.id]
    )
    return CommandResult(status="ok")
