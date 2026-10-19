"""
Core contracts of the Integrations module.

An Integration contributes to the app through three surfaces:

    events    — what it can report (sources for trigger rules)
    actions   — what it can do when a rule fires
    settings  — its configuration (non-secret values in JSON, secrets in env)

Two kinds of integrations:

    CORE     — built-in hardware (units, sensors). Always enabled, cannot be
               disabled or removed; thin facades over the existing hardware
               code, which keeps ownership of its own state.
    EXTERNAL — third-party services (Chaster, ...). Enable/disable,
               credentials, own REST routes, isolated failures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Literal, Protocol

if TYPE_CHECKING:
    from fastapi import APIRouter

    from api.ws.websocket_notifier import WebSocketNotifier
    from events.dispatcher import EventDispatcher
    from events.models import QueueItem
    from store import Store

    from .registry import IntegrationRegistry


class IntegrationKind(str, Enum):
    CORE = "core"
    EXTERNAL = "external"


class SettingType(str, Enum):
    BOOL = "bool"
    STR = "str"
    INT = "int"
    SELECT = "select"
    SECRET = "secret"


@dataclass(frozen=True)
class EventDef:
    """
    One triggerable event.

    `id` is persisted in `trigger_rule.event_type`, so existing ids must
    never be renamed. `group` is an optional display subgroup (e.g.
    "Pillory", "Votes") used to order and section events in the UI.
    """

    id: str
    label: str
    description: str = ""
    group: str = ""
    # Documentation only: {field: "description"} shown in the UI/reference.
    data_schema: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ActionDef:
    """
    One action type.

    `id` maps to a persisted ActionType value. When `handler` is set the
    action runs through the queue in the integration itself; otherwise the
    core ActionExecutor executes it (hardware actions). `group` is an
    optional display subgroup used to section actions in the UI.
    """

    id: str
    label: str
    description: str = ""
    group: str = ""
    payload_schema: dict[str, str] = field(default_factory=dict)
    reversible: bool = False
    handler: ActionHandler | None = None


class ActionHandler(Protocol):
    """Runs the apply/reverse side of one action inside the action queue."""

    async def apply(self, item: QueueItem) -> dict | None: ...

    async def reverse(self, item: QueueItem) -> None: ...


@dataclass(frozen=True)
class SettingDef:
    """
    One integration setting.

    `source="json"` values are stored in configurations/integrations.json
    and editable from the UI; `source="env"` values are read from config.env
    and are read-only.
    """

    key: str
    label: str
    type: SettingType = SettingType.STR
    description: str = ""
    source: Literal["json", "env"] = "json"
    env_var: str | None = None
    default: Any = None
    options: tuple[str, ...] = ()
    secret: bool = False


@dataclass
class IntegrationContext:
    """Runtime services handed to integrations on start()."""

    store: Store
    dispatcher: EventDispatcher
    registry: IntegrationRegistry
    notifier: WebSocketNotifier | None = None


class Integration:
    """
    Base class of every integration. Subclasses declare their id, kind and
    the events/actions/settings they contribute, then optionally override
    `router()` / `start()` / `stop()` for runtime behavior.
    """

    id: str = ""
    name: str = ""
    description: str = ""
    kind: IntegrationKind = IntegrationKind.EXTERNAL

    # ───────── Contribution surfaces ─────────

    def events(self) -> list[EventDef]:
        return []

    def actions(self) -> list[ActionDef]:
        return []

    def settings(self) -> list[SettingDef]:
        return []

    # ───────── Optional runtime behavior ─────────

    def router(self) -> APIRouter | None:
        """REST router mounted by the app (webhooks, OAuth callbacks, ...)."""
        return None

    def endpoint(self) -> str | None:
        """
        User-facing connection URI shown in the UI (e.g. the WebSocket URL
        PuryFi must be pointed at). None when the integration has none.
        """
        return None

    async def start(self, ctx: IntegrationContext) -> None:
        """Called once at app startup, after the core singletons exist."""

    async def stop(self) -> None:
        """Called once at app shutdown."""

    def health(self) -> dict[str, Any]:
        """Small status payload surfaced to the UI."""
        return {"status": "ok"}
