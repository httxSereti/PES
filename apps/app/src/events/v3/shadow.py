"""Shadow recording for the Events v3 migration.

In phase 0 there is no flow compiler yet, so the shadow plan is the legacy
plan itself. Recording it in `flow_runs` / `effect_ledger` proves the v3
telemetry path works and gives phase 1 a baseline to compare against.

Shadow recording never enqueues anything and never changes the legacy result.
It is opt-in via `EVENTS_V3_SHADOW_MODE=true`.
"""

from __future__ import annotations

from datetime import UTC, datetime

from cuid2 import cuid_wrapper

from database.models.flow import EffectLedger, FlowRun
from database.repositories.flow_repo import FlowRepo
from events.redaction import redact_payload

from .plan import EventPlan

generate_id = cuid_wrapper()

LEGACY_FLOW_ID = "legacy"


class ShadowRecorder:
    """Persist the legacy plan as a v3 `flow_run` for observability."""

    def __init__(self, repo: FlowRepo | None = None):
        self._repo = repo or FlowRepo()

    async def record(self, plan: EventPlan, *, latency_ms: int = 0) -> FlowRun:
        now = datetime.now(UTC)
        run_id = generate_id()

        queue_items = [
            {
                "id": item.id,
                "action_type": _action_type(item.action_type),
                "payload": redact_payload(item.payload),
                "duration": item.duration,
                "cumulative": item.cumulative,
                "priority": item.priority,
                "display_name": item.display_name,
                "trigger_rule_id": item.trigger_rule_id,
                "trigger_action_id": item.trigger_action_id,
                "modifiers": item.applied_modifiers,
            }
            for item in plan.items
        ]

        trace = {
            "event_type": plan.envelope.type,
            "origin": plan.envelope.origin,
            "source": plan.envelope.source,
            "skipped_reason": plan.skipped_reason,
            "rules": plan.summary,
            "queue_items": queue_items,
        }

        effects = [
            EffectLedger(
                id=generate_id(),
                run_id=run_id,
                node_id=item.trigger_action_id or item.trigger_rule_id or "legacy",
                effect_kind=_action_type(item.action_type),
                target={},
                params_before=redact_payload(item.payload),
                params_after=None,
                modifiers=item.applied_modifiers or None,
                clamp=None,
                blocked_reason=None,
                status="planned",
                queue_item_id=item.id,
                idempotency_key=(
                    f"legacy:{plan.envelope.id}:"
                    f"{item.trigger_action_id or item.id}"
                ),
                created_at=now,
            )
            for item in plan.items
        ]

        run = FlowRun(
            id=run_id,
            event_id=plan.envelope.id,
            flow_id=LEGACY_FLOW_ID,
            flow_version=0,
            status="shadow",
            trigger_node_id=None,
            correlation_id=plan.envelope.correlation_id,
            causation_id=plan.envelope.causation_id,
            started_at=now,
            finished_at=now,
            latency_ms=latency_ms,
            trace=trace,
        )
        return await self._repo.save_run(run, effects=effects)


def _action_type(value) -> str:
    return value.value if hasattr(value, "value") else str(value)
