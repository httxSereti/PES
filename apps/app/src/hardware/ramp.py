"""
Software ramp for unit outputs.

A ramp drives one output field of a unit ("ch_A", "ch_B", "adj_1", "adj_2")
step by step toward 100% of a max value. Ramps start at the field's current
level, or an explicit ``start_value`` (the reset point of RESET/WAVE cycles),
never at 0 unless that's where the field actually is. Each ramp has its own:

- ``step``      — increment on each step (default 1): percent of the max
  value, or an absolute field level when ``step_unit`` is "absolute"
- ``timer``     — delay in seconds between two steps
- ``duration`` — total run time in seconds, ``DURATION_PERMANENT`` (-1) to
  run forever; when the active time reaches ``duration`` the ramp stops
  (field restored to the max value). Paused time doesn't count.

Three modes (``RampMode``):

- ``RESET``  — sawtooth: climb start% -> 100%, dwell one step at 100%,
  reset to start% and start over.
- ``WAVE``   — triangle: climb start% -> 100% then decrease back to start%
  and start over.
- ``ASCEND`` — one-shot: climb (or descend) from start% to 100% and hold
  there; the "ramp to a target and keep it" case.

The max value is the field's current level captured when the ramp starts (or
an explicit ``max_value``, which may also be a MagicNumber-style range
string like ``[25-35]`` resolved randomly once at start). While a ramp is
active it owns the field: external writes to it are overwritten on the next
step. Pause freezes the ramp at its current value; stop removes it and
restores the field to the max value (pass ``restore=False`` to keep the
current ramped value instead).

Lifecycle changes are broadcast over WebSocket (``ramps:update`` on
start/pause/resume, ``ramps:remove`` on stop); the ramped field values reach
clients through the usual ``units:update`` flow.

``thread_ramp()`` must run in a daemon thread (wired in ``main.py``); ramps
are controlled through the ``ramp_manager`` singleton.
"""

import random
import re
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Union

import structlog

from api.ws.websocket_notifier import ws_notifier
from store import Store
from typings import RampMode, UnitDict

logger = structlog.get_logger("pes")

# unit fields a ramp can drive
RAMP_FIELDS = ("ch_A", "ch_B", "adj_1", "adj_2")

# delay in seconds between two ticks of the ramp thread
RAMP_TICK = 0.1

# progress is tracked in percent of the max value
PROGRESS_MIN = 0
PROGRESS_MAX = 100

# duration value for a ramp that never expires
DURATION_PERMANENT = -1


@dataclass
class Ramp:
    """State of one ramp on (unit, field)."""

    unit: UnitDict
    field: str
    max_value: int  # field level at 100% progress
    timer: float  # seconds between two steps
    step: float = 1.0  # progress increment per step
    step_unit: str = "percent"  # "percent" (of max) or "absolute" (level)
    mode: RampMode = RampMode.RESET
    duration: float = DURATION_PERMANENT  # seconds, -1 = permanent
    paused: bool = False
    progress: float = 0.0  # current position in percent of max_value
    start_progress: float = 0.0  # progress captured from the field at start
    elapsed: float = 0.0  # active seconds (paused time excluded)
    direction: int = 1  # +1 climbing toward 100, -1 decreasing toward 100
    reset_pending: bool = False  # RESET only: dwelling one step at 100%
    last_step_at: float = 0.0  # monotonic time of the last step
    last_seen: float = 0.0  # monotonic time of the last tick
    last_output: int = -1  # last value written to the store

    def increment(self) -> float:
        """Progress increment of one step, in percent of max_value."""
        if self.step_unit == "absolute" and self.max_value > 0:
            return self.step * 100 / self.max_value
        return self.step

    def advance(self) -> None:
        """Move the progress one step forward (mode dependent)."""
        inc = self.increment()
        if self.mode is RampMode.ASCEND:
            if self.direction == 0:
                return  # holding at 100%
            if self.direction > 0:
                self.progress = min(self.progress + inc, PROGRESS_MAX)
                if self.progress >= PROGRESS_MAX:
                    self.direction = 0
            else:
                self.progress = max(self.progress - inc, PROGRESS_MAX)
                if self.progress <= PROGRESS_MAX:
                    self.direction = 0
        elif self.mode is RampMode.WAVE:
            self.progress += inc * self.direction
            if self.progress >= PROGRESS_MAX:
                self.progress = PROGRESS_MAX
                self.direction = -1
            elif self.progress <= self.start_progress:
                self.progress = self.start_progress
                self.direction = 1
        else:  # RESET
            if self.reset_pending:
                self.progress = self.start_progress
                self.reset_pending = False
            else:
                self.progress += inc
                if self.progress >= PROGRESS_MAX:
                    self.progress = PROGRESS_MAX
                    self.reset_pending = True

    def output_value(self) -> int:
        """Field value for the current progress, clamped to 0-100."""
        return max(0, min(100, round(self.max_value * self.progress / 100)))

    def to_dict(self) -> Dict:
        return {
            "unit": self.unit.value,
            "field": self.field,
            "max_value": self.max_value,
            "timer": self.timer,
            "step": self.step,
            "step_unit": self.step_unit,
            "mode": self.mode.value,
            "duration": self.duration,
            "elapsed": round(self.elapsed, 1),
            "paused": self.paused,
            "progress": round(self.progress, 2),
            "value": self.output_value(),
        }


class RampManager:
    """Thread-safe registry of the active ramps, one per (unit, field)."""

    def __init__(self, store: Store) -> None:
        self._store = store
        self._ramps: Dict[Tuple[UnitDict, str], Ramp] = {}
        self._lock = threading.RLock()

    def start(
        self,
        unit: UnitDict,
        field: str,
        timer: float,
        step: float = 1,
        step_unit: str = "percent",
        mode: RampMode = RampMode.RESET,
        duration: float = DURATION_PERMANENT,
        max_value: Optional[Union[int, str]] = None,
        start_value: Optional[Union[int, str]] = None,
    ) -> Ramp:
        """
        Start a ramp on (unit, field), replacing any existing one.

        The ramp starts at the field's current level (or an explicit
        ``start_value``) and moves toward the max value.

        Args:
            unit: target unit
            field: one of RAMP_FIELDS
            timer: seconds between two steps (> 0)
            step: increment per step (> 0); percent of max_value when
                step_unit is "percent" (<= 100), absolute field level when
                step_unit is "absolute"
            step_unit: "percent" (default) or "absolute"
            mode: RESET (sawtooth), WAVE (triangle) or ASCEND (to max, hold)
            duration: total run time in seconds, DURATION_PERMANENT (-1,
                default) to run until stopped
            max_value: field level at 100% progress, defaults to the field's
                current level in the store; may be an int or a
                MagicNumber-style range string "[25-35]" resolved randomly
                once at start
            start_value: field level the ramp starts from (also the reset
                point of RESET/WAVE cycles), defaults to the field's current
                level; int or "[low-high]" range string resolved once at
                start

        Returns:
            The new Ramp.
        """
        if field not in RAMP_FIELDS:
            raise ValueError(
                f"Field '{field}' can't be ramped (one of {RAMP_FIELDS})"
            )
        if timer <= 0:
            raise ValueError(f"Timer must be > 0, got {timer}")
        if step_unit not in ("percent", "absolute"):
            raise ValueError(
                f"Step unit must be 'percent' or 'absolute', got {step_unit!r}"
            )
        if step <= 0:
            raise ValueError(f"Step must be > 0, got {step}")
        if step_unit == "percent" and step > PROGRESS_MAX:
            raise ValueError(f"Percent step must be <= {PROGRESS_MAX}, got {step}")
        step = float(step)
        if duration != DURATION_PERMANENT and duration <= 0:
            raise ValueError(
                f"Duration must be > 0 or {DURATION_PERMANENT} (permanent), "
                f"got {duration}"
            )

        current = int(self._store.get_unit_dict(unit).get(field, 0))
        if max_value is None:
            max_value = current
        max_value = self._resolve_max_value(max_value)
        if start_value is None:
            start_value = current
        start_value = self._resolve_max_value(start_value)
        raw_progress = start_value * 100 / max_value if max_value > 0 else 0.0

        mode = RampMode(mode)
        if mode is RampMode.ASCEND:
            # progress may exceed 100% when the target is below the start
            # level: the ramp then descends toward the max value
            start_progress = raw_progress
            progress = raw_progress
            direction = 1 if raw_progress < 100 else (-1 if raw_progress > 100 else 0)
            reset_pending = False
        else:
            start_progress = max(0, min(100, raw_progress))
            progress = start_progress
            direction = -1 if mode is RampMode.WAVE and start_progress >= 100 else 1
            reset_pending = mode is RampMode.RESET and start_progress >= 100

        now = time.monotonic()
        ramp = Ramp(
            unit=unit,
            field=field,
            max_value=max_value,
            timer=float(timer),
            step=step,
            step_unit=step_unit,
            mode=mode,
            duration=float(duration),
            progress=progress,
            start_progress=start_progress,
            direction=direction,
            reset_pending=reset_pending,
            last_step_at=now,
            last_seen=now,
        )
        with self._lock:
            self._ramps[(unit, field)] = ramp

        # the ramp takes ownership of the field: write the current value now
        self._write(ramp)
        logger.info(f"[Ramp] Started on {unit.value}.{field}", ramp=ramp.to_dict())
        ws_notifier.notify("ramps:update", ramp.to_dict())
        return ramp

    @staticmethod
    def _resolve_max_value(max_value: Union[int, str]) -> int:
        """
        Resolve an explicit max value: a plain int or a "[low-high]" range
        string (random int in range, resolved once per start).
        """
        if isinstance(max_value, str):
            if match := re.match(r"^\[(\d+)-(\d+)\]$", max_value.strip()):
                low, high = int(match.group(1)), int(match.group(2))
                max_value = random.randint(min(low, high), max(low, high))
            else:
                raise ValueError(
                    f"Max value must be an int or a range like '[25-35]', "
                    f"got '{max_value}'"
                )
        return max(0, min(100, int(max_value)))

    def pause(self, unit: UnitDict, field: str) -> None:
        """Freeze a ramp at its current value (see resume)."""
        with self._lock:
            ramp = self._get(unit, field)
            ramp.paused = True
            state = ramp.to_dict()
        logger.info(f"[Ramp] Paused on {unit.value}.{field}")
        ws_notifier.notify("ramps:update", state)

    def resume(self, unit: UnitDict, field: str) -> None:
        """Resume a paused ramp; the next step happens after a full timer."""
        with self._lock:
            ramp = self._get(unit, field)
            ramp.paused = False
            ramp.last_step_at = time.monotonic()
            state = ramp.to_dict()
        logger.info(f"[Ramp] Resumed on {unit.value}.{field}")
        ws_notifier.notify("ramps:update", state)

    def stop(self, unit: UnitDict, field: str, restore: bool = True) -> None:
        """
        Remove a ramp.

        Args:
            restore: True (default) puts the field back to the ramp's max
                value, False keeps the current ramped value.
        """
        with self._lock:
            ramp = self._ramps.pop((unit, field), None)
        if ramp is None:
            raise KeyError(f"No ramp on {unit.value}.{field}")
        if restore:
            ramp.progress = PROGRESS_MAX
            self._write(ramp)
        logger.info(f"[Ramp] Stopped on {unit.value}.{field}", restore=restore)
        ws_notifier.notify(
            "ramps:remove", {"unit": unit.value, "field": field}
        )

    def stop_unit(self, unit: UnitDict, restore: bool = True) -> None:
        """Stop every ramp of a unit."""
        with self._lock:
            fields = [field for ramp_unit, field in self._ramps if ramp_unit is unit]
        for field in fields:
            self.stop(unit, field, restore=restore)

    def get(self, unit: UnitDict, field: str) -> Optional[Dict]:
        """State of one ramp as a dict, None if no ramp on (unit, field)."""
        with self._lock:
            ramp = self._ramps.get((unit, field))
            return ramp.to_dict() if ramp else None

    def get_all(self) -> List[Dict]:
        """States of all active ramps as dicts."""
        with self._lock:
            return [ramp.to_dict() for ramp in self._ramps.values()]

    def tick(self, now: Optional[float] = None) -> None:
        """
        Advance every running ramp whose timer has elapsed, expire the ramps
        past their duration and push the changed values to the store.
        Called by thread_ramp every RAMP_TICK.
        """
        if now is None:
            now = time.monotonic()
        changed: List[Ramp] = []
        expired: List[Ramp] = []
        with self._lock:
            for ramp in self._ramps.values():
                since_last_tick = now - ramp.last_seen
                ramp.last_seen = now
                if ramp.paused:
                    continue
                ramp.elapsed += since_last_tick
                if (
                    ramp.duration != DURATION_PERMANENT
                    and ramp.elapsed >= ramp.duration
                ):
                    expired.append(ramp)
                    continue
                if now - ramp.last_step_at < ramp.timer:
                    continue
                ramp.last_step_at = now
                ramp.advance()
                if ramp.output_value() != ramp.last_output:
                    changed.append(ramp)
        for ramp in changed:
            self._write(ramp)
        for ramp in expired:
            logger.info(
                f"[Ramp] Duration reached on {ramp.unit.value}.{ramp.field}",
                duration=ramp.duration,
            )
            self.stop(ramp.unit, ramp.field)

    def _get(self, unit: UnitDict, field: str) -> Ramp:
        ramp = self._ramps.get((unit, field))
        if ramp is None:
            raise KeyError(f"No ramp on {unit.value}.{field}")
        return ramp

    def _write(self, ramp: Ramp) -> None:
        """Push the ramp's current output value to the store."""
        value = ramp.output_value()
        ramp.last_output = value
        self._store.update_unit_dict(ramp.unit, {ramp.field: value, "updated": True})


# singleton, wired in main.py
ramp_manager = RampManager(Store())


def thread_ramp() -> None:
    """Ramp thread loop: advance the ramps every RAMP_TICK seconds."""
    logger.info("[Ramp] Starting software ramp thread")
    while True:
        try:
            ramp_manager.tick()
            time.sleep(RAMP_TICK)
        except Exception:
            logger.exception("[Ramp] Error in ramp thread")
            time.sleep(5)
