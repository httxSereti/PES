"""Suppress events that are echoes of a local integration action.

Integrations such as PuryFi and Chaster can report changes that were caused by
PES itself. Those echoes must not be allowed to trigger another action from the
same integration, otherwise a rule can feed back into itself indefinitely.

An `EchoGuard` stores the expected echo events in a short-lived queue. Each
expectation carries the causation depth of the action that caused it, so the
dispatcher can continue a bounded event chain while suppressing same-integration
actions. Expectations expire so a no-op or failed action cannot suppress
unrelated events forever.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class _PendingEcho:
    depth: int
    expires_at: float


class EchoGuard:
    """Thread-safe, bounded queue of expected local-action echoes."""

    def __init__(self, max_pending: int = 64) -> None:
        self._pending: dict[str, deque[_PendingEcho]] = {}
        self._lock = threading.Lock()
        self._max_pending = max(1, max_pending)

    def expect(
        self,
        key: str,
        ttl_seconds: float,
        depth: int,
        count: int = 1,
    ) -> None:
        """Expect the next `count` events in `key`'s family, caused at `depth`."""
        if count <= 0 or ttl_seconds <= 0:
            return

        expires_at = time.monotonic() + ttl_seconds
        with self._lock:
            pending = self._pending.setdefault(key, deque())
            for _ in range(count):
                pending.append(_PendingEcho(depth=depth, expires_at=expires_at))
            while len(pending) > self._max_pending:
                pending.popleft()

    def consume(self, key: str) -> int | None:
        """Return the causation depth of the next echo, or None."""
        now = time.monotonic()
        with self._lock:
            pending = self._pending.get(key)
            if not pending:
                return None

            while pending and pending[0].expires_at <= now:
                pending.popleft()
            if not pending:
                self._pending.pop(key, None)
                return None

            echo = pending.popleft()
            if not pending:
                self._pending.pop(key, None)
            return echo.depth

    def clear(self, key: str | None = None) -> None:
        """Drop one family's expectations, or all of them."""
        with self._lock:
            if key is None:
                self._pending.clear()
            else:
                self._pending.pop(key, None)
