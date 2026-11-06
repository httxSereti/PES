"""Lovense pattern (profile) commands."""

from __future__ import annotations

from typing import Any

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import (
    CommandResult,
    LovensePatternDeleteCommand,
    LovensePatternDetailCommand,
    LovensePatternDuplicateCommand,
    LovensePatternExportCommand,
    LovensePatternIdPayload,
    LovensePatternImportCommand,
    LovensePatternListCommand,
    LovensePatternPlayCommand,
    LovensePatternSaveCommand,
    LovensePatternStopCommand,
)
from typings import Permission

from ._hub import get_hub, target_permission_error


def _detail(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "author_id": row.author_id,
        "visibility": row.visibility,
        "tags": list(row.tags or []),
        "built_in": row.author_id == "system",
        "duration_ms": 0,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "definition": row.definition,
    }


@command(LovensePatternListCommand, Permission.READ_DEVICES)
async def handle_lovense_pattern_list(
    msg: LovensePatternListCommand, ctx: CommandContext
) -> CommandResult:
    hub = get_hub()
    ctx.notifier.notify_to_users(
        "lovense:patterns", hub.serialize_patterns(), [ctx.user.id]
    )
    return CommandResult(status="ok")


@command(LovensePatternDetailCommand, Permission.READ_DEVICES)
async def handle_lovense_pattern_detail(
    msg: LovensePatternDetailCommand, ctx: CommandContext
) -> CommandResult:
    row = get_hub().get_pattern_row(msg.payload.pattern_id)
    if row is None:
        return CommandResult(status="error", message="Pattern not found")
    ctx.notifier.notify_to_users(
        "lovense:pattern_detail", _detail(row), [ctx.user.id]
    )
    return CommandResult(status="ok", pattern_id=row.id)


@command(LovensePatternExportCommand, Permission.READ_DEVICES)
async def handle_lovense_pattern_export(
    msg: LovensePatternExportCommand, ctx: CommandContext
) -> CommandResult:
    return await handle_lovense_pattern_detail(
        LovensePatternDetailCommand(
            id=msg.id,
            payload=LovensePatternIdPayload(pattern_id=msg.payload.pattern_id),
        ),
        ctx,
    )


@command(LovensePatternSaveCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pattern_save(
    msg: LovensePatternSaveCommand, ctx: CommandContext
) -> CommandResult:
    try:
        row = await get_hub().save_pattern(
            name=msg.payload.name,
            definition=msg.payload.definition,
            description=msg.payload.description or "",
            visibility=msg.payload.visibility,
            tags=msg.payload.tags,
            pattern_id=msg.payload.pattern_id,
            author_id=str(ctx.user.id),
        )
        return CommandResult(status="ok", pattern_id=row.id)
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovensePatternDeleteCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pattern_delete(
    msg: LovensePatternDeleteCommand, ctx: CommandContext
) -> CommandResult:
    try:
        await get_hub().delete_pattern(msg.payload.pattern_id)
        return CommandResult(status="ok")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovensePatternDuplicateCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pattern_duplicate(
    msg: LovensePatternDuplicateCommand, ctx: CommandContext
) -> CommandResult:
    try:
        row = get_hub().get_pattern_row(msg.payload.pattern_id)
        if row is None:
            return CommandResult(status="error", message="Pattern not found")
        copy = await get_hub().save_pattern(
            name=msg.payload.name,
            definition=row.definition,
            description=row.description or "",
            visibility="private",
            tags=list(row.tags or []),
            author_id=str(ctx.user.id),
        )
        return CommandResult(status="ok", pattern_id=copy.id)
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovensePatternPlayCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pattern_play(
    msg: LovensePatternPlayCommand, ctx: CommandContext
) -> CommandResult:
    try:
        hub = get_hub()
        targets = msg.payload.targets.model_dump()
        denied = target_permission_error(hub, targets, ctx.user)
        if denied:
            return CommandResult(status="error", message=denied)
        run = await hub.play_pattern(
            pattern_id=msg.payload.pattern_id,
            pattern_name=msg.payload.pattern_name,
            targets=targets,
            options={
                "duration": msg.payload.duration,
                "loop": msg.payload.loop,
                "loop_count": msg.payload.loop_count,
                "scale_pct": msg.payload.scale_pct,
                "replace": msg.payload.replace,
                "fade_in_ms": msg.payload.fade_in_ms,
                "fade_out_ms": msg.payload.fade_out_ms,
                "sync_offset_ms": msg.payload.sync_offset_ms,
            },
            origin=f"manual:{ctx.user.id}",
            created_by=str(ctx.user.id),
        )
        return CommandResult(status="ok", run_id=run["id"])
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovensePatternStopCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pattern_stop(
    msg: LovensePatternStopCommand, ctx: CommandContext
) -> CommandResult:
    try:
        count = await get_hub().stop_patterns(
            run_id=msg.payload.run_id,
            pattern_id=msg.payload.pattern_id,
            all_runs=bool(
                msg.payload.all
                or (not msg.payload.run_id and not msg.payload.pattern_id)
            ),
            reason=f"manual:{ctx.user.id}",
        )
        return CommandResult(status="ok", message=f"Stopped {count} pattern(s)")
    except Exception as err:
        return CommandResult(status="error", message=str(err))


@command(LovensePatternImportCommand, Permission.WRITE_DEVICES)
async def handle_lovense_pattern_import(
    msg: LovensePatternImportCommand, ctx: CommandContext
) -> CommandResult:
    document = msg.payload.document
    try:
        definition = dict(document.get("definition") or document)
        name = str(document.get("name") or definition.get("name") or "Imported pattern")
        definition["name"] = name
        row = await get_hub().save_pattern(
            name=name,
            definition=definition,
            description=str(document.get("description") or ""),
            visibility=str(document.get("visibility") or "private"),
            tags=list(document.get("tags") or []),
            author_id=str(ctx.user.id),
        )
        return CommandResult(status="ok", pattern_id=row.id)
    except Exception as err:
        return CommandResult(status="error", message=str(err))
