from __future__ import annotations

import random
import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from cuid2 import cuid_wrapper

from events.enums import ActionType, QueueItemStatus
from events.models import QueueItem, TriggerRule
from events.registry import EventRegistry
from events.queue import ActionQueue
from utils import Logger
from database.models.triggered_event import TriggeredEvent
from database.repositories.triggered_event_repo import TriggeredEventRepo

if TYPE_CHECKING:
    from api.ws.websocket_notifier import WebSocketNotifier

generate_id = cuid_wrapper()


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
    ):
        EventDispatcher._instance = self
        self._registry = registry
        self._queue = queue
        self._ws_notifier = ws_notifier
        self._event_repo = TriggeredEventRepo()

    async def dispatch(
        self,
        event_type: str,
        event_data: dict | None = None,
        origin: str = "unknown",
    ) -> None:
        """
        Dispatch an event: resolve trigger rules, create queue items, and enqueue them.

        Args:
            event_type: The event type (TriggerableEvent value or WOF dynamic code)
            event_data: Contextual data from the event source
            origin: Human-readable origin description
        """
        event_data = event_data or {}
        event_id = generate_id()
        triggered_at = datetime.now(timezone.utc)

        Logger.info(
            f"[Dispatcher] Event received: id={event_id}, type={event_type}, origin={origin}"
        )

        """
        Check for custom WOF action 
            - Predefined Profile: {p:[profileChar][levelPercentage][duration]}
            - [WIP] Custom Profile {p!:[profileId][levelPercentage][duration]}
            - [WIP] Unit
            - [WIP] Sensor
        """

        if "wofCustomType" in event_data:
            if event_data["wofCustomType"] == "profile":
                wof_items = self._parse_wof_dynamic_profile(
                    event_action_text=event_data["wofText"], origin=origin
                )

                if wof_items:
                    triggered_rules_summary = self._build_wof_summary(
                        f"Execute profile ({event_data['wofAction']})", wof_items
                    )
                    await self._save_and_notify(
                        event_id,
                        event_type,
                        origin,
                        event_data,
                        triggered_at,
                        triggered_rules_summary,
                    )
                    self._queue.enqueue(wof_items)
                    return
            elif event_data["wofCustomType"] == "unit":
                # TODO: implement unit update logic
                pass
            else:
                Logger.warning(
                    f"[Dispatcher] Unknown WOF custom type: {event_data['wofCustomType']}"
                )
                return

        # Resolve trigger rules from DB
        rules = await self._registry.get_rules_for_event(event_type)
        if not rules:
            Logger.debug(f"[Dispatcher] No trigger rules for event '{event_type}'")
            await self._save_and_notify(
                event_id, event_type, origin, event_data, triggered_at, []
            )
            return

        # Build queue items + summary in a single pass over rules
        queue_items: list[QueueItem] = []
        triggered_rules_summary: list[dict] = []

        for rule in rules:
            items = self._rule_to_queue_items(rule, origin)
            queue_items.extend(items)
            triggered_rules_summary.append(self._build_rule_summary(rule, items))

        Logger.info(
            f"[Dispatcher] Created {len(queue_items)} queue items from "
            f"{len(rules)} rule(s) for '{event_type}'"
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
        record = TriggeredEvent(
            id=event_id,
            event_type=event_type,
            origin=origin,
            event_data=event_data,
            triggered_at=triggered_at,
            triggered_rules=triggered_rules,
        )
        await self._event_repo.save(record)

        if self._ws_notifier:
            self._ws_notifier.notify(
                payload_type="events:triggered",
                payload={
                    "id": event_id,
                    "event_type": event_type,
                    "origin": origin,
                    "event_data": event_data,
                    "triggered_at": triggered_at.isoformat(),
                    "triggered_rules": triggered_rules,
                },
            )

    @staticmethod
    def _build_rule_summary(rule: TriggerRule, queue_items: list[QueueItem]) -> dict:
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
                    "payload": item.payload,
                }
                for item in queue_items
                if item.trigger_rule_id == rule.id
            ],
        }

    @staticmethod
    def _build_wof_summary(rule_name: str, queue_items: list[QueueItem]) -> list[dict]:
        """Build a summary for WOF dynamic events (no DB rule involved)."""
        return [
            {
                "rule_id": None,
                "rule_name": rule_name or "Custom WOF",
                "priority": 0,
                "actions": [
                    {
                        "queue_item_id": item.id,
                        "action_id": None,
                        "action_type": item.action_type.value,
                        "display_name": item.display_name,
                        "duration": item.duration,
                        "cumulative": item.cumulative,
                        "payload": item.payload,
                    }
                    for item in queue_items
                ],
            }
        ]

    @staticmethod
    def _parse_wof_dynamic_profile(
        event_action_text: str, origin: str
    ) -> list[QueueItem]:
        """
        Parse dynamic WOF action codes (e.g. {p:Jfa}).
        Format: {p:[Profile][Level][Duration]}
          - Profile: uppercase letter A-J (or X for random)
          - Level: uppercase = +5% per step from A, lowercase = -2% per step from a
          - Duration: uppercase = 10s per step from A, lowercase = random up to 10s per step from a
        """
        m = re.match(r"^\{p:([A-Z])([A-Za-z])([A-Za-z])\}", event_action_text)
        if not m:
            return []

        profile = m.group(1)

        # Level coefficient
        level_char = m.group(2)
        if level_char.isupper():
            level_pct = 100 + (ord(level_char) - 65) * 5
        else:
            level_pct = 100 - (ord(level_char) - 97) * 2

        # Duration
        dur_char = m.group(3)
        if dur_char.isupper():
            duration = (ord(dur_char) - 64) * 10
        else:
            duration = random.randint(10, (ord(dur_char) - 96) * 10)

        Logger.info(
            f"[Dispatcher] Parsed WOF dynamic: profile={profile}, level={level_pct}%, duration={duration}s"
        )

        return [
            QueueItem(
                id=generate_id(),
                action_type=ActionType.PROFILE,
                payload={"profile": profile, "level_pct": level_pct},
                duration=duration,
                cumulative=False,
                priority=0,
                status=QueueItemStatus.WAITING,
                origin=origin,
                display_name=f"WOF | Profile: {profile} at {level_pct} for {duration}s",
                created_at=datetime.now(),
            )
        ]

    @staticmethod
    def _rule_to_queue_items(rule: TriggerRule, origin: str) -> list[QueueItem]:
        """Convert a TriggerRule's actions into QueueItems."""
        items = []
        for action in rule.actions:
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
                created_at=datetime.now(),
            )
            items.append(item)
        return items
