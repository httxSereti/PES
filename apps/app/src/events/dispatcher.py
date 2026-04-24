from __future__ import annotations

import math
import random
import re
from datetime import datetime
from typing import TYPE_CHECKING

from cuid2 import cuid_wrapper

from events.enums import ActionType, QueueItemStatus, TriggerableEvent
from events.models import QueueItem, TriggerRule
from events.registry import EventRegistry
from events.queue import ActionQueue
from utils import Logger
from pprint import pprint

if TYPE_CHECKING:
    from api.ws.websocket_notifier import WebSocketNotifier
    from services.notifier import Notifier

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
        notifier: Notifier | None = None,
    ):
        EventDispatcher._instance = self
        self._registry = registry
        self._queue = queue
        self._ws_notifier = ws_notifier
        self._notifier = notifier

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
        Logger.info(f"[Dispatcher] Event received: type={event_type}, origin={origin}")

        # Notify via WebSocket
        if self._ws_notifier:
            self._ws_notifier.notify(
                payload_type="events:triggered",
                payload={
                    "event_type": event_type,
                    "origin": origin,
                    "event_data": event_data,
                },
            )

        # Notify via Discord
        if self._notifier:
            try:
                triggerable = TriggerableEvent(event_type)
                await self._notifier.triggerEvent(triggerable, eventData=event_data)
            except ValueError:
                print(f"[Dispatcher] Not a known TriggerableEvent: {event_type}")
                pass  # Not a known TriggerableEvent (e.g. dynamic WOF)

        # Check for dynamic WOF action (wof_XYZ pattern)
        wof_items = self._parse_wof_dynamic(event_type, origin)
        if wof_items:
            self._queue.enqueue(wof_items)
            return

        # Resolve trigger rules from DB
        rules = await self._registry.get_rules_for_event(event_type)
        pprint(rules)
        if not rules:
            Logger.debug(f"[Dispatcher] No trigger rules for event '{event_type}'")
            return

        # Create queue items from all enabled rules
        queue_items = []
        for rule in rules:
            items = self._rule_to_queue_items(rule, origin)
            queue_items.extend(items)

        if queue_items:
            Logger.info(
                f"[Dispatcher] Created {len(queue_items)} queue items from "
                f"{len(rules)} rule(s) for '{event_type}'"
            )
            self._queue.enqueue(queue_items)

    # ───────── WOF Dynamic Parsing ─────────

    @staticmethod
    def _parse_wof_dynamic(event_type: str, origin: str) -> list[QueueItem]:
        """
        Parse dynamic WOF action codes (e.g. wof_AaB).
        Format: wof_[Profile][Level][Duration]
          - Profile: uppercase letter A-J (or X for random)
          - Level: uppercase = +5% per step from A, lowercase = -2% per step from a
          - Duration: uppercase = 10s per step from A, lowercase = random up to 10s per step from a
        """
        m = re.match(r"^wof_([A-Z])([A-Za-z])([A-Za-z])$", event_type)
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
            f"[Dispatcher] Parsed WOF dynamic: profile={profile}, "
            f"level={level_pct}%, duration={duration}s"
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
                display_name=f"WOF {event_type}",
                created_at=datetime.now(),
            )
        ]

    # ───────── Rule to QueueItems ─────────

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
