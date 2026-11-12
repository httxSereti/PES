"""
Log streaming and log-file endpoints.

The live viewer uses Server-Sent Events (the same approach as autobrr/qui):
the stream starts with the buffered history, then pushes each new JSON log
line as it is emitted.  ``EventSource`` cannot send an ``Authorization``
header, so the JWT may be passed as a ``token`` query parameter (the
WebSocket endpoint already uses the same convention).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from api.helpers import require_permission, to_utc_iso
from api.helpers.jwt_helpers import ALGORITHM, SECRET_KEY
from store import Store
from typings import Permission
from utils.log_settings import log_settings
from utils.log_stream import log_hub

router = APIRouter(prefix="/logs", tags=["logs"])

store = Store()
logger = logging.getLogger("pes")


class LogSettingsUpdate(BaseModel):
    level: str | None = None


def _authenticate_stream(token: str | None, request: Request) -> dict:
    """Authorize an SSE connection from a query token or bearer header."""
    if not token:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    user = store.get_user(user_id) if user_id else None

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Unknown or inactive user")

    if not store.check_permission(user.id, Permission.ADMIN):
        raise HTTPException(status_code=403, detail="Missing permission: admin")

    return {
        "id": user.id,
        "display_name": user.display_name,
        "role": user.role.value,
    }


def _current_level() -> str:
    level = logging.getLevelName(logger.level)
    if not isinstance(level, str) or level == "NOTSET":
        return "INFO"
    return level


def _serialize_settings() -> dict:
    return {
        "level": _current_level(),
        "logDir": str(log_hub.log_dir),
    }


def _list_log_files() -> list[dict]:
    directory = log_hub.log_dir
    try:
        entries = list(directory.iterdir())
    except OSError:
        return []

    files: list[dict] = []
    for entry in entries:
        try:
            if not entry.is_file() or entry.is_symlink():
                continue
            stat = entry.stat()
        except OSError:
            continue
        files.append(
            {
                "name": entry.name,
                "sizeBytes": stat.st_size,
                "modTime": to_utc_iso(
                    datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                ),
            }
        )

    files.sort(key=lambda file: file["modTime"] or "", reverse=True)
    return files


@router.get("/stream")
async def stream_logs(
    request: Request,
    token: str | None = None,
    limit: int = Query(1000, ge=1, le=5000),
):
    """SSE stream: buffered history followed by live log lines."""
    _authenticate_stream(token, request)

    loop = asyncio.get_running_loop()
    subscription, history = log_hub.subscribe(loop, limit=limit)

    async def generate():
        try:
            for line in history:
                yield f"data: {line}\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    line = await asyncio.wait_for(
                        subscription.queue.get(), timeout=15
                    )
                except TimeoutError:
                    yield ": keepalive\n\n"
                else:
                    yield f"data: {line}\n\n"
        finally:
            log_hub.unsubscribe(subscription)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/settings")
async def get_log_settings(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    return _serialize_settings()


@router.put("/settings")
async def update_log_settings(
    body: LogSettingsUpdate,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    if body.level is not None:
        try:
            log_settings.set_level(body.level)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid log level: {body.level}",
            ) from None
        logger.setLevel(log_settings.level_int())

    return _serialize_settings()


@router.get("/files")
async def list_log_files(
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    return _list_log_files()


@router.get("/files/{filename}")
async def download_log_file(
    filename: str,
    current_user: dict = Depends(require_permission(Permission.ADMIN)),
):
    directory = log_hub.log_dir.resolve()
    candidate: Path = (directory / filename).resolve()

    # Traversal/symlink guard: only serve a regular file that lives directly
    # inside the configured log directory.
    if candidate.parent != directory or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Log file not found")

    media_type = (
        "application/gzip" if candidate.suffix == ".gz" else "text/plain; charset=utf-8"
    )
    return FileResponse(
        candidate,
        media_type=media_type,
        filename=candidate.name,
    )
