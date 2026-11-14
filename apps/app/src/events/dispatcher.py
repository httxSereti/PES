from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any, TYPE_CHECKING

import structlog
from cuid2 import cuid_wrapper

from database.models.triggered_event import TriggeredEvent
from database.repositories.actor_repo import ActorRepo
from database.repositories.triggered_event_repo import TriggeredEventRepo
from events.enums import ActionType, QueueItemStatus
from events.envelope import ActorRef, EventEnvelope, actor_ref_from_payload, build_envelope
from events.conditions import build_condition_context, evaluate_conditions
from events.flows import compile_trigger_rule
from events.models import QueueItem, TriggerAction, TriggerRule
from events.modifiers import apply_modifiers
from events.queue import ActionQueue
from events.redaction import redact_payload, redact_triggered_rules
from events.registry import EventRegistry
from events.v3 import EventPlan, ShadowRecorder, get_v3_config
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
    ):
        EventDispatcher._instance = self
        self._registry = registry
        self._queue = queue
        self._ws_notifier = ws_notifier
        self._event_repo = event_repo or TriggeredEventRepo()
        self._integrations = integrations or integration_registry
        self._shadow = shadow_recorder or ShadowRecorder()
        self._actors = actor_repo or ActorRepo()

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

        if plan.items:
            self._queue.enqueue(plan.items)

        if v3_config.shadow_mode:
            await self._record_shadow(plan, started)

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
            "counts": {
                "rules": len(plan.rules),
                "actions": len(plan.items),
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
        else:
            rules = await self._registry.get_rules_for_event(event_type)
        if not rules:
            return EventPlan(envelope=envelope, skipped_reason="no_rules")

        queue_items: list[QueueItem] = []
        triggered_rules_summary: list[dict] = []
        for rule in rules:
            matched = evaluate_conditions(
                getattr(rule, "conditions", []) or [],
                getattr(rule, "condition_mode", "all") or "all",
                context,
            )
            items = self._rule_to_queue_items(
                rule,
                origin,
                context=context,
                source_integration_id=source_integration_id,
                chain_depth=chain_depth,
                conditions_matched=matched,
            )
            queue_items.extend(items)
            if matched or items or include_unmatched:
                triggered_rules_summary.append(
                    self._build_rule_summary(rule, items, matched=matched)
                )

        return EventPlan(
            envelope=envelope,
            rules=rules,
            items=queue_items,
            summary=triggered_rules_summary,
        )

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
            payload, duration, applied_modifiers = apply_modifiers(
                action.payload or {},
                action.duration,
                getattr(action, "modifiers", []) or [],
                context or {},
            )
            item = QueueItem(
                id=generate_id(),
                action_type=action.action_type,
                payload=payload,
                # A one-shot action must not block the rest of the rule for
                # an arbitrary duration: run it once, concurrently, and let
                # the queue finalize it on the next tick.
                duration=0 if one_shot else duration,
                cumulative=True if one_shot else action.cumulative,
                priority=rule.priority,
                status=QueueItemStatus.WAITING,
                origin=origin,
                display_name=f"{rule.name}: {action.action_type.value}",
                trigger_action_id=action.id,
                trigger_rule_id=rule.id,
                causation_depth=chain_depth + 1,
                applied_modifiers=applied_modifiers,
                created_at=datetime.now(),
            )
            items.append(item)
        return items
