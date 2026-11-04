"""Shared access helpers for the training WS command handlers."""

from __future__ import annotations

from api.ws.context import CommandContext
from store import Store
from typings import Permission


def is_host(ctx: CommandContext) -> bool:
    return Store().check_permission(ctx.user.id, Permission.HOST)


def active_app_session_id() -> str | None:
    session = Store().get_active_session()
    return session["id"] if session else None
