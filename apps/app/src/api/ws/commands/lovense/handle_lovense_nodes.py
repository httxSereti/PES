"""Lovense node commands (save, delete, reconnect, rotate token, scan)."""

from __future__ import annotations

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import (
    CommandResult,
    LovenseNodeDeleteCommand,
    LovenseNodeReconnectCommand,
    LovenseNodeSaveCommand,
    LovenseNodeTokenCommand,
    LovenseScanCommand,
)
from typings import Permission

from ._hub import get_hub


@command(LovenseNodeSaveCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_node_save(
    msg: LovenseNodeSaveCommand, ctx: CommandContext
) -> CommandResult:
    try:
        result = await get_hub().add_node(
            name=msg.payload.name,
            kind=msg.payload.kind,
            url=msg.payload.url,
            enabled=msg.payload.enabled,
            node_id=msg.payload.node_id,
        )
        node = result["node"]
        return CommandResult(
            status="ok",
            node_id=str(node["id"]),
            token=result.get("token"),
        )
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseNodeDeleteCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_node_delete(
    msg: LovenseNodeDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await get_hub().delete_node(msg.payload.node_id)
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseNodeReconnectCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_node_reconnect(
    msg: LovenseNodeReconnectCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await get_hub().reconnect_node(msg.payload.node_id)
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseNodeTokenCommand, Permission.MANAGE_DEVICES)
async def handle_lovense_node_token(
    msg: LovenseNodeTokenCommand, ctx: CommandContext
) -> CommandResult:
    try:
        token = await get_hub().rotate_token(msg.payload.node_id)
        return CommandResult(status="ok", node_id=msg.payload.node_id, token=token)
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovenseScanCommand, Permission.WRITE_DEVICES)
async def handle_lovense_scan(
    msg: LovenseScanCommand, ctx: CommandContext
) -> CommandResult:
    try:
        result = await get_hub().scan(msg.payload.node_id, msg.payload.seconds)
        return CommandResult(
            status="ok", message=f"Scan finished ({result.get('found', 0)} found)"
        )
    except Exception as err:
        return CommandResult(status="error", message=str(err))
