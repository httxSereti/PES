"""
In-process log broadcasting for the real-time log viewer.

A ``logging.Handler`` formats each record as a JSON line and pushes it into a
ring buffer.  SSE subscribers get the buffered history once, then every new
line as it is written.  The design mirrors the logstream package used by
autobrr/qui: one process-wide hub, a bounded history, and non-blocking
per-subscriber queues so a slow browser can never block the application.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from pathlib import Path
from threading import Lock
from typing import Deque

DEFAULT_BUFFER_SIZE = 1000
DEFAULT_SUBSCRIBER_BUFFER = 500


class LogSubscription:
    """A single SSE consumer."""

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        maxsize: int = DEFAULT_SUBSCRIBER_BUFFER,
    ) -> None:
        self.loop = loop
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=maxsize)


class LogHub:
    """Thread-safe ring buffer of formatted log lines + live subscribers."""

    def __init__(self, buffer_size: int = DEFAULT_BUFFER_SIZE) -> None:
        if buffer_size <= 0:
            buffer_size = DEFAULT_BUFFER_SIZE
        self._buffer: Deque[str] = deque(maxlen=buffer_size)
        self._subscribers: set[LogSubscription] = set()
        self._lock = Lock()
        self._log_dir = Path("logs")

    @property
    def log_dir(self) -> Path:
        return self._log_dir

    def set_log_dir(self, path: str | Path) -> None:
        self._log_dir = Path(path)

    def write(self, line: str) -> None:
        """Append one complete log line and fan it out to subscribers."""
        line = line.rstrip("\r\n")
        if not line:
            return

        with self._lock:
            self._buffer.append(line)
            subscribers = tuple(self._subscribers)

        for subscription in subscribers:
            try:
                subscription.loop.call_soon_threadsafe(
                    self._deliver, subscription, line
                )
            except RuntimeError:
                # The event loop was closed between subscribe/unsubscribe.
                self.unsubscribe(subscription)

    @staticmethod
    def _deliver(subscription: LogSubscription, line: str) -> None:
        try:
            subscription.queue.put_nowait(line)
        except asyncio.QueueFull:
            # Slow consumer protection: drop the line for this subscriber.
            pass

    def history(self, limit: int | None = None) -> list[str]:
        with self._lock:
            lines = list(self._buffer)
        if limit is not None and limit > 0:
            return lines[-limit:]
        return lines

    def subscribe(
        self, loop: asyncio.AbstractEventLoop, limit: int | None = None
    ) -> tuple[LogSubscription, list[str]]:
        """Register a subscriber and snapshot history atomically.

        Taking the snapshot under the same lock as the registration means a
        line is either in the history or delivered live, never both.
        """
        subscription = LogSubscription(loop)
        with self._lock:
            self._subscribers.add(subscription)
            history = list(self._buffer)
        if limit is not None and limit > 0:
            history = history[-limit:]
        return subscription, history

    def unsubscribe(self, subscription: LogSubscription) -> None:
        with self._lock:
            self._subscribers.discard(subscription)

    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)


log_hub = LogHub()


class LogHubHandler(logging.Handler):
    """Forward formatter output (one JSON line) to the hub."""

    def __init__(
        self, formatter: logging.Formatter, hub: LogHub | None = None
    ) -> None:
        super().__init__()
        self._hub = hub or log_hub
        self.setFormatter(formatter)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._hub.write(self.format(record))
        except Exception:
            # Logging errors must never break the caller (or recurse).
            self.handleError(record)
