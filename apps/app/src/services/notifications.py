"""In-app notifications (trigger rules, flow notify nodes, approvals, errors).

The notification center is transport-only: this service builds a normalized
payload, coalesces bursts of the same source and pushes it over WebSocket
(`notifications:new` / `notifications:update`). Nothing is persisted — the
client keeps its own history for the current browser session.

Coalescing keeps noisy rules readable: the first notification is broadcast,
and repetitions within `coalesce_window` seconds are folded into it
(`count`/`message`/`updated_at` updates on the same id).
"""

from __future__ import annotations

import threading
import time
from datetime import UTC, datetime
from typing import Any, Literal

import structlog
from cuid2 import cuid_wrapper

from api.ws.websocket_notifier import WebSocketNotifier, ws_notifier
from utils import to_utc_iso

logger = structlog.get_logger("pes")

generate_id = cuid_wrapper()

NotificationKind = Literal[
    "rule_fired",
    "flow_notify",
    "approval",
    "warning",
    "error",
]
NotificationSeverity = Literal["info", "success", "warning", "error"]

# Repetitions of the same source inside this window update the existing
# notification instead of adding a new one.
DEFAULT_COALESCE_WINDOW_SECONDS = 4.0


class NotificationCenter:
    """Builds and broadcasts in-app notifications (safe from any thread)."""

    def __init__(
        self,
        notifier: WebSocketNotifier | None = None,
        *,
        coalesce_window: float = DEFAULT_COALESCE_WINDOW_SECONDS,
    ) -> None:
        self._notifier = notifier or ws_notifier
        self._coalesce_window = coalesce_window
        # coalesce key -> (notification id, last epoch, count)
        self._coalesced: dict[str, tuple[str, float, int]] = {}
        self._lock = threading.Lock()

    # ───────── Public API ─────────

    def publish(
        self,
        *,
        kind: NotificationKind,
        title: str,
        message: str,
        severity: NotificationSeverity = "info",
        rule_id: str | None = None,
        rule_name: str | None = None,
        event_id: str | None = None,
        event_type: str | None = None,
        origin: str | None = None,
        actions: list[str] | None = None,
        link: str | None = None,
        data: dict[str, Any] | None = None,
        coalesce_key: str | None = None,
    ) -> None:
        """Broadcast one notification, coalescing repeats of `coalesce_key`."""
        now = time.time()
        if coalesce_key and self._should_coalesce(coalesce_key, now):
            return

        notification_id = generate_id()
        payload = {
            "id": notification_id,
            "kind": kind,
            "severity": severity,
            "title": title,
            "message": message,
            "created_at": to_utc_iso(datetime.now(UTC)),
            "updated_at": None,
            "count": 1,
            "rule_id": rule_id,
            "rule_name": rule_name,
            "event_id": event_id,
            "event_type": event_type,
            "origin": origin,
            "actions": list(actions or []),
            "link": link,
            "data": dict(data or {}),
        }

        if coalesce_key:
            with self._lock:
                self._coalesced[coalesce_key] = (notification_id, now, 1)

        try:
            self._notifier.notify("notifications:new", payload)
        except Exception:
            logger.exception(
                "[Notifications] Failed to broadcast notification",
                kind=kind,
                rule_id=rule_id,
            )

    # ───────── Internals ─────────

    def _should_coalesce(self, key: str, now: float) -> bool:
        """Fold a repeat into the previous notification (returns True when folded)."""
        with self._lock:
            entry = self._coalesced.get(key)
            if entry is None:
                return False
            notification_id, last_seen, count = entry
            if now - last_seen > self._coalesce_window:
                return False
            self._coalesced[key] = (notification_id, now, count + 1)

        try:
            self._notifier.notify(
                "notifications:update",
                {
                    "id": notification_id,
                    "count": count + 1,
                    "updated_at": to_utc_iso(datetime.now(UTC)),
                },
            )
        except Exception:
            logger.exception(
                "[Notifications] Failed to broadcast coalesced update",
                notification_id=notification_id,
            )
        return True


notification_center = NotificationCenter()


__all__ = [
    "DEFAULT_COALESCE_WINDOW_SECONDS",
    "NotificationCenter",
    "NotificationKind",
    "NotificationSeverity",
    "notification_center",
]
