"""Data structures shared by the v3 dispatcher hooks and shadow recorder."""

from __future__ import annotations

from dataclasses import dataclass, field

from events.envelope import EventEnvelope
from events.models import QueueItem, TriggerRule


@dataclass
class EventPlan:
    """What the dispatcher would do for one event, before side effects."""

    envelope: EventEnvelope
    rules: list[TriggerRule] = field(default_factory=list)
    items: list[QueueItem] = field(default_factory=list)
    summary: list[dict] = field(default_factory=list)
    skipped_reason: str | None = None
    warnings: list[str] = field(default_factory=list)
