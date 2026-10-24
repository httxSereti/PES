from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog
from cuid2 import cuid_wrapper

from database.models.triggered_event import TriggeredEvent
from database.repositories.triggered_event_repo import TriggeredEventRepo
from events.enums import QueueItemStatus
from events.models import QueueItem, TriggerRule
from events.queue import ActionQueue
from events.redaction import redact_payload, redact_triggered_rules
from events.registry import EventRegistry
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
    ):
        EventDispatcher._instance = self
        self._registry = registry
        self._queue = queue
        self._ws_notifier = ws_notifier
        self._event_repo = TriggeredEventRepo()
        self._integrations = integrations or integration_registry

    async def dispatch(
        self,
        event_type: str,
        event_data: dict | None = None,
        origin: str = "unknown",
        chain_depth: int = 0,
        source_integration_id: str | None = None,
    ) -> None:
        """
        Dispatch an event: resolve trigger rules, create queue items, and enqueue them.

        Args:
            event_type: The event type (TriggerableEvent value or WOF dynamic code)
            event_data: Contextual data from the event source
            origin: Human-readable origin description
            chain_depth: Causation depth for an event caused by an action echo
            source_integration_id: Integration whose action caused this echo
        """
        event_data = event_data or {}
        event_id = generate_id()
        triggered_at = datetime.now(UTC)

        logger.info(
            "[Dispatcher] Event received",
            event_id=event_id,
            event_type=event_type,
            origin=origin,
            chain_depth=chain_depth,
            source_integration_id=source_integration_id,
        )

        # Disabled at the integration or per-event level: drop the event
        # entirely (no DB record, no queue items). Re-enabling brings the
        # rules back.
        if not self._integrations.is_event_enabled(event_type):
            logger.info(
                f"[Dispatcher] Event '{event_type}' disabled, ignored",
                event_id=event_id,
                origin=origin,
            )
            return

        if not self._session_allows_event(event_type):
            logger.info(
                f"[Dispatcher] Event '{event_type}' outside session scope, ignored",
                event_id=event_id,
                origin=origin,
            )
            return

        if chain_depth >= _MAX_EVENT_CHAIN_DEPTH:
            logger.warning(
                "[Dispatcher] Event chain depth limit reached, actions skipped",
                event_id=event_id,
                event_type=event_type,
                origin=origin,
                chain_depth=chain_depth,
            )
            await self._save_and_notify(
                event_id, event_type, origin, event_data, triggered_at, []
            )
            return

        # Resolve trigger rules from DB
        rules = await self._registry.get_rules_for_event(event_type)
        if not rules:
            logger.debug(
                f"[Dispatcher] No trigger rules for event '{event_type}'",
                event_id=event_id,
                origin=origin,
            )
            await self._save_and_notify(
                event_id, event_type, origin, event_data, triggered_at, []
            )
            return

        # Build queue items + summary in a single pass over rules
        queue_items: list[QueueItem] = []
        triggered_rules_summary: list[dict] = []

        for rule in rules:
            items = self._rule_to_queue_items(
                rule,
                origin,
                source_integration_id=source_integration_id,
                chain_depth=chain_depth,
            )
            queue_items.extend(items)
            triggered_rules_summary.append(self._build_rule_summary(rule, items))

        logger.info(
            f"[Dispatcher] Created {len(queue_items)} queue items from {len(rules)} rule(s)",
            event_id=event_id,
            event_type=event_type,
            origin=origin,
        )

        # ── Step 2: Persist + notify with full context ──
        await self._save_and_notify(
            event_id,
            event_type,
            origin,
            event_data,
            triggered_at,
            triggered_rules_summary,
        )

        # ── Step 3: Enqueue ──
        if queue_items:
            self._queue.enqueue(queue_items)

    async def dispatch_direct(
        self,
        event_type: str,
        items: list[QueueItem],
        event_data: dict | None = None,
        origin: str = "unknown",
        summary_name: str | None = None,
        chain_depth: int = 0,
        source_integration_id: str | None = None,
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

        if not self._session_allows_event(event_type):
            logger.info(
                f"[Dispatcher] Direct event '{event_type}' outside session scope, ignored",
                event_id=event_id,
                origin=origin,
            )
            return

        if not self._integrations.is_event_enabled(event_type):
            logger.info(
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
            logger.info(
                f"[Dispatcher] Direct dispatch '{event_type}': {skipped} item(s) skipped (disabled or local echo)",
                event_id=event_id,
                origin=origin,
            )
        items = enabled_items
        if not items:
            return

        for item in items:
            item.causation_depth = chain_depth + 1

        logger.info(
            f"[Dispatcher] Direct dispatch '{event_type}' with {len(items)} item(s)",
            event_id=event_id,
            origin=origin,
            chain_depth=chain_depth,
        )

        await self._save_and_notify(
            event_id,
            event_type,
            origin,
            event_data,
            triggered_at,
            self._build_direct_summary(summary_name or event_type, items),
        )

        if items:
            self._queue.enqueue(items)

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
        event_id: str,
        event_type: str,
        origin: str,
        event_data: dict,
        triggered_at: datetime,
        triggered_rules: list[dict],
    ) -> None:
        """Persist the event to DB and broadcast it to all WS clients."""
        safe_event_data = redact_payload(event_data)
        safe_triggered_rules = redact_triggered_rules(triggered_rules)
        active_session = store.get_active_session()
        record = TriggeredEvent(
            id=event_id,
            event_type=event_type,
            origin=origin,
            event_data=safe_event_data,
            triggered_at=triggered_at,
            triggered_rules=safe_triggered_rules,
            session_id=active_session["id"] if active_session else None,
        )
        await self._event_repo.save(record)

        if self._ws_notifier:
            self._ws_notifier.notify(
                payload_type="events:triggered",
                payload={
                    "id": event_id,
                    "event_type": event_type,
                    "origin": origin,
                    "event_data": safe_event_data,
                    "triggered_at": triggered_at.isoformat(),
                    "triggered_rules": safe_triggered_rules,
                },
            )

    def _redacted_action_payload(self, action_type: str, payload: dict) -> dict:
        definition = self._integrations.get_action(action_type)
        secret_fields = definition.secret_fields if definition else ()
        return redact_payload(payload, secret_fields)

    def _build_rule_summary(self, rule: TriggerRule, queue_items: list[QueueItem]) -> dict:
        """
        Build a serializable summary of a TriggerRule and its resulting QueueItems
        for storage in TriggeredEvent.triggered_rules and WS payloads.
        """
        return {
            "rule_id": rule.id,
            "rule_name": rule.name,
            "priority": rule.priority,
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
        source_integration_id: str | None = None,
        chain_depth: int = 0,
    ) -> list[QueueItem]:
        """
        Convert a TriggerRule's actions into QueueItems.

        Actions disabled at the integration or per-action level are skipped
        here, so the rule keeps working as-is when the toggle is turned back on.
        Actions from the integration whose echo caused this event are also
        skipped: they are the feedback edge that would close the loop.
        """
        items = []
        for action in rule.actions:
            action_id = (
                action.action_type.value
                if hasattr(action.action_type, "value")
                else str(action.action_type)
            )
            if not self._integrations.is_action_enabled(action_id):
                logger.info(
                    f"[Dispatcher] Action '{action_id}' disabled, skipped",
                    rule=rule.name,
                    origin=origin,
                )
                continue
            if self._is_local_echo_action(action_id, source_integration_id):
                logger.info(
                    f"[Dispatcher] Action '{action_id}' skipped (local action echo)",
                    rule=rule.name,
                    origin=origin,
                    chain_depth=chain_depth,
                )
                continue
            item = QueueItem(
                id=generate_id(),
                action_type=action.action_type,
                payload=action.payload,
                duration=action.duration,
                cumulative=action.cumulative,
                priority=rule.priority,
                status=QueueItemStatus.WAITING,
                origin=origin,
                display_name=f"{rule.name}: {action.action_type.value}",
                trigger_action_id=action.id,
                trigger_rule_id=rule.id,
                causation_depth=chain_depth + 1,
                created_at=datetime.now(),
            )
            items.append(item)
        return items
