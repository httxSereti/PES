from __future__ import annotations

import threading
from datetime import datetime
from typing import TYPE_CHECKING

from .enums import QueueItemStatus
from .models import QueueItem
import structlog

if TYPE_CHECKING:
    from .executor import ActionExecutor
    from api.ws.websocket_notifier import WebSocketNotifier

logger = structlog.get_logger("pes")


class ActionQueue:
    """
    Concurrency model: tick()/cancel()/cancel_all() all run on the API
    (uvicorn) event loop, while enqueue() may be called from other threads
    (e.g. the Discord bot's loop via the dispatcher). All state-machine
    transitions are therefore performed atomically under self._lock as a
    "claim": the status check, the transition, and the removal from the
    list happen in one locked section. Only the winning claimant performs
    the (slow, non-blocking) hardware apply/reverse outside the lock, so a
    RUNNING item can never be reversed twice and an item cannot be
    finalized by one caller while another cancels it.
    """

    _instance: ActionQueue | None = None

    @classmethod
    def get_instance(cls) -> ActionQueue:
        if cls._instance is None:
            raise RuntimeError("ActionQueue not initialized")
        return cls._instance

    def __init__(
        self, executor: ActionExecutor, ws_notifier: WebSocketNotifier | None = None
    ):
        ActionQueue._instance = self
        self._executor = executor
        self._ws_notifier = ws_notifier
        self._items: list[QueueItem] = []
        self._lock = threading.Lock()
        self._paused = False
        # Ids of items whose apply() is in flight. Such items have no
        # snapshot yet, so cancel/finalize must not reverse them;
        # _start_item() undoes the hardware state once apply() completes.
        self._applying: set[str] = set()

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
            logger.info(f"[Queue] Enqueued {len(items)} items")
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
            i for i in running_items if i.duration != -1 and i.elapsed >= i.duration
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
                    if await self._start_item(item):
                        break  # Only one non-cumulative at a time

        # Start all waiting cumulative items
        for item in waiting:
            if item.cumulative and item.status == QueueItemStatus.WAITING:
                await self._start_item(item)

    async def cancel(self, item_id: str) -> bool:
        """Cancel a specific item. Reverses it if RUNNING."""
        # Atomic claim: transition + removal under the lock so no other
        # thread/loop can finalize or cancel the same item concurrently.
        with self._lock:
            item = next((i for i in self._items if i.id == item_id), None)
            if not item:
                return False
            # Reverse only if apply() already completed (snapshot exists);
            # otherwise _start_item() undoes the hardware state instead.
            needs_reverse = (
                item.status == QueueItemStatus.RUNNING and item.id not in self._applying
            )
            item.status = QueueItemStatus.CANCELLED
            item.completed_at = datetime.now()
            self._items = [i for i in self._items if i.id != item_id]
            self._total_cancelled += 1

        # Only the claimant reverses.
        if needs_reverse:
            try:
                await self._executor.reverse(item)
            except Exception as e:
                logger.error(f"[Queue] Error reversing action '{item.id}': {e}")

        logger.info(f"[Queue] Cancelled item '{item_id}' ({item.origin})")
        self._notify_update()
        return True

    async def cancel_all(self) -> int:
        """Cancel all items. Returns count of cancelled items."""
        # Atomic claim: snapshot, transition, and clear in one locked
        # section so tick() on the other loop cannot finalize or start
        # any of these items afterwards.
        with self._lock:
            items_to_cancel = list(self._items)
            # Skip items whose apply() is still in flight (see cancel()).
            running = [
                i
                for i in items_to_cancel
                if i.status == QueueItemStatus.RUNNING and i.id not in self._applying
            ]
            for item in items_to_cancel:
                item.status = QueueItemStatus.CANCELLED
                item.completed_at = datetime.now()
            self._total_cancelled += len(items_to_cancel)
            self._items.clear()

        # Only the claimant reverses (see cancel()).
        for item in running:
            try:
                await self._executor.reverse(item)
            except Exception as e:
                logger.error(f"[Queue] Error reversing action '{item.id}': {e}")

        count = len(items_to_cancel)
        logger.info(f"[Queue] Cancelled all items ({count})")
        self._notify_update()
        return count

    def pause(self) -> None:
        """Pause queue processing. Running items continue their elapsed timer."""
        self._paused = True
        logger.info("[Queue] Paused")
        self._notify_update()

    def resume(self) -> None:
        """Resume queue processing."""
        self._paused = False
        logger.info("[Queue] Resumed")
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

    async def _start_item(self, item: QueueItem) -> bool:
        """Start executing an item. Returns True if it was actually started."""
        # Atomic claim: only start if still WAITING and still queued (it may
        # have been cancelled by the other loop since the tick snapshot).
        with self._lock:
            if item.status != QueueItemStatus.WAITING or not self._is_queued(item):
                return False
            item.status = QueueItemStatus.RUNNING
            item.started_at = datetime.now()
            item.elapsed = 0
            self._applying.add(item.id)

        try:
            snapshot = await self._executor.apply(item)
        except Exception as e:
            logger.error(f"[Queue] Error applying action '{item.id}': {e}")
            # Remove failed item
            with self._lock:
                self._applying.discard(item.id)
                self._items = [i for i in self._items if i.id != item.id]
            return False

        with self._lock:
            self._applying.discard(item.id)
            still_queued = self._is_queued(item)
            if still_queued:
                item.snapshot_data = snapshot

        if not still_queued:
            # Cancelled/finalized while apply() was in flight: undo the
            # hardware state now, since the claimant could not reverse it.
            item.snapshot_data = snapshot
            try:
                await self._executor.reverse(item)
            except Exception as e:
                logger.error(f"[Queue] Error reversing action '{item.id}': {e}")
            return False

        logger.info(
            f"[Queue] Started '{item.action_type.value}' (duration={item.duration}s, cumulative={item.cumulative})",
            origin=item.origin,
        )
        self._notify_update()
        return True

    def _is_queued(self, item: QueueItem) -> bool:
        """Identity check for queue membership. Caller must hold the lock."""
        return any(i is item for i in self._items)

    async def _finalize_item(self, item: QueueItem) -> None:
        """Finalize an expired item: reverse and remove."""
        # Atomic claim: skip if the other loop already cancelled or
        # finalized this item since the tick snapshot.
        with self._lock:
            if item.status != QueueItemStatus.RUNNING or not self._is_queued(item):
                return
            # If apply() is still in flight there is no snapshot yet;
            # _start_item() undoes the hardware state once apply() completes.
            needs_reverse = item.id not in self._applying
            item.status = QueueItemStatus.DONE
            item.completed_at = datetime.now()
            self._items = [i for i in self._items if i.id != item.id]
            self._total_done += 1

        # Only the claimant reverses.
        if needs_reverse:
            try:
                await self._executor.reverse(item)
            except Exception as e:
                logger.error(f"[Queue] Error reversing action '{item.id}': {e}")

        logger.info(
            f"[Queue] Completed '{item.action_type.value}' after {item.elapsed}s",
            origin=item.origin,
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
