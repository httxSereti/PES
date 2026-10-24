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
  run forever; when the active time reaches ``duration`` the ramp stops and
  applies its ``end_action``. Paused time doesn't count.

Seven modes (``RampMode``):

- ``RESET``  — sawtooth: climb start% -> 100%, dwell one step at 100%,
  reset to start% and start over.
- ``WAVE``   — triangle: climb start% -> 100% then decrease back to start%
  and start over.
- ``ASCEND`` — one-shot: climb (or descend) from start% to 100% and hold
  there; the "ramp to a target and keep it" case.
- ``SQUARE`` — on/off: hold start% one step, jump to 100%, hold one step,
  jump back; ``step`` is ignored.
- ``DRIFT``  — random walk: move by a random amount up to ``step`` in
  either direction, reflected inside start%..100%.
- ``SURGE``  — asymmetric wave: climb at ``step``, descend at
  ``step * release`` (``release`` > 1 is a slow build and a fast release).
- ``DWELL``  — wave with a configurable ``dwell`` (seconds) at 100% and
  back at start% before the next climb.

The max value is the field's current level captured when the ramp starts (or
an explicit ``max_value``, which may also be a MagicNumber-style range
string like ``[25-35]`` resolved randomly once at start). While a ramp is
active it owns the field: external writes to it are overwritten on the next
step. Pause freezes the ramp at its current value. When the ramp ends
(naturally or via ``stop``) it applies its configured end action:

- ``HOLD_PEAK`` (default) — restore the max value, matching the historical
  behaviour;
- ``HOLD_CURRENT`` — keep the level the ramp last wrote;
- ``RESTORE_START`` — return to the ramp's start level;
- ``SET_LEVEL`` — go to an explicit ``end_value``, capped at ``max_value``.

The explicit ``restore`` / ``end_action`` arguments of ``stop`` override the
ramp's configured action for internal clean-up paths (unit stop, profile
reverse, hardware reset).

Lifecycle changes are broadcast over WebSocket (``ramps:update`` on
start/pause/resume, ``ramps:remove`` on stop). Ramped field values are
broadcast as ``units:update`` from ``RampManager._write`` — the hardware
thread does it when the value reaches the 2B, but broadcasting at the source
keeps clients live when no unit is connected (or it is disabled).

``thread_ramp()`` must run in a daemon thread (wired in ``main.py``); ramps
are controlled through the ``ramp_manager`` singleton.
"""

import math
import random
import re
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Union

import structlog

from api.ws.websocket_notifier import ws_notifier
from store import Store
from typings import RampEndAction, RampMode, UnitDict

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
    dwell: float = 0.0  # DWELL: seconds held at 100% and at start
    release: float = 4.0  # SURGE: descent increment multiplier
    duration: float = DURATION_PERMANENT  # seconds, -1 = permanent
    paused: bool = False
    progress: float = 0.0  # current position in percent of max_value
    start_progress: float = 0.0  # progress captured from the field at start
    elapsed: float = 0.0  # active seconds (paused time excluded)
    direction: int = 1  # +1 toward 100, -1 toward start (SQUARE: +1 = at start)
    reset_pending: bool = False  # RESET only: dwelling one step at 100%
    dwell_steps: int = 0  # DWELL: extra steps held at each end
    hold_steps: int = 0  # DWELL: remaining extra hold steps at the current end
    last_step_at: float = 0.0  # monotonic time of the last step
    last_seen: float = 0.0  # monotonic time of the last tick
    last_output: int = -1  # last value written to the store
    owner: Optional[str] = None  # e.g. "profile:<queue item id>", None = user
    end_action: RampEndAction = RampEndAction.HOLD_PEAK
    end_value: int | None = None  # SET_LEVEL: target level, capped at max

    def increment(self) -> float:
        """Progress increment of one step, in percent of max_value."""
        if self.step_unit == "absolute" and self.max_value > 0:
            return self.step * 100 / self.max_value
        return self.step

    def start_level(self) -> int:
        """Field value of the start/reset point, clamped to 0-100."""
        return max(
            0, min(100, round(self.max_value * self.start_progress / 100))
        )

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
        elif self.mode is RampMode.SQUARE:
            # on/off: the field jumps between start and 100% each step
            if self.direction > 0:
                self.progress = PROGRESS_MAX
                self.direction = -1
            else:
                self.progress = self.start_progress
                self.direction = 1
        elif self.mode is RampMode.DRIFT:
            self._drift(inc)
        elif self.mode is RampMode.SURGE:
            if self.direction > 0:
                self.progress = min(self.progress + inc, PROGRESS_MAX)
                if self.progress >= PROGRESS_MAX:
                    self.direction = -1
            else:
                self.progress = max(
                    self.progress - inc * self.release, self.start_progress
                )
                if self.progress <= self.start_progress:
                    self.direction = 1
        elif self.mode is RampMode.DWELL:
            if self.hold_steps > 0:
                self.hold_steps -= 1
                return
            self.progress += inc * self.direction
            if self.progress >= PROGRESS_MAX:
                self.progress = PROGRESS_MAX
                self.direction = -1
                self.hold_steps = self.dwell_steps
            elif self.progress <= self.start_progress:
                self.progress = self.start_progress
                self.direction = 1
                self.hold_steps = self.dwell_steps
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

    def _drift(self, inc: float) -> None:
        """Random walk inside start%..100%, reflected at both bounds."""
        span = PROGRESS_MAX - self.start_progress
        if span <= 0:
            self.progress = PROGRESS_MAX
            return
        offset = self.progress - self.start_progress
        offset += random.uniform(-inc, inc)
        # Triangle-wave reflection keeps the walk inside the range even when
        # one random step is larger than the range itself.
        offset = abs(offset) % (2 * span)
        if offset > span:
            offset = 2 * span - offset
        self.progress = self.start_progress + offset

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
            "dwell": self.dwell,
            "release": self.release,
            "duration": self.duration,
            "elapsed": round(self.elapsed, 1),
            "paused": self.paused,
            "progress": round(self.progress, 2),
            "start_value": self.start_level(),
            "value": self.output_value(),
            "owner": self.owner,
            "end_action": self.end_action.value,
            "end_value": self.end_value,
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
        dwell: float = 0,
        release: float = 4,
        duration: float = DURATION_PERMANENT,
        max_value: Optional[Union[int, str]] = None,
        start_value: Optional[Union[int, str]] = None,
        end_action: RampEndAction = RampEndAction.HOLD_PEAK,
        end_value: int | None = None,
        owner: Optional[str] = None,
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
            mode: RESET (sawtooth), WAVE (triangle), ASCEND (to max, hold),
                SQUARE (on/off), DRIFT (random walk), SURGE (slow up, fast
                down) or DWELL (wave with holds at both ends)
            dwell: DWELL only, seconds to hold at 100% and at start (>= 0,
                default 0 = plain WAVE)
            release: SURGE only, descent speed multiplier (> 0, default 4;
                1 = plain WAVE)
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
            end_action: what to do when the ramp ends or is stopped
                (default HOLD_PEAK)
            end_value: required for SET_LEVEL; target level 0-100, capped at
                the resolved max_value when the ramp starts
            owner: optional owner tag (e.g. "profile:<queue item id>") so
                owners can stop only their own ramps (see stop_owned); None
                for user-started ramps

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
        dwell = float(dwell)
        if dwell < 0:
            raise ValueError(f"Dwell must be >= 0, got {dwell}")
        release = float(release)
        if release <= 0:
            raise ValueError(f"Release must be > 0, got {release}")
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
        try:
            end_action = RampEndAction(end_action)
        except ValueError as err:
            allowed = ", ".join(entry.value for entry in RampEndAction)
            raise ValueError(
                f"Ramp end action must be one of {allowed}, got {end_action!r}"
            ) from err
        if end_action is RampEndAction.SET_LEVEL:
            if (
                end_value is None
                or isinstance(end_value, bool)
                or not isinstance(end_value, (int, float))
                or not math.isfinite(end_value)
            ):
                raise ValueError(
                    "SET_LEVEL requires an end_value between 0 and the max value"
                )
            # Never let the post-ramp level exceed the configured ceiling.
            end_value = max(0, min(max_value, round(end_value)))
        else:
            end_value = None

        # Extra steps after the step that reaches an end: the total hold is
        # (dwell_steps + 1) * timer, i.e. `dwell` rounded up to the step grid
        # (and at least one step, like WAVE).
        dwell_steps = max(0, math.ceil(dwell / timer) - 1) if dwell > 0 else 0
        if mode is RampMode.ASCEND:
            # progress may exceed 100% when the target is below the start
            # level: the ramp then descends toward the max value
            start_progress = raw_progress
            progress = raw_progress
            direction = 1 if raw_progress < 100 else (-1 if raw_progress > 100 else 0)
            reset_pending = False
            hold_steps = 0
        else:
            start_progress = max(0, min(100, raw_progress))
            progress = start_progress
            direction = -1 if start_progress >= 100 else 1
            reset_pending = mode is RampMode.RESET and start_progress >= 100
            # DWELL that starts at the top pauses there before descending
            hold_steps = (
                dwell_steps
                if mode is RampMode.DWELL and start_progress >= 100
                else 0
            )

        now = time.monotonic()
        ramp = Ramp(
            unit=unit,
            field=field,
            max_value=max_value,
            timer=float(timer),
            step=step,
            step_unit=step_unit,
            mode=mode,
            dwell=dwell,
            release=release,
            duration=float(duration),
            progress=progress,
            start_progress=start_progress,
            direction=direction,
            reset_pending=reset_pending,
            dwell_steps=dwell_steps,
            hold_steps=hold_steps,
            last_step_at=now,
            last_seen=now,
            owner=owner,
            end_action=end_action,
            end_value=end_value,
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

    def stop(
        self,
        unit: UnitDict,
        field: str,
        restore: bool | None = None,
        end_action: RampEndAction | None = None,
    ) -> None:
        """
        Remove a ramp and apply an end action to its field.

        Args:
            restore: legacy override — True holds the ramp's max value, False
                keeps the current level. ``None`` (default) uses the ramp's
                configured ``end_action``.
            end_action: explicit action override; wins over ``restore``.
                Used by callers that need a specific clean-up behaviour.
        """
        with self._lock:
            ramp = self._ramps.pop((unit, field), None)
        if ramp is None:
            raise KeyError(f"No ramp on {unit.value}.{field}")

        action = end_action
        if action is None:
            if restore is True:
                action = RampEndAction.HOLD_PEAK
            elif restore is False:
                action = RampEndAction.HOLD_CURRENT
            else:
                action = ramp.end_action
        action = RampEndAction(action)

        level: int | None = None
        if action is RampEndAction.HOLD_PEAK:
            level = ramp.max_value
        elif action is RampEndAction.RESTORE_START:
            level = ramp.start_level()
        elif action is RampEndAction.SET_LEVEL:
            # end_value is validated/capped at start; clamp again so a
            # manually constructed Ramp can never exceed its ceiling.
            level = (
                min(ramp.max_value, max(0, ramp.end_value))
                if ramp.end_value is not None
                else 0
            )
        # HOLD_CURRENT: leave the store at the last ramped level.

        if level is not None:
            self._write_level(ramp, level)
        logger.info(
            f"[Ramp] Stopped on {unit.value}.{field}",
            end_action=action.value,
            level=level,
        )
        ws_notifier.notify(
            "ramps:remove", {"unit": unit.value, "field": field}
        )

    def stop_unit(self, unit: UnitDict, restore: bool = True) -> None:
        """Stop every ramp of a unit (peak by default, as a clean-up path)."""
        with self._lock:
            fields = [field for ramp_unit, field in self._ramps if ramp_unit is unit]
        self._stop_fields(unit, fields, restore)

    def stop_all(self, restore: bool = False) -> int:
        """
        Stop every ramp of every unit; returns the number of ramps stopped.

        The neutralize path calls this with ``restore=False`` so no ramp
        writes its peak back after the channels have been zeroed.
        """
        with self._lock:
            targets = list(self._ramps.keys())
        for unit, field in targets:
            try:
                self.stop(unit, field, restore=restore)
            except KeyError:
                # The ramp expired between the snapshot and this stop.
                continue
        return len(targets)

    def stop_owned(
        self, unit: UnitDict, owner: str, restore: bool = False
    ) -> None:
        """Stop only the ramps of a unit started by `owner`."""
        with self._lock:
            fields = [
                field
                for (ramp_unit, field), ramp in self._ramps.items()
                if ramp_unit is unit and ramp.owner == owner
            ]
        self._stop_fields(unit, fields, restore)

    def _stop_fields(self, unit: UnitDict, fields: List[str], restore: bool) -> None:
        """Stop the given fields, skipping ramps that already expired."""
        for field in fields:
            try:
                self.stop(unit, field, restore=restore)
            except KeyError:
                continue

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
        """
        Push the ramp's current output value to the store and broadcast it.

        The hardware thread forwards store changes to clients once the value
        reached the 2B; broadcasting here as well keeps clients live when no
        unit is connected (or its hardware is disabled).
        """
        # tick() collects changed ramps under the lock and writes them after
        # releasing it; skip ramps stopped in between (unit stop,
        # neutralize) so a stale write cannot undo the clean-up.
        with self._lock:
            if self._ramps.get((ramp.unit, ramp.field)) is not ramp:
                return
            self._write_level(ramp, ramp.output_value())

    def _write_level(self, ramp: Ramp, level: int) -> None:
        """Write an explicit field level (used by ramp end actions)."""
        value = max(0, min(100, int(level)))
        ramp.last_output = value
        self._store.update_unit_dict(ramp.unit, {ramp.field: value, "updated": True})
        ws_notifier.notify(
            "units:update",
            {"id": ramp.unit.value, "changes": {ramp.field: value}},
        )


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
