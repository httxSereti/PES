"""Data structures shared by the v3 dispatcher hooks and shadow recorder."""

from __future__ import annotations

from dataclasses import dataclass, field

from events.envelope import EventEnvelope
from events.models import QueueItem, TriggerRule


@dataclass
class ApprovalDraft:
    """A matched rule waiting for an explicit approval decision."""

    rule_id: str
    rule_name: str
    timeout_seconds: int
    items: list[QueueItem] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


@dataclass
class EventPlan:
    """What the dispatcher would do for one event, before side effects."""

    envelope: EventEnvelope
    rules: list[TriggerRule] = field(default_factory=list)
    items: list[QueueItem] = field(default_factory=list)
    summary: list[dict] = field(default_factory=list)
    # Matched rules whose actions wait for an approval decision.
    approvals: list[ApprovalDraft] = field(default_factory=list)
    # Full per-rule result, including skipped rules, used by telemetry.
    rule_results: list[dict] = field(default_factory=list)
    skipped_reason: str | None = None
    warnings: list[str] = field(default_factory=list)
