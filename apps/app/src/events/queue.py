from __future__ import annotations

import threading
from datetime import datetime
from typing import TYPE_CHECKING

from .enums import QueueItemStatus
from .models import QueueItem
from utils import Logger

if TYPE_CHECKING:
    from .executor import ActionExecutor
    from api.ws.websocket_notifier import WebSocketNotifier


class ActionQueue:
    _instance: ActionQueue | None = None

    @classmethod
    def get_instance(cls) -> ActionQueue:
        if cls._instance is None:
            raise RuntimeError("ActionQueue not initialized")
        return cls._instance

    def __init__(self, executor: ActionExecutor, ws_notifier: WebSocketNotifier | None = None):
        ActionQueue._instance = self
        self._executor = executor
        self._ws_notifier = ws_notifier
        self._items: list[QueueItem] = []
        self._lock = threading.Lock()
        self._paused = False

        # Stats
        self._total_done = 0
        self._total_cancelled = 0

    # ───────── Public API ─────────

    def enqueue(self, items: list[QueueItem]) -> None:
        """Add items to the queue. They will be sorted by priority."""
        with self._lock:
            self._items.extend(items)
            # Sort: higher priority first, then by creation time
            self._items.sort(key=lambda x: (-x.priority, x.created_at))

        if items:
            Logger.info(f"[Queue] Enqueued {len(items)} items")
            self._notify_update()

    async def tick(self) -> None:
        """
        Process one tick of the queue (called every second).
        1. Increment elapsed for RUNNING items
        2. Finalize expired items
        3. Start next waiting items
        """
        if self._paused:
            return

        with self._lock:
            items = list(self._items)

        # Step 1: Increment elapsed for all RUNNING items
        running_items = [i for i in items if i.status == QueueItemStatus.RUNNING]
        for item in running_items:
            item.elapsed += 1

        # Step 2: Finalize expired items (duration != -1 and elapsed >= duration)
        expired = [
            i for i in running_items
            if i.duration != -1 and i.elapsed >= i.duration
        ]
        for item in expired:
            await self._finalize_item(item)

        # Step 3: Start waiting items
        if self._paused:
            return

        with self._lock:
            items = list(self._items)

        waiting = [i for i in items if i.status == QueueItemStatus.WAITING]
        running = [i for i in items if i.status == QueueItemStatus.RUNNING]
        has_non_cumulative_running = any(not i.cumulative for i in running)

        # Start non-cumulative: only if none currently running
        if not has_non_cumulative_running:
            for item in waiting:
                if not item.cumulative:
                    await self._start_item(item)
                    break  # Only one non-cumulative at a time

        # Start all waiting cumulative items
        for item in waiting:
            if item.cumulative and item.status == QueueItemStatus.WAITING:
                await self._start_item(item)

    async def cancel(self, item_id: str) -> bool:
        """Cancel a specific item. Reverses it if RUNNING."""
        with self._lock:
            item = next((i for i in self._items if i.id == item_id), None)

        if not item:
            return False

        if item.status == QueueItemStatus.RUNNING:
            await self._executor.reverse(item)

        with self._lock:
            item.status = QueueItemStatus.CANCELLED
            item.completed_at = datetime.now()
            self._items = [i for i in self._items if i.id != item_id]
            self._total_cancelled += 1

        Logger.info(f"[Queue] Cancelled item '{item_id}' ({item.origin})")
        self._notify_update()
        return True

    async def cancel_all(self) -> int:
        """Cancel all items. Returns count of cancelled items."""
        with self._lock:
            items_to_cancel = list(self._items)

        count = 0
        for item in items_to_cancel:
            if item.status == QueueItemStatus.RUNNING:
                await self._executor.reverse(item)
            count += 1

        with self._lock:
            self._total_cancelled += len(self._items)
            self._items.clear()

        Logger.info(f"[Queue] Cancelled all items ({count})")
        self._notify_update()
        return count

    def pause(self) -> None:
        """Pause queue processing. Running items continue their elapsed timer."""
        self._paused = True
        Logger.info("[Queue] Paused")
        self._notify_update()

    def resume(self) -> None:
        """Resume queue processing."""
        self._paused = False
        Logger.info("[Queue] Resumed")
        self._notify_update()

    @property
    def is_paused(self) -> bool:
        return self._paused

    def get_items(self) -> list[QueueItem]:
        """Get a copy of all items in the queue."""
        with self._lock:
            return list(self._items)

    def get_status(self) -> dict:
        """Get queue statistics."""
        with self._lock:
            items = list(self._items)

        waiting = sum(1 for i in items if i.status == QueueItemStatus.WAITING)
        running = sum(1 for i in items if i.status == QueueItemStatus.RUNNING)

        return {
            "paused": self._paused,
            "waiting": waiting,
            "running": running,
            "total_in_queue": len(items),
            "total_done": self._total_done,
            "total_cancelled": self._total_cancelled,
        }

    # ───────── Internal ─────────

    async def _start_item(self, item: QueueItem) -> None:
        """Start executing an item."""
        item.status = QueueItemStatus.RUNNING
        item.started_at = datetime.now()
        item.elapsed = 0

        try:
            snapshot = await self._executor.apply(item)
            item.snapshot_data = snapshot
        except Exception as e:
            Logger.error(f"[Queue] Error applying action '{item.id}': {e}")
            # Remove failed item
            with self._lock:
                self._items = [i for i in self._items if i.id != item.id]
            return

        Logger.info(
            f"[Queue] Started '{item.action_type.value}' from '{item.origin}' "
            f"(duration={item.duration}s, cumulative={item.cumulative})"
        )
        self._notify_update()

    async def _finalize_item(self, item: QueueItem) -> None:
        """Finalize an expired item: reverse and remove."""
        try:
            await self._executor.reverse(item)
        except Exception as e:
            Logger.error(f"[Queue] Error reversing action '{item.id}': {e}")

        with self._lock:
            item.status = QueueItemStatus.DONE
            item.completed_at = datetime.now()
            self._items = [i for i in self._items if i.id != item.id]
            self._total_done += 1

        Logger.info(
            f"[Queue] Completed '{item.action_type.value}' from '{item.origin}' "
            f"after {item.elapsed}s"
        )
        self._notify_update()

    def _notify_update(self) -> None:
        """Notify WebSocket clients of queue state change."""
        if self._ws_notifier:
            try:
                self._ws_notifier.notify(
                    payload_type="queue:update",
                    payload=self.get_status(),
                )
            except Exception:
                pass
