"""Persist per-rule flow runs, node traces and effect ledger entries.

This is the phase 2 telemetry path. It is intentionally separate from
`ShadowRecorder` (which records the legacy plan) and can be enabled with
`EVENTS_V3_TELEMETRY=true`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from cuid2 import cuid_wrapper

from database.models.flow import EffectLedger, FlowRun, NodeRun
from database.repositories.flow_repo import FlowRepo

from .config import get_v3_config
from .plan import EventPlan

generate_id = cuid_wrapper()


class TelemetryRecorder:
    """Write one `flow_run` per evaluated rule, plus nodes and effects."""

    def __init__(self, repo: FlowRepo | None = None):
        self._repo = repo or FlowRepo()

    async def record(self, plan: EventPlan, *, latency_ms: int = 0) -> list[str]:
        if not get_v3_config().telemetry:
            return []

        now = datetime.now(UTC)
        run_ids: list[str] = []

        for rule_summary in plan.rule_results:
            rule_id = rule_summary.get("rule_id")
            rule = next((candidate for candidate in plan.rules if candidate.id == rule_id), None)
            if rule is None:
                continue

            run_id = generate_id()
            rule_items = [item for item in plan.items if item.trigger_rule_id == rule.id]
            rule_summary = dict(rule_summary)
            skip_reason = rule_summary.get("skipped_reason")
            matched = bool(rule_summary.get("matched", True))
            status = (
                "deferred"
                if skip_reason == "pending_approval"
                else "matched" if matched else "skipped"
            )

            node_runs = self._node_runs(
                rule=rule,
                rule_summary=rule_summary,
                run_id=run_id,
                matched=matched,
                now=now,
            )
            effects = self._effects(
                rule=rule,
                items=rule_items,
                run_id=run_id,
                now=now,
            )

            run = FlowRun(
                id=run_id,
                event_id=plan.envelope.id,
                flow_id=f"rule:{rule.id}",
                flow_version=1,
                status=status,
                trigger_node_id="trigger",
                correlation_id=plan.envelope.correlation_id,
                causation_id=plan.envelope.causation_id,
                started_at=now,
                finished_at=now,
                latency_ms=latency_ms,
                trace=rule_summary,
            )
            await self._repo.save_run(run, node_runs=node_runs, effects=effects)
            run_ids.append(run_id)

        return run_ids

    @staticmethod
    def _node_runs(
        *,
        rule: Any,
        rule_summary: dict,
        run_id: str,
        matched: bool,
        now: datetime,
    ) -> list[NodeRun]:
        nodes: list[NodeRun] = [
            NodeRun(
                id=generate_id(),
                run_id=run_id,
                node_id="trigger",
                node_type="trigger.event",
                status="passed",
                started_at=now,
                duration_ms=0,
                output_preview={"event_types": [rule.event_type]},
            )
        ]

        for index, condition in enumerate(getattr(rule, "conditions", []) or []):
            nodes.append(
                NodeRun(
                    id=generate_id(),
                    run_id=run_id,
                    node_id=f"condition_{index}",
                    node_type="logic.guard",
                    status="passed" if matched else "skipped",
                    started_at=now,
                    duration_ms=0,
                    input_preview=condition if isinstance(condition, dict) else {"condition": condition},
                    reason=None if matched else "conditions did not match",
                )
            )

        for index, action_summary in enumerate(rule_summary.get("actions", [])):
            nodes.append(
                NodeRun(
                    id=generate_id(),
                    run_id=run_id,
                    node_id=f"action_{index}",
                    node_type="effect.action",
                    status="planned",
                    started_at=now,
                    duration_ms=0,
                    input_preview={
                        "action_type": action_summary.get("action_type"),
                        "payload": action_summary.get("payload"),
                    },
                    output_preview={
                        "duration": action_summary.get("duration"),
                        "modifiers": action_summary.get("modifiers"),
                    },
                )
            )

        return nodes

    @staticmethod
    def _effects(
        *,
        rule: Any,
        items: list[Any],
        run_id: str,
        now: datetime,
    ) -> list[EffectLedger]:
        actions = {action.id: action for action in getattr(rule, "actions", []) or []}
        effects: list[EffectLedger] = []
        for item in items:
            action = actions.get(item.trigger_action_id)
            effects.append(
                EffectLedger(
                    id=generate_id(),
                    run_id=run_id,
                    node_id=item.trigger_action_id or "action",
                    effect_kind=item.action_type.value,
                    target={},
                    params_before=dict(getattr(action, "payload", {}) or {}),
                    params_after=dict(item.payload or {}),
                    modifiers=item.applied_modifiers or None,
                    clamp=None,
                    blocked_reason=None,
                    status="planned",
                    queue_item_id=item.id,
                    idempotency_key=f"run:{run_id}:{item.id}",
                    created_at=now,
                )
            )
        return effects
