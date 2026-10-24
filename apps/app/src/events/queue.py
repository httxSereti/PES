from __future__ import annotations

import asyncio
import threading
import time
from datetime import datetime
from typing import TYPE_CHECKING

import structlog

from typings import UnitDict

from .enums import QueueItemStatus
from .models import QueueItem

if TYPE_CHECKING:
    from api.ws.websocket_notifier import WebSocketNotifier

    from .executor import ActionExecutor

logger = structlog.get_logger("pes")

# Integration handlers may do network I/O. They run outside the scheduler tick,
# so these bounds protect task cleanup without delaying unrelated actions.
_APPLY_TIMEOUT_SECONDS = 60.0
_REVERSE_TIMEOUT_SECONDS = 30.0


class ActionQueue:
    """
    Concurrency model: tick()/cancel()/cancel_all()/cancel_for_unit() all run
    on the API (uvicorn) event loop, while enqueue() may be called from other
    threads (e.g. the BT sensor threads via the dispatcher). All state-machine
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
        # _apply_item() undoes the hardware state once apply() completes.
        self._applying: set[str] = set()
        # Background apply/reverse tasks. Kept referenced until completion so
        # the event loop cannot garbage-collect a running handler.
        self._tasks: set[asyncio.Task] = set()

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

        1. Refresh elapsed from monotonic deadlines
        2. Finalize expired items
        3. Start next waiting items

        Handlers are never awaited here: apply/reverse run in tracked background
        tasks so a slow integration call cannot stall unrelated expirations.
        """
        if self._paused:
            return

        now = time.monotonic()
        with self._lock:
            running_items = [
                item
                for item in self._items
                if item.status == QueueItemStatus.RUNNING
            ]
            for item in running_items:
                if item.started_monotonic is not None:
                    item.elapsed = max(0, int(now - item.started_monotonic))
            expired = [
                item
                for item in running_items
                if item.expires_monotonic is not None
                and now >= item.expires_monotonic
            ]

        for item in expired:
            self._finalize_item(item)

        if self._paused:
            return

        with self._lock:
            waiting = [
                item
                for item in self._items
                if item.status == QueueItemStatus.WAITING
            ]
            has_non_cumulative_running = any(
                item.status == QueueItemStatus.RUNNING and not item.cumulative
                for item in self._items
            )

        # Start non-cumulative: only if none currently running.
        if not has_non_cumulative_running:
            for item in waiting:
                if not item.cumulative:
                    if self._start_item(item):
                        break  # Only one non-cumulative at a time

        # Start all waiting cumulative items.
        for item in waiting:
            if item.cumulative and item.status == QueueItemStatus.WAITING:
                self._start_item(item)

    async def cancel(self, item_id: str) -> bool:
        """Cancel a specific item. Reverses it if RUNNING."""
        # Atomic claim: transition + removal under the lock so no other
        # thread/loop can finalize or cancel the same item concurrently.
        with self._lock:
            item = next((i for i in self._items if i.id == item_id), None)
            if not item:
                return False
            # Reverse only if apply() already completed (snapshot exists);
            # otherwise _apply_item() undoes the hardware state instead.
            needs_reverse = (
                item.status == QueueItemStatus.RUNNING and item.id not in self._applying
            )
            item.status = QueueItemStatus.CANCELLED
            item.completed_at = datetime.now()
            self._items = [i for i in self._items if i.id != item_id]
            self._total_cancelled += 1

        # Only the claimant reverses.
        if needs_reverse:
            await self._reverse_now(item)

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
            await self._reverse_now(item)

        count = len(items_to_cancel)
        logger.info(f"[Queue] Cancelled all items ({count})")
        self._notify_update()
        return count

    async def cancel_for_unit(self, unit: UnitDict) -> int:
        """
        Cancel every item that targets `unit` (waiting or running).

        Used by ``units:stop`` so a queued action cannot drive the stopped
        unit again after its channels were zeroed. Running items are
        reversed by the same claim/removal rules as ``cancel()``.
        """
        with self._lock:
            targets = [
                i for i in self._items if self._executor.targets_unit(i, unit)
            ]
            # Skip items whose apply() is still in flight (see cancel()).
            running = [
                i
                for i in targets
                if i.status == QueueItemStatus.RUNNING and i.id not in self._applying
            ]
            for item in targets:
                item.status = QueueItemStatus.CANCELLED
                item.completed_at = datetime.now()
            self._total_cancelled += len(targets)
            target_ids = {item.id for item in targets}
            self._items = [i for i in self._items if i.id not in target_ids]

        # Only the claimant reverses (see cancel()).
        for item in running:
            await self._reverse_now(item)

        count = len(targets)
        if count:
            logger.info(
                f"[Queue] Cancelled {count} items targeting {unit.value}"
            )
            self._notify_update()
        return count

    async def cancel_inflight(self) -> int:
        """
        Cancel background apply/reverse tasks.

        Used by ``neutralize_all``: callers zero outputs immediately after this,
        so a late apply completion must not reverse the hardware back on.
        """
        with self._lock:
            tasks = [task for task in self._tasks if not task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with self._lock:
            self._tasks.difference_update(tasks)
            self._applying.clear()
        return len(tasks)

    def pause(self) -> None:
        """Pause new starts/finalization; running timers continue and may expire on resume."""
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

    def _start_item(self, item: QueueItem) -> bool:
        """Claim a waiting item and schedule its apply task."""
        # Atomic claim: only start if still WAITING and still queued (it may
        # have been cancelled by the other loop since the tick snapshot).
        skipped = False
        with self._lock:
            if item.status != QueueItemStatus.WAITING or not self._is_queued(item):
                return False
            # The integration or action may have been disabled while this item
            # was waiting, so re-check at claim time and drop it instead of
            # applying an action the user turned off.
            if not self._executor.is_action_enabled(item):
                item.status = QueueItemStatus.CANCELLED
                item.completed_at = datetime.now()
                self._items = [i for i in self._items if i.id != item.id]
                self._total_cancelled += 1
                skipped = True
            else:
                item.status = QueueItemStatus.RUNNING
                item.started_at = datetime.now()
                item.elapsed = 0
                item.started_monotonic = None
                item.expires_monotonic = None
                self._applying.add(item.id)

        if skipped:
            logger.info(
                f"[Queue] Skipped '{item.action_type.value}' (action disabled)",
                origin=item.origin,
            )
            self._notify_update()
            return False

        self._spawn(self._apply_item(item), name=f"queue-apply:{item.id}")
        return True

    async def _apply_item(self, item: QueueItem) -> None:
        """Apply an item in the background, then establish its deadline."""
        try:
            snapshot = await asyncio.wait_for(
                self._executor.apply(item),
                timeout=_APPLY_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error(
                f"[Queue] Action '{item.id}' timed out after "
                f"{_APPLY_TIMEOUT_SECONDS:g}s"
            )
            self._remove_failed_item(item)
            return
        except Exception as e:
            logger.error(f"[Queue] Error applying action '{item.id}': {e}")
            self._remove_failed_item(item)
            return

        now = time.monotonic()
        with self._lock:
            self._applying.discard(item.id)
            still_queued = self._is_queued(item)
            if still_queued:
                item.snapshot_data = snapshot
                # Duration starts once the action has actually been applied;
                # a slow handler must not consume the configured run time.
                item.started_at = datetime.now()
                item.started_monotonic = now
                item.expires_monotonic = (
                    now + item.duration if item.duration != -1 else None
                )

        if not still_queued:
            # Cancelled/finalized while apply() was in flight: undo the
            # hardware state now, since the claimant could not reverse it.
            item.snapshot_data = snapshot
            await self._reverse_now(item)
            return

        logger.info(
            f"[Queue] Started '{item.action_type.value}' (duration={item.duration}s, cumulative={item.cumulative})",
            origin=item.origin,
        )
        self._notify_update()

    def _remove_failed_item(self, item: QueueItem) -> None:
        """Drop an item whose apply failed or timed out."""
        with self._lock:
            self._applying.discard(item.id)
            self._items = [i for i in self._items if i.id != item.id]
            item.completed_at = datetime.now()
        self._notify_update()

    def _is_queued(self, item: QueueItem) -> bool:
        """Identity check for queue membership. Caller must hold the lock."""
        return any(i is item for i in self._items)

    def _finalize_item(self, item: QueueItem) -> None:
        """Finalize an expired item and schedule its reverse task."""
        # Atomic claim: skip if the other loop already cancelled or
        # finalized this item since the tick snapshot.
        with self._lock:
            if item.status != QueueItemStatus.RUNNING or not self._is_queued(item):
                return
            # If apply() is still in flight there is no snapshot yet;
            # _apply_item() undoes the hardware state once apply() completes.
            needs_reverse = item.id not in self._applying
            item.status = QueueItemStatus.DONE
            item.completed_at = datetime.now()
            self._items = [i for i in self._items if i.id != item.id]
            self._total_done += 1

        # Reverse outside the tick: a slow integration handler must not delay
        # expiration of other items.
        if needs_reverse:
            self._spawn(
                self._reverse_item(item),
                name=f"queue-reverse:{item.id}",
            )

        logger.info(
            f"[Queue] Completed '{item.action_type.value}' after {item.elapsed}s",
            origin=item.origin,
        )
        self._notify_update()

    async def _reverse_now(self, item: QueueItem) -> None:
        """Reverse an item with a bounded timeout, logging failures."""
        try:
            await asyncio.wait_for(
                self._executor.reverse(item),
                timeout=_REVERSE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error(
                f"[Queue] Reverse of '{item.id}' timed out after "
                f"{_REVERSE_TIMEOUT_SECONDS:g}s"
            )
        except Exception as e:
            logger.error(f"[Queue] Error reversing action '{item.id}': {e}")

    async def _reverse_item(self, item: QueueItem) -> None:
        await self._reverse_now(item)

    def _spawn(self, coro, *, name: str) -> None:
        """Track a background queue task until it completes."""
        task = asyncio.create_task(coro, name=name)
        self._tasks.add(task)
        task.add_done_callback(self._task_done)

    def _task_done(self, task: asyncio.Task) -> None:
        self._tasks.discard(task)
        if task.cancelled():
            return
        error = task.exception()
        if error is not None:
            logger.error(f"[Queue] Background task failed: {error}")

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
