from __future__ import annotations

import copy
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from typing import Any, TYPE_CHECKING

import structlog
from cuid2 import cuid_wrapper

from database.models.triggered_event import TriggeredEvent
from database.repositories.actor_repo import ActorRepo
from database.repositories.approval_repo import ApprovalRepo
from database.repositories.trigger_rule_graph_repo import TriggerRuleGraphRepo
from database.repositories.trigger_rule_repo import TriggerRuleRepo, rule_event_types
from database.repositories.triggered_event_repo import TriggeredEventRepo
from events.enums import ActionType, QueueItemStatus
from events.envelope import ActorRef, EventEnvelope, actor_ref_from_payload, build_envelope
from events.conditions import build_condition_context, evaluate_conditions
from events.flows import FlowSpec, compile_trigger_rule, graph_from_rule
from events.flows.expressions import render_value
from events.flows.runtime import FlowEffect, FlowGateState, FlowRuntime, FlowRuntimeResult
from events.models import QueueItem, TriggerAction, TriggerRule
from events.modifiers import apply_modifiers
from events.queue import ActionQueue
from events.redaction import redact_payload, redact_triggered_rules
from events.registry import EventRegistry
from events.serialization import queue_item_to_dict
from events.v3 import (
    ApprovalDraft,
    EventPlan,
    ShadowRecorder,
    TelemetryRecorder,
    get_v3_config,
)
from integrations import integration_registry
from integrations.base import IntegrationKind
from store import Store

if TYPE_CHECKING:
    from api.ws.websocket_notifier import WebSocketNotifier
    from integrations.registry import IntegrationRegistry

logger = structlog.get_logger("pes")
generate_id = cuid_wrapper()

# Actions may cause events (integration polling/webhooks), which may trigger
# more actions. Same-integration actions are filtered on tagged echoes; this
# hard cap stops longer cross-integration cycles.
_MAX_EVENT_CHAIN_DEPTH = 8

store = Store()


class EventDispatcher:
    _instance: EventDispatcher | None = None

    @classmethod
    def get_instance(cls) -> EventDispatcher:
        if cls._instance is None:
            raise RuntimeError("EventDispatcher not initialized")
        return cls._instance

    def __init__(
        self,
        registry: EventRegistry,
        queue: ActionQueue,
        ws_notifier: WebSocketNotifier | None = None,
        integrations: IntegrationRegistry | None = None,
        event_repo: TriggeredEventRepo | None = None,
        shadow_recorder: ShadowRecorder | None = None,
        actor_repo: ActorRepo | None = None,
        telemetry_recorder: TelemetryRecorder | None = None,
        approval_repo: ApprovalRepo | None = None,
    ):
        EventDispatcher._instance = self
        self._registry = registry
        self._queue = queue
        self._ws_notifier = ws_notifier
        self._event_repo = event_repo or TriggeredEventRepo()
        self._integrations = integrations or integration_registry
        self._shadow = shadow_recorder or ShadowRecorder()
        self._actors = actor_repo or ActorRepo()
        self._telemetry = telemetry_recorder or TelemetryRecorder()
        self._approvals = approval_repo or ApprovalRepo()
        # In-memory rate-limit state, keyed by rule id. Resets on restart.
        self._cooldowns: dict[str, float] = {}
        self._window_hits: dict[str, deque[float]] = {}
        self._budget_hits: dict[str, deque[float]] = {}
        # Dedupe stage: source key -> monotonic first-seen time.
        self._dedupe_seen: dict[str, float] = {}
        # Native FlowSpec runtime for rules with a saved canvas graph.
        self._flow_gates = FlowGateState()
        self._flow_runtime = FlowRuntime(
            subflow_resolver=self._resolve_subflow_graph,
            gate_store=self._flow_gates,
        )

    async def dispatch(
        self,
        event_type: str,
        event_data: dict | None = None,
        origin: str = "unknown",
        chain_depth: int = 0,
        source_integration_id: str | None = None,
        *,
        actor: ActorRef | None = None,
        occurred_at: datetime | None = None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
        dedupe_key: str | None = None,
        severity: str = "info",
        tags: list[str] | None = None,
    ) -> None:
        """
        Dispatch an event: resolve trigger rules, create queue items, enqueue.

        The v3 envelope is built here so every persisted event and broadcast
        carries the same identity, actor, correlation and causation metadata.
        Legacy integrations can keep sending plain `event_data` dictionaries.

        Args:
            event_type: TriggerableEvent value or `custom:*` dynamic code
            event_data: Contextual data from the event source
            origin: Human-readable origin description
            chain_depth: Causation depth for an event caused by an action echo
            source_integration_id: Integration whose action caused this echo
            actor: Optional unified actor reference
            occurred_at: Source timestamp (defaults to now)
            correlation_id: Root event id for the chain (defaults to this event)
            causation_id: Event id that caused this one
            dedupe_key: Stable source key used by the future dedupe stage
            severity: Event severity (`info`, `warning`, `critical`, ...)
            tags: Optional labels for telemetry and filtering
        """
        started = time.perf_counter()
        event_id = generate_id()
        v3_config = get_v3_config()
        if dedupe_key and self._is_duplicate(dedupe_key):
            logger.debug(
                "[Dispatcher] Duplicate event ignored",
                event_type=event_type,
                dedupe_key=dedupe_key,
            )
            return
        if actor is not None:
            actor = await self._resolve_actor(actor)
        plan = await self._build_plan(
            event_id=event_id,
            event_type=event_type,
            event_data=event_data or {},
            origin=origin,
            chain_depth=chain_depth,
            source_integration_id=source_integration_id,
            actor=actor,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
            dedupe_key=dedupe_key,
            severity=severity,
            tags=tags,
        )

        logger.debug(
            "[Dispatcher] Event received",
            event_id=event_id,
            event_type=event_type,
            origin=origin,
            correlation_id=plan.envelope.correlation_id,
            chain_depth=chain_depth,
            source_integration_id=source_integration_id,
            skipped_reason=plan.skipped_reason,
        )

        # Disabled at the integration or per-event level, or outside the
        # active session scope: drop entirely (no DB record, no queue items).
        # Re-enabling brings the rules back.
        if plan.skipped_reason in {"event_disabled", "out_of_scope"}:
            return

        await self._save_and_notify(plan.envelope, plan.summary)
        await self._save_approvals(plan)

        if plan.items:
            self._queue.enqueue(plan.items)

        if v3_config.shadow_mode:
            await self._record_shadow(plan, started)

        await self._record_telemetry(plan, started)
        await self._dispatch_emissions(
            plan,
            origin=origin,
            chain_depth=chain_depth,
            actor=actor,
        )

    async def run_rule_manual(
        self,
        rule_id: str,
        *,
        event_data: dict[str, Any] | None = None,
        actor: ActorRef | None = None,
    ) -> dict[str, Any] | None:
        """
        Execute one rule's FlowSpec with a manual/schedule trigger.

        Used by the `POST /api/events/rules/{id}/run` endpoint and by external
        schedulers. It goes through the same gates, approvals, queue and
        telemetry path as a normal event.
        """
        rule = await TriggerRuleRepo().get_rule(rule_id)
        if rule is None:
            return None
        started = time.perf_counter()
        event_id = generate_id()
        if actor is not None:
            actor = await self._resolve_actor(actor)
        payload = event_data or {}
        event_type = rule.event_type or "system.manual"
        plan = await self._build_plan(
            event_id=event_id,
            event_type=event_type,
            event_data=payload,
            origin="manual",
            chain_depth=0,
            source_integration_id=None,
            actor=actor,
            occurred_at=None,
            correlation_id=None,
            causation_id=None,
            dedupe_key=None,
            severity="info",
            tags=["manual"],
            check_known=False,
            include_unmatched=True,
            rules_override=[rule],
            manual=True,
        )
        if plan.skipped_reason not in {"event_disabled", "out_of_scope"}:
            await self._save_and_notify(plan.envelope, plan.summary)
            await self._save_approvals(plan)
            if plan.items:
                self._queue.enqueue(plan.items)
            if get_v3_config().shadow_mode:
                await self._record_shadow(plan, started)
            await self._record_telemetry(plan, started)
            await self._dispatch_emissions(
                plan,
                origin="manual",
                chain_depth=0,
                actor=actor,
            )
        return {
            "event": redact_payload(plan.envelope.model_dump(mode="json")),
            "matched": plan.skipped_reason is None,
            "skipped_reason": plan.skipped_reason,
            "rules": redact_triggered_rules(plan.summary),
            "queue_items": [
                {
                    "id": item.id,
                    "action_type": item.action_type.value,
                    "payload": self._redacted_action_payload(
                        item.action_type.value, item.payload
                    ),
                    "duration": item.duration,
                    "cumulative": item.cumulative,
                    "priority": item.priority,
                    "display_name": item.display_name,
                    "trigger_rule_id": item.trigger_rule_id,
                    "trigger_action_id": item.trigger_action_id,
                    "modifiers": item.applied_modifiers,
                }
                for item in plan.items
            ],
            "counts": {
                "rules": len(plan.rules),
                "actions": len(plan.items),
                "approvals": len(plan.approvals),
                "emissions": len(plan.emissions),
            },
        }

    async def dispatch_direct(
        self,
        event_type: str,
        items: list[QueueItem],
        event_data: dict | None = None,
        origin: str = "unknown",
        summary_name: str | None = None,
        chain_depth: int = 0,
        source_integration_id: str | None = None,
        *,
        actor: ActorRef | None = None,
        occurred_at: datetime | None = None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
        dedupe_key: str | None = None,
        severity: str = "info",
        tags: list[str] | None = None,
    ) -> None:
        """
        Dispatch pre-built queue items without resolving trigger rules.

        Used by integrations whose dynamic actions (e.g. Chaster WOF codes)
        bypass the rule engine. The event is still logged and broadcast with
        the item summary so it shows up in the event history.
        """
        event_data = event_data or {}
        if dedupe_key and self._is_duplicate(dedupe_key):
            logger.debug(
                "[Dispatcher] Duplicate direct event ignored",
                event_type=event_type,
                dedupe_key=dedupe_key,
            )
            return
        event_id = generate_id()
        triggered_at = datetime.now(UTC)
        if actor is not None:
            actor = await self._resolve_actor(actor)

        if not self._session_allows_event(event_type):
            logger.debug(
                f"[Dispatcher] Direct event '{event_type}' outside session scope, ignored",
                event_id=event_id,
                origin=origin,
            )
            return

        if not self._integrations.is_event_enabled(event_type):
            logger.debug(
                f"[Dispatcher] Direct event '{event_type}' disabled, ignored",
                event_id=event_id,
                origin=origin,
            )
            return

        if chain_depth >= _MAX_EVENT_CHAIN_DEPTH:
            logger.warning(
                "[Dispatcher] Direct event chain depth limit reached, ignored",
                event_id=event_id,
                event_type=event_type,
                origin=origin,
                chain_depth=chain_depth,
            )
            return

        # Manual/dynamic items follow the same action toggles and local-echo
        # gates as rule items.
        enabled_items = [
            item
            for item in items
            if self._integrations.is_action_enabled(item.action_type.value)
            and not self._is_local_echo_action(
                item.action_type.value, source_integration_id
            )
        ]
        skipped = len(items) - len(enabled_items)
        if skipped:
            logger.debug(
                f"[Dispatcher] Direct dispatch '{event_type}': {skipped} item(s) skipped (disabled or local echo)",
                event_id=event_id,
                origin=origin,
            )
        items = enabled_items
        if not items:
            return

        for item in items:
            item.causation_depth = chain_depth + 1

        logger.debug(
            f"[Dispatcher] Direct dispatch '{event_type}' with {len(items)} item(s)",
            event_id=event_id,
            origin=origin,
            chain_depth=chain_depth,
        )

        envelope = build_envelope(
            event_id=event_id,
            event_type=event_type,
            payload=event_data,
            origin=origin,
            source=source_integration_id or origin,
            actor=actor,
            occurred_at=occurred_at,
            received_at=triggered_at,
            session_id=self._active_session_id(),
            correlation_id=correlation_id,
            causation_id=causation_id,
            dedupe_key=dedupe_key,
            severity=severity,
            tags=tags,
            chain_depth=chain_depth,
            source_integration_id=source_integration_id,
        )
        await self._save_and_notify(
            envelope,
            self._build_direct_summary(summary_name or event_type, items),
        )

        if items:
            self._queue.enqueue(items)

    async def simulate(
        self,
        *,
        event_type: str,
        event_data: dict | None = None,
        origin: str = "simulate",
        actor: ActorRef | None = None,
        occurred_at: datetime | None = None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
        dedupe_key: str | None = None,
        severity: str = "info",
        tags: list[str] | None = None,
        chain_depth: int = 0,
        source_integration_id: str | None = None,
        draft_rule: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Evaluate the current rules for an event without side effects.

        Returns the envelope, matched rules, resolved queue items and a skip
        reason. Nothing is persisted, enqueued or broadcast. This is the
        debugging surface for phase 0 and the future `POST /api/events/simulate`.
        """
        payload = event_data or {}
        if actor is None:
            actor = actor_ref_from_payload(payload)

        plan = await self._build_plan(
            event_id=generate_id(),
            event_type=event_type,
            event_data=payload,
            origin=origin,
            chain_depth=chain_depth,
            source_integration_id=source_integration_id,
            actor=actor,
            occurred_at=occurred_at,
            correlation_id=correlation_id,
            causation_id=causation_id,
            dedupe_key=dedupe_key,
            severity=severity,
            tags=tags,
            check_known=True,
            draft_rule=draft_rule,
            include_unmatched=True,
            apply_limits=False,
        )

        envelope_dict = redact_payload(plan.envelope.model_dump(mode="json"))

        compiled_flows = []
        for rule in plan.rules:
            try:
                _, compiled = compile_trigger_rule(rule, [event_type])
                compiled_flows.append(compiled.model_dump(mode="json"))
            except Exception:
                logger.exception(
                    "[Dispatcher] Failed to compile simulated flow",
                    rule_id=getattr(rule, "id", None),
                )

        warnings: list[str] = []
        if plan.skipped_reason == "unknown_event":
            warnings.append(f"Unknown event type '{event_type}'")
        elif plan.skipped_reason == "event_disabled":
            warnings.append("The event is disabled at the integration or event level")
        elif plan.skipped_reason == "out_of_scope":
            warnings.append("The active session does not include this integration")
        elif plan.skipped_reason == "chain_depth":
            warnings.append("The event chain depth limit is reached")
        elif plan.skipped_reason == "no_rules":
            warnings.append("No enabled trigger rule matches this event")
        elif plan.approvals:
            warnings.append("Matched actions are waiting for approval")
        elif plan.rules and not plan.items:
            if plan.summary and not any(rule.get("matched", True) for rule in plan.summary):
                warnings.append("The rule conditions did not match this event")
            else:
                warnings.append("Matching rules produced no enabled action")

        return {
            "event": envelope_dict,
            "matched": plan.skipped_reason is None,
            "skipped_reason": plan.skipped_reason,
            "rules": redact_triggered_rules(plan.summary),
            "queue_items": [
                {
                    "id": item.id,
                    "action_type": item.action_type.value,
                    "payload": self._redacted_action_payload(
                        item.action_type.value, item.payload
                    ),
                    "duration": item.duration,
                    "cumulative": item.cumulative,
                    "priority": item.priority,
                    "display_name": item.display_name,
                    "trigger_rule_id": item.trigger_rule_id,
                    "trigger_action_id": item.trigger_action_id,
                    "modifiers": item.applied_modifiers,
                }
                for item in plan.items
            ],
            "approvals": [
                {
                    "rule_id": draft.rule_id,
                    "rule_name": draft.rule_name,
                    "timeout_seconds": draft.timeout_seconds,
                    "actions": [
                        {
                            "action_type": item.action_type.value,
                            "payload": self._redacted_action_payload(
                                item.action_type.value, item.payload
                            ),
                            "duration": item.duration,
                            "cumulative": item.cumulative,
                        }
                        for item in draft.items
                    ],
                }
                for draft in plan.approvals
            ],
            "emissions": [
                {
                    "event_type": emission.get("event_type"),
                    "payload": redact_payload(emission.get("payload") or {}),
                    "rule_id": emission.get("rule_id"),
                }
                for emission in plan.emissions
            ],
            "counts": {
                "rules": len(plan.rules),
                "actions": len(plan.items),
                "approvals": len(plan.approvals),
                "emissions": len(plan.emissions),
            },
            "warnings": warnings,
            "shadow": get_v3_config().shadow_mode,
            "compiled": compiled_flows,
        }

    async def _build_plan(
        self,
        *,
        event_id: str,
        event_type: str,
        event_data: dict,
        origin: str,
        chain_depth: int,
        source_integration_id: str | None,
        actor: ActorRef | None,
        occurred_at: datetime | None,
        correlation_id: str | None,
        causation_id: str | None,
        dedupe_key: str | None,
        severity: str,
        tags: list[str] | None,
        check_known: bool = False,
        draft_rule: dict[str, Any] | None = None,
        include_unmatched: bool = False,
        apply_limits: bool = True,
        rules_override: list[TriggerRule] | None = None,
        manual: bool = False,
    ) -> EventPlan:
        received_at = datetime.now(UTC)
        envelope = build_envelope(
            event_id=event_id,
            event_type=event_type,
            payload=event_data,
            origin=origin,
            source=source_integration_id or origin,
            actor=actor,
            occurred_at=occurred_at,
            received_at=received_at,
            session_id=self._active_session_id(),
            correlation_id=correlation_id,
            causation_id=causation_id,
            dedupe_key=dedupe_key,
            severity=severity,
            tags=tags,
            chain_depth=chain_depth,
            source_integration_id=source_integration_id,
        )

        if check_known and not self._integrations.is_known_event(event_type):
            return EventPlan(envelope=envelope, skipped_reason="unknown_event")

        if not self._integrations.is_event_enabled(event_type):
            return EventPlan(envelope=envelope, skipped_reason="event_disabled")

        if not self._session_allows_event(event_type):
            return EventPlan(envelope=envelope, skipped_reason="out_of_scope")

        if chain_depth >= _MAX_EVENT_CHAIN_DEPTH:
            return EventPlan(envelope=envelope, skipped_reason="chain_depth")

        context = build_condition_context(
            event_data,
            actor,
            session=store.get_active_session(),
        )

        if draft_rule is not None:
            rules = [self._draft_rule_from_payload(draft_rule, event_type)]
        elif rules_override is not None:
            rules = list(rules_override)
        else:
            rules = await self._registry.get_rules_for_event(event_type)
        if not rules:
            return EventPlan(envelope=envelope, skipped_reason="no_rules")

        queue_items: list[QueueItem] = []
        approvals: list[ApprovalDraft] = []
        emissions: list[dict[str, Any]] = []
        triggered_rules_summary: list[dict] = []
        rule_results: list[dict] = []
        for rule in rules:
            matched = evaluate_conditions(
                getattr(rule, "conditions", []) or [],
                getattr(rule, "condition_mode", "all") or "all",
                context,
            )
            items: list[QueueItem] = []
            rule_emissions: list[dict[str, Any]] = []
            flow_result: FlowRuntimeResult | None = None
            flow_warning: str | None = None

            if matched and getattr(rule, "graph", None) and getattr(rule, "graph_version", 0):
                try:
                    flow_result = await self._execute_rule_flow(
                        rule,
                        event_id=event_id,
                        event_type=event_type,
                        event_data=event_data,
                        actor=actor,
                        apply_limits=apply_limits,
                        manual=manual,
                    )
                except Exception as exc:
                    logger.exception(
                        "[Dispatcher] Flow runtime failed; using legacy rule",
                        rule_id=rule.id,
                        flow_version=getattr(rule, "graph_version", 0),
                    )
                    flow_result = None
                    flow_warning = f"flow runtime failed, legacy fallback: {exc}"
                if flow_result is not None:
                    items = self._flow_effects_to_queue_items(
                        rule,
                        flow_result,
                        origin=origin,
                        context=context,
                        source_integration_id=source_integration_id,
                        chain_depth=chain_depth,
                    )
                    for emission in flow_result.emissions:
                        rule_emissions.append(
                            {
                                "event_type": emission.event_type,
                                "payload": emission.payload,
                                "rule_id": rule.id,
                            }
                        )
                    if flow_result.warnings:
                        flow_warning = "; ".join(flow_result.warnings)

            if flow_result is None:
                items = self._rule_to_queue_items(
                    rule,
                    origin,
                    context=context,
                    source_integration_id=source_integration_id,
                    chain_depth=chain_depth,
                    conditions_matched=matched,
                )

            gate_reason: str | None = None
            gate_details: dict[str, Any] = {}
            if matched and (items or rule_emissions):
                gate_reason, gate_details = self._rule_gate_reason(
                    rule, context, apply_limits=apply_limits
                )
            if gate_reason is not None:
                rule_summary = self._build_rule_summary(rule, [], matched=False)
                rule_summary["skipped_reason"] = gate_reason
                rule_summary["gate"] = gate_details
                if flow_result is not None:
                    rule_summary["flow"] = self._flow_summary(rule, flow_result)
                rule_results.append(rule_summary)
                if include_unmatched:
                    triggered_rules_summary.append(rule_summary)
                continue

            if items and getattr(rule, "requires_approval", False):
                rule_summary = self._build_rule_summary(rule, items, matched=matched)
                rule_summary["skipped_reason"] = "pending_approval"
                if gate_details:
                    rule_summary["gate"] = gate_details
                if flow_result is not None:
                    rule_summary["flow"] = self._flow_summary(rule, flow_result)
                approvals.append(
                    ApprovalDraft(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        timeout_seconds=int(
                            getattr(rule, "approval_timeout_seconds", 300) or 300
                        ),
                        items=items,
                        summary=rule_summary,
                    )
                )
                rule_results.append(rule_summary)
                triggered_rules_summary.append(rule_summary)
                continue

            queue_items.extend(items)
            emissions.extend(rule_emissions)
            rule_summary = self._build_rule_summary(rule, items, matched=matched)
            if gate_details:
                rule_summary["gate"] = gate_details
            if flow_result is not None:
                rule_summary["flow"] = self._flow_summary(rule, flow_result)
                if not items and flow_result.skipped_reason:
                    rule_summary["matched"] = False
                    rule_summary["skipped_reason"] = flow_result.skipped_reason
            elif flow_warning:
                rule_summary["flow"] = {
                    "status": "fallback",
                    "warnings": [flow_warning],
                }
            rule_results.append(rule_summary)
            if rule_summary.get("matched", matched) or items or include_unmatched:
                triggered_rules_summary.append(rule_summary)

            if items or rule_emissions or (flow_result and flow_result.effects):
                if self._flow_stops_processing(rule):
                    break

        return EventPlan(
            envelope=envelope,
            rules=rules,
            items=queue_items,
            summary=triggered_rules_summary,
            approvals=approvals,
            emissions=emissions,
            rule_results=rule_results,
        )

    def _is_duplicate(self, dedupe_key: str) -> bool:
        """In-memory dedupe window keyed by the source's stable event id."""
        ttl = max(0, get_v3_config().dedupe_ttl_seconds)
        if ttl <= 0:
            return False
        now = time.monotonic()
        if len(self._dedupe_seen) > 4096:
            cutoff = now - ttl
            self._dedupe_seen = {
                key: seen for key, seen in self._dedupe_seen.items() if seen >= cutoff
            }
        last_seen = self._dedupe_seen.get(dedupe_key)
        if last_seen is not None and now - last_seen < ttl:
            return True
        self._dedupe_seen[dedupe_key] = now
        return False

    @staticmethod
    def _actor_key(context: dict[str, Any]) -> str:
        actor = context.get("actor") or {}
        if not isinstance(actor, dict):
            return "anonymous"
        return str(
            actor.get("id")
            or actor.get("platform_id")
            or actor.get("display_name")
            or "anonymous"
        )

    @staticmethod
    def _flow_stops_processing(rule: TriggerRule) -> bool:
        graph = getattr(rule, "graph", None)
        if not isinstance(graph, dict):
            return False
        variables = graph.get("variables") or {}
        if not isinstance(variables, dict):
            return False
        return bool(variables.get("stop_processing")) or str(
            variables.get("match_mode") or "all"
        ).lower() == "first"

    async def _resolve_subflow_graph(self, rule_id: str) -> FlowSpec | None:
        """Resolve a runtime sub-flow to its saved graph or legacy equivalent."""
        version: int | None = None
        if "@" in rule_id:
            raw_id, raw_version = rule_id.rsplit("@", 1)
            rule_id = raw_id
            try:
                version = int(raw_version)
            except ValueError:
                version = None
        if version is not None:
            row = await TriggerRuleGraphRepo().get_version(rule_id, version)
            if row is None or not row.graph:
                return None
            try:
                return FlowSpec.model_validate(row.graph)
            except Exception:
                logger.exception(
                    "[Dispatcher] Invalid pinned sub-flow graph",
                    rule_id=rule_id,
                    version=version,
                )
                return None
        rule = await TriggerRuleRepo().get_rule(rule_id)
        if rule is None:
            return None
        if rule.graph and getattr(rule, "graph_version", 0):
            try:
                return FlowSpec.model_validate(rule.graph)
            except Exception:
                logger.exception(
                    "[Dispatcher] Invalid saved sub-flow graph",
                    rule_id=rule_id,
                )
        return graph_from_rule(rule, rule_event_types(rule))

    async def _execute_rule_flow(
        self,
        rule: TriggerRule,
        *,
        event_id: str,
        event_type: str,
        event_data: dict[str, Any],
        actor: ActorRef | None,
        apply_limits: bool,
        manual: bool = False,
    ) -> FlowRuntimeResult | None:
        if not rule.graph or not getattr(rule, "graph_version", 0):
            return None
        try:
            spec = FlowSpec.model_validate(rule.graph)
        except Exception:
            logger.exception(
                "[Dispatcher] Invalid rule graph",
                rule_id=rule.id,
                graph_version=getattr(rule, "graph_version", 0),
            )
            return None
        return await self._flow_runtime.execute(
            spec,
            event_type=event_type,
            event_data=event_data,
            actor=actor,
            session=store.get_active_session(),
            state={
                "session": store.get_active_session() or {},
                "units": store.get_all_units_settings(),
                "sensors": store.get_all_sensors_settings(),
            },
            run_id=event_id,
            apply_limits=apply_limits,
            manual=manual,
        )

    @staticmethod
    def _flow_summary(
        rule: TriggerRule, result: FlowRuntimeResult
    ) -> dict[str, Any]:
        return {
            "status": result.status,
            "version": int(getattr(rule, "graph_version", 0) or 0),
            "trigger_node_id": result.trigger_node_id,
            "skipped_reason": result.skipped_reason,
            "warnings": list(result.warnings),
            "node_trace": [
                {
                    "node_id": trace.node_id,
                    "node_type": trace.node_type,
                    "status": trace.status,
                    "value": trace.value,
                    "reason": trace.reason,
                    "duration_ms": trace.duration_ms,
                }
                for trace in result.traces
            ],
        }

    def _flow_effects_to_queue_items(
        self,
        rule: TriggerRule,
        result: FlowRuntimeResult,
        *,
        origin: str,
        context: dict[str, Any],
        source_integration_id: str | None,
        chain_depth: int,
    ) -> list[QueueItem]:
        """Turn native FlowSpec effects into executable queue items."""
        items: list[QueueItem] = []
        for effect in result.effects:
            try:
                action_type = ActionType(str(effect.action_type))
            except ValueError:
                result.warnings.append(
                    f"unknown action_type from flow node {effect.node_id}: "
                    f"{effect.action_type}"
                )
                continue
            action_id = action_type.value
            if not self._integrations.is_action_enabled(action_id):
                logger.debug(
                    "[Dispatcher] Flow action disabled, skipped",
                    rule=rule.name,
                    action=action_id,
                    origin=origin,
                )
                continue
            if self._is_local_echo_action(action_id, source_integration_id):
                logger.debug(
                    "[Dispatcher] Flow action skipped (local echo)",
                    rule=rule.name,
                    action=action_id,
                    origin=origin,
                )
                continue
            definition = self._integrations.get_action(action_id)
            one_shot = bool(definition and definition.one_shot)
            outcome = apply_modifiers(
                effect.payload,
                effect.duration,
                effect.modifiers,
                context,
            )
            if outcome.blocked_reason:
                result.warnings.append(
                    f"effect {effect.node_id} blocked by {outcome.blocked_reason}"
                )
                continue
            repeat = 1 if one_shot else max(1, outcome.repeat * effect.repeat)
            interval = (
                outcome.repeat_interval_seconds
                or effect.repeat_interval_seconds
                or 0
            )
            for iteration in range(repeat):
                delay = outcome.delay_seconds + effect.delay_seconds + iteration * interval
                not_before = (
                    datetime.now() + timedelta(seconds=delay) if delay > 0 else None
                )
                item_index = min(iteration, len(effect.iteration_items) - 1) if effect.iteration_items else iteration
                iteration_context = {
                    **context,
                    "iteration": iteration,
                    "item": (
                        effect.iteration_items[item_index]
                        if effect.iteration_items
                        else None
                    ),
                }
                item_payload = render_value(outcome.payload, iteration_context)
                items.append(
                    QueueItem(
                        id=generate_id(),
                        action_type=action_type,
                        payload=copy.deepcopy(item_payload),
                        duration=0 if one_shot else outcome.duration,
                        cumulative=True if one_shot else effect.cumulative,
                        priority=rule.priority,
                        status=QueueItemStatus.WAITING,
                        origin=origin,
                        display_name=f"{rule.name}: {action_id}",
                        trigger_action_id=effect.node_id,
                        trigger_rule_id=rule.id,
                        causation_depth=chain_depth + 1,
                        applied_modifiers=list(outcome.applied),
                        created_at=datetime.now(),
                        not_before=not_before,
                        iteration=iteration,
                        repeat_count=repeat,
                    )
                )
        return items

    def _rule_gate_reason(
        self,
        rule: TriggerRule,
        context: dict[str, Any],
        *,
        apply_limits: bool,
    ) -> tuple[str | None, dict[str, Any]]:
        """
        Evaluate window, cooldown and budget gates for one matched rule.

        Returns `(skip_reason, details)`. Window hits are only consumed once
        every gate passes, so a cooldown or budget block does not lose the
        accumulated burst.
        """
        if not apply_limits:
            return None, {}

        now = time.monotonic()
        details: dict[str, Any] = {}

        window_count = int(getattr(rule, "window_count", 0) or 0)
        window_seconds = int(getattr(rule, "window_seconds", 0) or 0)
        window_hits: deque[float] | None = None
        if window_count > 0 and window_seconds > 0:
            window_hits = self._window_hits.setdefault(rule.id, deque())
            cutoff = now - window_seconds
            while window_hits and window_hits[0] < cutoff:
                window_hits.popleft()
            window_hits.append(now)
            details["window_hits"] = len(window_hits)
            if len(window_hits) < window_count:
                return "window_pending", details

        cooldown = int(getattr(rule, "cooldown_seconds", 0) or 0)
        if cooldown > 0:
            last_fired = self._cooldowns.get(rule.id, 0.0)
            if last_fired and now - last_fired < cooldown:
                return "cooldown", details

        budget_count = int(getattr(rule, "budget_count", 0) or 0)
        budget_window = max(1, int(getattr(rule, "budget_window_seconds", 3600) or 3600))
        budget_key = rule.id
        budget_hits: deque[float] | None = None
        if budget_count > 0:
            if getattr(rule, "budget_per_actor", False):
                budget_key = f"{rule.id}:{self._actor_key(context)}"
            budget_hits = self._budget_hits.setdefault(budget_key, deque())
            cutoff = now - budget_window
            while budget_hits and budget_hits[0] < cutoff:
                budget_hits.popleft()
            details["budget_used"] = len(budget_hits)
            if len(budget_hits) >= budget_count:
                return "budget_exhausted", details

        if window_hits is not None:
            window_hits.clear()
        if cooldown > 0:
            self._cooldowns[rule.id] = now
        if budget_hits is not None:
            budget_hits.append(now)
        return None, details

    def _draft_rule_from_payload(
        self, draft: dict[str, Any], event_type: str
    ) -> TriggerRule:
        """Build a transient rule for the Composer dry-run (never persisted)."""

        actions: list[TriggerAction] = []
        for index, raw in enumerate(draft.get("actions") or []):
            action_type = raw.get("action_type")
            if isinstance(action_type, str):
                action_type = ActionType(action_type)
            actions.append(
                TriggerAction(
                    id=f"draft-action-{index}",
                    trigger_rule_id="draft-rule",
                    action_type=action_type,
                    payload=raw.get("payload") or {},
                    duration=int(raw.get("duration", -1)),
                    cumulative=bool(raw.get("cumulative", False)),
                    sort_order=int(raw.get("sort_order", index)),
                    modifiers=raw.get("modifiers") or [],
                )
            )

        return TriggerRule(
            id="draft-rule",
            event_type=event_type,
            name=draft.get("name") or "Draft rule",
            description=draft.get("description"),
            enabled=True,
            priority=0,
            conditions=draft.get("conditions") or [],
            condition_mode=draft.get("condition_mode") or "all",
            actions=actions,
        )

    def _active_session_id(self) -> str | None:
        active_session = store.get_active_session()
        return active_session.get("id") if active_session else None

    async def _resolve_actor(self, actor: ActorRef) -> ActorRef:
        """Resolve a platform identity to a unified actor id (best effort)."""
        if actor.id or not actor.platform_id:
            return actor
        try:
            resolved = await self._actors.resolve(
                platform=actor.platform,
                platform_id=actor.platform_id,
                display_name=actor.display_name,
                is_bot=actor.is_bot,
                metadata=actor.metadata,
            )
        except Exception:
            logger.exception(
                "[Dispatcher] Actor resolution failed",
                platform=actor.platform,
                platform_id=actor.platform_id,
            )
            return actor
        return actor.model_copy(
            update={
                "id": resolved.id,
                "display_name": actor.display_name or resolved.display_name,
                "is_blocked": resolved.is_blocked,
            }
        )

    async def _save_approvals(self, plan: EventPlan) -> None:
        for draft in plan.approvals:
            try:
                request = await self._approvals.create(
                    event_id=plan.envelope.id,
                    rule_id=draft.rule_id,
                    rule_name=draft.rule_name,
                    items=[queue_item_to_dict(item) for item in draft.items],
                    summary=draft.summary,
                    timeout_seconds=draft.timeout_seconds,
                )
            except Exception:
                # Approval is a safety gate: if it cannot be persisted, the
                # actions must not be enqueued either.
                logger.exception(
                    "[Dispatcher] Failed to create approval request",
                    event_id=plan.envelope.id,
                    rule_id=draft.rule_id,
                )
                continue
            if self._ws_notifier is not None:
                try:
                    self._ws_notifier.notify(
                        "approvals:update",
                        {"status": "ok", "id": request.id, "action": "created"},
                    )
                except Exception:
                    pass

    async def _record_shadow(self, plan: EventPlan, started: float) -> None:
        try:
            latency_ms = int((time.perf_counter() - started) * 1000)
            await self._shadow.record(plan, latency_ms=latency_ms)
        except Exception:
            # Shadow telemetry must never break the legacy pipeline.
            logger.exception(
                "[Dispatcher] Shadow recording failed",
                event_id=plan.envelope.id,
                event_type=plan.envelope.type,
            )

    async def _record_telemetry(self, plan: EventPlan, started: float) -> None:
        try:
            latency_ms = int((time.perf_counter() - started) * 1000)
            await self._telemetry.record(plan, latency_ms=latency_ms)
        except Exception:
            # Telemetry must never break the event pipeline.
            logger.exception(
                "[Dispatcher] Telemetry recording failed",
                event_id=plan.envelope.id,
                event_type=plan.envelope.type,
            )

    async def _dispatch_emissions(
        self,
        plan: EventPlan,
        *,
        origin: str,
        chain_depth: int,
        actor: ActorRef | None,
    ) -> None:
        for emission in plan.emissions:
            try:
                await self.dispatch(
                    emission["event_type"],
                    emission.get("payload") or {},
                    origin=f"{origin}:flow-emit",
                    chain_depth=chain_depth + 1,
                    correlation_id=plan.envelope.correlation_id,
                    causation_id=plan.envelope.id,
                    actor=actor,
                )
            except Exception:
                logger.exception(
                    "[Dispatcher] Flow emission failed",
                    event_type=emission.get("event_type"),
                    event_id=plan.envelope.id,
                )

    def _session_allows_event(self, event_type: str) -> bool:
        """
        True when the running session accepts events from this integration.

        Sessions created before per-session scoping (integration_ids = None)
        keep the legacy behaviour and accept every globally enabled service.
        Core hardware is always allowed; units/sensors are scoped by Modules.
        """
        active_session = store.get_active_session()
        if active_session is None:
            return True

        integration_ids = active_session.get("integration_ids")
        if integration_ids is None:
            return True

        owner_id = self._integrations.event_integration_id(event_type)
        if owner_id is None:
            return True

        integration = self._integrations.get(owner_id)
        if integration is None or integration.kind is IntegrationKind.CORE:
            return True

        return owner_id in integration_ids and self._integrations.is_enabled(owner_id)

    async def _save_and_notify(
        self,
        envelope: EventEnvelope,
        triggered_rules: list[dict],
    ) -> None:
        """Persist the event to DB and broadcast it to all WS clients."""
        safe_event_data = redact_payload(envelope.payload)
        safe_triggered_rules = redact_triggered_rules(triggered_rules)
        record = TriggeredEvent(
            id=envelope.id,
            event_type=envelope.type,
            origin=envelope.origin,
            event_data=safe_event_data,
            triggered_at=envelope.received_at,
            triggered_rules=safe_triggered_rules,
            session_id=envelope.session_id,
            occurred_at=envelope.occurred_at,
            source=envelope.source,
            actor_id=envelope.actor.id if envelope.actor else None,
            correlation_id=envelope.correlation_id,
            causation_id=envelope.causation_id,
            dedupe_key=envelope.dedupe_key,
            severity=envelope.severity,
            tags=envelope.tags,
            version=envelope.version,
        )
        await self._event_repo.save(record)

        if self._ws_notifier:
            self._ws_notifier.notify(
                payload_type="events:triggered",
                payload={
                    "id": envelope.id,
                    "event_type": envelope.type,
                    "origin": envelope.origin,
                    "event_data": safe_event_data,
                    "triggered_at": envelope.received_at.isoformat(),
                    "triggered_rules": safe_triggered_rules,
                    "occurred_at": envelope.occurred_at.isoformat(),
                    "source": envelope.source,
                    "actor": (
                        envelope.actor.model_dump(mode="json")
                        if envelope.actor
                        else None
                    ),
                    "correlation_id": envelope.correlation_id,
                    "causation_id": envelope.causation_id,
                    "dedupe_key": envelope.dedupe_key,
                    "severity": envelope.severity,
                    "tags": envelope.tags,
                    "version": envelope.version,
                },
            )

    def _redacted_action_payload(self, action_type: str, payload: dict) -> dict:
        definition = self._integrations.get_action(action_type)
        secret_fields = definition.secret_fields if definition else ()
        return redact_payload(payload, secret_fields)

    def _build_rule_summary(
        self,
        rule: TriggerRule,
        queue_items: list[QueueItem],
        *,
        matched: bool = True,
    ) -> dict:
        """
        Build a serializable summary of a TriggerRule and its resulting QueueItems
        for storage in TriggeredEvent.triggered_rules and WS payloads.
        """
        return {
            "rule_id": rule.id,
            "rule_name": rule.name,
            "priority": rule.priority,
            "matched": matched,
            "conditions": getattr(rule, "conditions", []) or [],
            "condition_mode": getattr(rule, "condition_mode", "all") or "all",
            "cooldown_seconds": getattr(rule, "cooldown_seconds", 0) or 0,
            "window_count": getattr(rule, "window_count", 0) or 0,
            "window_seconds": getattr(rule, "window_seconds", 0) or 0,
            "budget_count": getattr(rule, "budget_count", 0) or 0,
            "budget_window_seconds": getattr(rule, "budget_window_seconds", 3600)
            or 3600,
            "budget_per_actor": bool(getattr(rule, "budget_per_actor", False)),
            "requires_approval": bool(getattr(rule, "requires_approval", False)),
            "actions": [
                {
                    "queue_item_id": item.id,
                    "action_id": item.trigger_action_id,
                    "action_type": item.action_type.value,
                    "display_name": item.display_name,
                    "duration": item.duration,
                    "cumulative": item.cumulative,
                    "payload": self._redacted_action_payload(
                        item.action_type.value, item.payload
                    ),
                    "modifiers": item.applied_modifiers,
                }
                for item in queue_items
                if item.trigger_rule_id == rule.id
            ],
        }

    def _build_direct_summary(
        self, summary_name: str, queue_items: list[QueueItem]
    ) -> list[dict]:
        """Build a summary for direct dispatches (no DB rule involved)."""
        return [
            {
                "rule_id": None,
                "rule_name": summary_name or "Direct action",
                "priority": 0,
                "actions": [
                    {
                        "queue_item_id": item.id,
                        "action_id": None,
                        "action_type": item.action_type.value,
                        "display_name": item.display_name,
                        "duration": item.duration,
                        "cumulative": item.cumulative,
                        "payload": self._redacted_action_payload(
                            item.action_type.value, item.payload
                        ),
                    }
                    for item in queue_items
                ],
            }
        ]

    def _is_local_echo_action(
        self, action_id: str, source_integration_id: str | None
    ) -> bool:
        """True when this action belongs to the integration whose echo this is."""
        if source_integration_id is None:
            return False
        return (
            self._integrations.action_integration_id(action_id)
            == source_integration_id
        )

    def _rule_to_queue_items(
        self,
        rule: TriggerRule,
        origin: str,
        *,
        context: dict | None = None,
        source_integration_id: str | None = None,
        chain_depth: int = 0,
        conditions_matched: bool | None = None,
    ) -> list[QueueItem]:
        """
        Convert a TriggerRule's actions into QueueItems.

        Actions disabled at the integration or per-action level are skipped
        here, so the rule keeps working as-is when the toggle is turned back on.
        Actions from the integration whose echo caused this event are also
        skipped: they are the feedback edge that would close the loop.
        """
        if conditions_matched is None:
            conditions_matched = evaluate_conditions(
                getattr(rule, "conditions", []) or [],
                getattr(rule, "condition_mode", "all") or "all",
                context or {},
            )
        if not conditions_matched:
            return []

        items = []
        for action in rule.actions:
            action_id = (
                action.action_type.value
                if hasattr(action.action_type, "value")
                else str(action.action_type)
            )
            if not self._integrations.is_action_enabled(action_id):
                logger.debug(
                    f"[Dispatcher] Action '{action_id}' disabled, skipped",
                    rule=rule.name,
                    origin=origin,
                )
                continue
            if self._is_local_echo_action(action_id, source_integration_id):
                logger.debug(
                    f"[Dispatcher] Action '{action_id}' skipped (local action echo)",
                    rule=rule.name,
                    origin=origin,
                    chain_depth=chain_depth,
                )
                continue
            definition = self._integrations.get_action(action_id)
            one_shot = bool(definition and definition.one_shot)
            outcome = apply_modifiers(
                action.payload or {},
                action.duration,
                getattr(action, "modifiers", []) or [],
                context or {},
            )
            if outcome.blocked_reason:
                logger.debug(
                    f"[Dispatcher] Action '{action_id}' blocked by modifier",
                    rule=rule.name,
                    origin=origin,
                    reason=outcome.blocked_reason,
                )
                continue
            repeat = 1 if one_shot else max(1, outcome.repeat)
            if one_shot and outcome.repeat > 1:
                outcome.applied.append(
                    {"type": "repeat", "ignored": "one_shot", "count": outcome.repeat}
                )
            for iteration in range(repeat):
                delay = outcome.delay_seconds + (
                    iteration * outcome.repeat_interval_seconds
                )
                not_before = (
                    datetime.now() + timedelta(seconds=delay) if delay > 0 else None
                )
                item = QueueItem(
                    id=generate_id(),
                    action_type=action.action_type,
                    payload=copy.deepcopy(outcome.payload),
                    # A one-shot action must not block the rest of the rule for
                    # an arbitrary duration: run it once, concurrently, and let
                    # the queue finalize it on the next tick.
                    duration=0 if one_shot else outcome.duration,
                    cumulative=True if one_shot else action.cumulative,
                    priority=rule.priority,
                    status=QueueItemStatus.WAITING,
                    origin=origin,
                    display_name=f"{rule.name}: {action.action_type.value}",
                    trigger_action_id=action.id,
                    trigger_rule_id=rule.id,
                    causation_depth=chain_depth + 1,
                    applied_modifiers=list(outcome.applied),
                    created_at=datetime.now(),
                    not_before=not_before,
                    iteration=iteration,
                    repeat_count=repeat,
                )
                items.append(item)
        return items
