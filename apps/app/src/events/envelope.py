"""Canonical event envelope shared by the event bus and the v3 flow engine.

The envelope is the stable, platform-independent shape of an event. It is
built at the dispatcher boundary so every consumer (trigger rules, telemetry,
flows, replay) sees the same identity, actor, correlation and causation fields.

Compatibility note: `EventEnvelope.payload` keeps the historical `event_data`
shape. Existing integrations do not need to change; they can keep dispatching
plain dictionaries until they are migrated to the connector SDK.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ActorRef(BaseModel):
    """Reference to a unified actor, independent of the source platform."""

    id: str | None = None  # internal PES actor id (actors.id)
    platform: str = "unknown"
    platform_id: str = ""
    display_name: str | None = None
    is_self: bool = False
    is_bot: bool = False
    is_blocked: bool = False
    roles: list[str] = Field(default_factory=list)
    trust: float = 0.5
    # `metadata` is fine on a pydantic model; only SQLAlchemy reserves it.
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubjectRef(BaseModel):
    """What the event is about (session, lock, device, unit, channel...)."""

    kind: str
    id: str
    label: str | None = None


class EventEnvelope(BaseModel):
    """Immutable event identity + normalized payload + source metadata."""

    model_config = ConfigDict(frozen=True)

    id: str
    type: str
    version: int = 1
    source: str = "unknown"
    # Human-readable origin used by the existing event console.
    origin: str = "unknown"
    account: str | None = None
    actor: ActorRef | None = None
    subject: SubjectRef | None = None
    occurred_at: datetime
    received_at: datetime
    session_id: str | None = None
    correlation_id: str
    causation_id: str | None = None
    dedupe_key: str | None = None
    severity: str = "info"
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)
    # Debug-only raw payload. Never exposed to rules; redacted before storage.
    raw: dict[str, Any] | None = None
    # PES-specific controls used by the event pipeline.
    chain_depth: int = 0
    source_integration_id: str | None = None


def build_envelope(
    *,
    event_id: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
    origin: str = "unknown",
    source: str | None = None,
    actor: ActorRef | None = None,
    subject: SubjectRef | None = None,
    occurred_at: datetime | None = None,
    received_at: datetime | None = None,
    session_id: str | None = None,
    correlation_id: str | None = None,
    causation_id: str | None = None,
    dedupe_key: str | None = None,
    severity: str = "info",
    tags: list[str] | None = None,
    version: int = 1,
    raw: dict[str, Any] | None = None,
    chain_depth: int = 0,
    source_integration_id: str | None = None,
) -> EventEnvelope:
    """Build an envelope with sensible defaults for legacy dispatch calls."""

    now = datetime.now(UTC)
    return EventEnvelope(
        id=event_id,
        type=event_type,
        version=version,
        source=source or source_integration_id or origin,
        origin=origin,
        actor=actor,
        subject=subject,
        occurred_at=occurred_at or now,
        received_at=received_at or now,
        session_id=session_id,
        correlation_id=correlation_id or event_id,
        causation_id=causation_id,
        dedupe_key=dedupe_key,
        severity=severity,
        tags=list(tags or []),
        payload=payload or {},
        raw=raw,
        chain_depth=chain_depth,
        source_integration_id=source_integration_id,
    )


def actor_ref_from_payload(payload: Mapping[str, Any]) -> ActorRef | None:
    """
    Best-effort actor extraction from a legacy event payload.

    New connectors should send a structured `actor` object. This helper keeps
    existing payloads (`author`, `user`, ...) usable by simulation without
    forcing every integration to migrate at once.
    """

    raw = payload.get("actor")
    if isinstance(raw, ActorRef):
        return raw
    if not isinstance(raw, Mapping):
        raw = payload.get("author")
    if not isinstance(raw, Mapping):
        return None

    platform_id = raw.get("platform_id") or raw.get("id") or raw.get("user_id")
    if platform_id is None:
        return None

    platform = str(raw.get("platform") or payload.get("platform") or "unknown")
    display_name = raw.get("display_name") or raw.get("username") or raw.get("name")
    is_bot = bool(raw.get("is_bot", False))

    return ActorRef(
        platform=platform,
        platform_id=str(platform_id),
        display_name=str(display_name) if display_name is not None else None,
        is_bot=is_bot,
    )
