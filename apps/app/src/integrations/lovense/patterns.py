"""
Lovense profiles (patterns): validation, interpolation and playback.

A pattern is a set of tracks. Each track matches devices (ids, tags, nodes or
all), targets one output (Vibrate by default) and one feature (index or all),
and carries keyframes with a value in 0..1 and an easing.

The runner samples the tracks on the API event loop, applies the global and
per-device intensity caps, quantizes to the device step range and only sends a
command when the step actually changes. Ownership is managed by the hub so a
pattern never fights a manual control or another pattern on the same feature.
"""

from __future__ import annotations

import asyncio
import contextlib
import math
import random
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from .hub import LovenseHub

logger = structlog.get_logger("pes")

OUTPUT_TYPES = {
    "vibrate": "Vibrate",
    "rotate": "Rotate",
    "oscillate": "Oscillate",
    "constrict": "Constrict",
    "spray": "Spray",
    "temperature": "Temperature",
    "led": "Led",
    "position": "Position",
    "hwpositionwithduration": "HwPositionWithDuration",
}

EASINGS = {"linear", "step", "ease-in", "ease-out", "ease-in-out", "sine"}

MAX_TRACKS = 64
MAX_KEYFRAMES = 512
MAX_DURATION_MS = 60 * 60 * 1000


class PatternError(ValueError):
    """Invalid pattern definition."""


@dataclass
class Keyframe:
    at_ms: int
    value: float
    easing: str = "linear"

    def to_dict(self) -> dict[str, Any]:
        return {"at_ms": self.at_ms, "value": round(self.value, 4), "easing": self.easing}


@dataclass
class Track:
    id: str
    output: str
    feature_index: int | str
    match: dict[str, Any]
    keyframes: list[Keyframe]

    @property
    def duration_ms(self) -> int:
        return self.keyframes[-1].at_ms if self.keyframes else 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "output": self.output,
            "feature_index": self.feature_index,
            "match": self.match,
            "keyframes": [kf.to_dict() for kf in self.keyframes],
        }


@dataclass
class Pattern:
    name: str
    tracks: list[Track]
    description: str = ""
    version: int = 1
    loop: bool = False
    bpm: int | None = None
    max_intensity_pct: int = 100
    fade_in_ms: int = 0
    fade_out_ms: int = 0
    jitter_pct: int = 0
    tags: list[str] = field(default_factory=list)

    @property
    def duration_ms(self) -> int:
        return max((track.duration_ms for track in self.tracks), default=0)

    def to_definition(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "name": self.name,
            "description": self.description,
            "loop": self.loop,
            "bpm": self.bpm,
            "max_intensity_pct": self.max_intensity_pct,
            "fade_in_ms": self.fade_in_ms,
            "fade_out_ms": self.fade_out_ms,
            "jitter_pct": self.jitter_pct,
            "tags": list(self.tags),
            "tracks": [track.to_dict() for track in self.tracks],
        }


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_output(value: Any) -> str:
    key = str(value or "vibrate").strip().lower().replace("_", "").replace("-", "")
    output = OUTPUT_TYPES.get(key)
    if output is None:
        raise PatternError(f"Unknown output type: {value!r}")
    return output


def parse_pattern(raw: dict[str, Any]) -> Pattern:
    """Validate and normalize a pattern definition."""
    if not isinstance(raw, dict):
        raise PatternError("Pattern definition must be an object")

    name = str(raw.get("name") or "").strip()
    if not name:
        raise PatternError("Pattern name is required")
    if len(name) > 80:
        raise PatternError("Pattern name is too long (80 max)")

    tracks_raw = raw.get("tracks")
    if not isinstance(tracks_raw, list) or not tracks_raw:
        raise PatternError("A pattern needs at least one track")
    if len(tracks_raw) > MAX_TRACKS:
        raise PatternError(f"A pattern can have at most {MAX_TRACKS} tracks")

    tracks: list[Track] = []
    for index, track_raw in enumerate(tracks_raw):
        if not isinstance(track_raw, dict):
            raise PatternError(f"Track {index} must be an object")

        keyframes_raw = track_raw.get("keyframes")
        if not isinstance(keyframes_raw, list) or not keyframes_raw:
            raise PatternError(f"Track {index} needs at least one keyframe")
        if len(keyframes_raw) > MAX_KEYFRAMES:
            raise PatternError(
                f"Track {index} can have at most {MAX_KEYFRAMES} keyframes"
            )

        keyframes: list[Keyframe] = []
        previous_at = -1
        for kf_raw in keyframes_raw:
            if not isinstance(kf_raw, dict):
                raise PatternError(f"Track {index} has an invalid keyframe")
            at_ms = _as_int(kf_raw.get("at_ms"), -1)
            if at_ms < 0 or at_ms > MAX_DURATION_MS:
                raise PatternError(
                    f"Track {index} keyframe time must be 0..{MAX_DURATION_MS} ms"
                )
            if at_ms < previous_at:
                raise PatternError(
                    f"Track {index} keyframes must be sorted by at_ms"
                )
            previous_at = at_ms
            value = _as_float(kf_raw.get("value"), -1)
            if value < 0 or value > 1:
                raise PatternError(
                    f"Track {index} keyframe value must be between 0 and 1"
                )
            easing = str(kf_raw.get("easing") or "linear").strip().lower()
            if easing not in EASINGS:
                raise PatternError(f"Track {index} has unknown easing: {easing!r}")
            keyframes.append(Keyframe(at_ms=at_ms, value=value, easing=easing))

        match = track_raw.get("match")
        if not isinstance(match, dict):
            match = {}
        match = {
            "device_ids": [str(v) for v in match.get("device_ids") or [] if v],
            "tags": [str(v) for v in match.get("tags") or [] if v],
            "node_ids": [str(v) for v in match.get("node_ids") or [] if v],
            "all": bool(match.get("all", False)),
        }

        feature_raw = track_raw.get("feature_index", "all")
        if isinstance(feature_raw, str) and feature_raw.strip().lower() == "all":
            feature_index: int | str = "all"
        else:
            feature_index = _as_int(feature_raw, 0)
            if feature_index < 0:
                raise PatternError(
                    f"Track {index} feature_index must be >= 0 or 'all'"
                )

        tracks.append(
            Track(
                id=str(track_raw.get("id") or f"t{index + 1}"),
                output=normalize_output(track_raw.get("output")),
                feature_index=feature_index,
                match=match,
                keyframes=keyframes,
            )
        )

    bpm_raw = raw.get("bpm")
    bpm: int | None = None
    if bpm_raw not in (None, "", 0):
        bpm = _as_int(bpm_raw, 0)
        if bpm < 20 or bpm > 300:
            raise PatternError("bpm must be between 20 and 300")

    max_intensity = _as_int(raw.get("max_intensity_pct"), 100)
    max_intensity = max(0, min(100, max_intensity))

    tags = [str(tag) for tag in raw.get("tags") or [] if str(tag).strip()][:20]

    return Pattern(
        name=name,
        tracks=tracks,
        description=str(raw.get("description") or "")[:500],
        version=_as_int(raw.get("version"), 1) or 1,
        loop=bool(raw.get("loop", False)),
        bpm=bpm,
        max_intensity_pct=max_intensity,
        fade_in_ms=max(0, min(10000, _as_int(raw.get("fade_in_ms"), 0))),
        fade_out_ms=max(0, min(10000, _as_int(raw.get("fade_out_ms"), 0))),
        jitter_pct=max(0, min(50, _as_int(raw.get("jitter_pct"), 0))),
        tags=tags,
    )


def _ease(t: float, kind: str) -> float:
    t = max(0.0, min(1.0, t))
    if kind == "step":
        return 0.0 if t < 1.0 else 1.0
    if kind == "ease-in":
        return t * t
    if kind == "ease-out":
        return 1.0 - (1.0 - t) ** 2
    if kind == "ease-in-out":
        return 3.0 * t * t - 2.0 * t * t * t
    if kind == "sine":
        return 0.5 - 0.5 * math.cos(math.pi * t)
    return t


def interpolate(keyframes: list[Keyframe], t_ms: float) -> float:
    """Value of a track at `t_ms` (0..1)."""
    if not keyframes:
        return 0.0
    if t_ms <= keyframes[0].at_ms:
        return keyframes[0].value
    if t_ms >= keyframes[-1].at_ms:
        return keyframes[-1].value

    for index in range(len(keyframes) - 1):
        start = keyframes[index]
        end = keyframes[index + 1]
        if start.at_ms <= t_ms < end.at_ms:
            span = end.at_ms - start.at_ms
            local = 0.0 if span <= 0 else (t_ms - start.at_ms) / span
            eased = _ease(local, start.easing)
            return start.value + (end.value - start.value) * eased
    return keyframes[-1].value


def _supports_output(feature: dict[str, Any], output: str) -> bool:
    outputs = feature.get("outputs") or {}
    if not isinstance(outputs, dict):
        return False
    return output in outputs


def resolve_tracks(
    pattern: Pattern, devices: list[dict[str, Any]]
) -> list[tuple[Track, dict[str, Any], int, int]]:
    """
    Expand a pattern into concrete (track, device, feature_index, step_max)
    tuples. Devices are the hub's serialized device states.
    """
    resolved: list[tuple[Track, dict[str, Any], int, int]] = []
    for track in pattern.tracks:
        for device in devices:
            if not _matches(track.match, device):
                continue
            for feature in device.get("features") or []:
                if not isinstance(feature, dict):
                    continue
                if not _supports_output(feature, track.output):
                    continue
                feature_index = _as_int(feature.get("index"), 0)
                if track.feature_index != "all" and feature_index != track.feature_index:
                    continue
                outputs = feature.get("outputs") or {}
                value_range = outputs.get(track.output)
                step_max = 1
                if isinstance(value_range, dict):
                    step_max = max(1, _as_int(value_range.get("max"), 1))
                elif isinstance(value_range, list) and value_range:
                    step_max = max(1, _as_int(value_range[-1], 1))
                resolved.append((track, device, feature_index, step_max))
    return resolved


def _matches(match: dict[str, Any], device: dict[str, Any]) -> bool:
    device_ids = match.get("device_ids") or []
    tags = match.get("tags") or []
    node_ids = match.get("node_ids") or []
    if not (device_ids or tags or node_ids or match.get("all")):
        return True
    if match.get("all"):
        return True
    if device_ids and device.get("id") in device_ids:
        return True
    if node_ids and device.get("node_id") in node_ids:
        return True
    device_tags = set(device.get("tags") or [])
    if tags and device_tags.intersection(tags):
        return True
    return False


@dataclass
class PatternRun:
    id: str
    pattern: Pattern
    pattern_id: str | None
    targets: dict[str, Any]
    options: dict[str, Any]
    origin: str
    created_by: str
    queue_item_id: str | None = None
    status: str = "running"
    elapsed_s: float = 0.0
    loops: int = 0
    error: str | None = None
    finished: bool = False
    task: asyncio.Task | None = None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)
    snapshot: dict[tuple[str, int, str], int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "pattern_id": self.pattern_id,
            "pattern_name": self.pattern.name,
            "status": self.status,
            "targets": self.targets,
            "options": self.options,
            "origin": self.origin,
            "created_by": self.created_by,
            "queue_item_id": self.queue_item_id,
            "elapsed_s": round(self.elapsed_s, 1),
            "loops": self.loops,
            "error": self.error,
        }


class PatternRunner:
    """Play one pattern run through the hub."""

    def __init__(self, hub: LovenseHub, run: PatternRun):
        self._hub = hub
        self._run = run
        self._owner = f"pattern:{run.id}"
        self._program: list[tuple[str, int, str, Track, int]] = []
        self._last_step: dict[tuple[str, int, str], int] = {}
        self._snapshot: dict[tuple[str, int, str], int] = {}
        self._released = False
        self._restore_on_finish = False
        self._scale = max(0, min(150, _as_int(run.options.get("scale_pct"), 100)))
        self._duration_s = _as_float(run.options.get("duration"), -1)
        self._loop = bool(run.options.get("loop", run.pattern.loop))
        self._loop_count = max(0, _as_int(run.options.get("loop_count"), 0))
        self._sync_offset_ms = _as_int(run.options.get("sync_offset_ms"), 0)
        self._replace = bool(run.options.get("replace", False))

    @property
    def run(self) -> PatternRun:
        return self._run

    async def start(self) -> dict[str, Any]:
        self._build_program()
        if not self._program:
            raise PatternError("This pattern does not match any connected device")

        for key in self._program:
            device_id, feature_index, output, _track, _step_max = key
            owner_key = (device_id, feature_index, output)
            current = self._hub.get_output_value(*owner_key)
            if current is not None:
                self._snapshot[owner_key] = current
            acquired = self._hub.acquire_output(
                owner_key, self._owner, priority=10, force=self._replace
            )
            if not acquired:
                logger.info(
                    "[Lovense] Output already owned, pattern skips it",
                    device_id=device_id,
                    feature_index=feature_index,
                    output=output,
                )
        self._program = [
            item
            for item in self._program
            if self._hub.owns_output(
                (item[0], item[1], item[2]), self._owner
            )
        ]
        if not self._program:
            raise PatternError("Every targeted output is already in use")

        self._run.task = asyncio.create_task(
            self._loop_run(), name=f"lovense-pattern:{self._run.id}"
        )
        return self._run.to_dict()

    @property
    def _program_keys(self) -> list[tuple[str, int, str]]:
        return [(device_id, feature, output) for device_id, feature, output, _t, _s in self._program]

    def _build_program(self) -> None:
        devices = self._hub.resolve_devices(self._run.targets)
        resolved = resolve_tracks(self._run.pattern, devices)
        self._program = [
            (str(device["id"]), feature_index, track.output, track, step_max)
            for track, device, feature_index, step_max in resolved
        ]

    async def stop(self, reason: str = "stopped", restore: bool = False) -> None:
        self.request_stop(restore)
        task = self._run.task
        if task is not None and not task.done():
            try:
                await asyncio.wait_for(task, timeout=2.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                task.cancel()
                with contextlib.suppress(Exception):
                    await task
        await self._release_all(restore=restore)
        if self._run.status == "running":
            self._run.status = "stopped"
        logger.info(
            "[Lovense] Pattern stopped",
            run_id=self._run.id,
            pattern=self._run.pattern.name,
            reason=reason,
        )

    def request_stop(self, restore: bool = False) -> None:
        """Signal the run to stop without waiting (used by stop_all first)."""
        self._run.stop_event.set()
        self._restore_on_finish = restore

    async def _release_all(self, restore: bool, zero_first: bool = True) -> None:
        if self._released:
            return
        self._released = True
        for device_id, feature_index, output, _track, _step in self._program:
            key = (device_id, feature_index, output)
            if zero_first and self._hub.owns_output(key, self._owner):
                await self._hub.write_output(
                    device_id, feature_index, output, 0.0, owner=self._owner
                )
            if restore and self._snapshot.get(key) is not None:
                await self._hub.write_output(
                    device_id,
                    feature_index,
                    output,
                    float(self._snapshot[key]),
                    owner=self._owner,
                )
            self._hub.release_output(key, self._owner)

    async def _loop_run(self) -> None:
        started = time.monotonic()
        pattern = self._run.pattern
        raw_end = pattern.duration_ms
        constant = raw_end <= 0
        if pattern.bpm and not constant:
            beat_ms = 60000.0 / pattern.bpm
            natural_end = max(1.0, round(raw_end / beat_ms) * beat_ms)
        else:
            natural_end = float(max(1, raw_end))
        max_seconds = max(
            1.0, self._hub.pattern_max_minutes * 60.0
        )
        if self._duration_s == -1:
            deadline = None
        else:
            deadline = max(0.1, self._duration_s)
        tick = 1.0 / max(1, min(30, self._hub.pattern_tick_hz))

        try:
            while not self._run.stop_event.is_set():
                now = time.monotonic()
                elapsed = now - started
                local_ms = (elapsed * 1000.0) + self._sync_offset_ms
                self._run.elapsed_s = elapsed

                if deadline is not None and elapsed >= deadline:
                    break
                if elapsed >= max_seconds:
                    logger.warning(
                        "[Lovense] Pattern maximum duration reached",
                        run_id=self._run.id,
                    )
                    break

                if self._loop and not constant:
                    cycle_ms = local_ms % natural_end
                    if local_ms >= natural_end:
                        loops = int(local_ms // natural_end)
                        if loops != self._run.loops:
                            self._run.loops = loops
                        if self._loop_count and loops >= self._loop_count:
                            break
                else:
                    cycle_ms = local_ms
                    if not constant and cycle_ms >= natural_end:
                        break

                # Fade in/out scaling (0..1)
                fade = 1.0
                if pattern.fade_in_ms and elapsed * 1000.0 < pattern.fade_in_ms:
                    fade = (elapsed * 1000.0) / pattern.fade_in_ms
                if deadline is not None and pattern.fade_out_ms:
                    remaining = deadline - elapsed
                    if remaining * 1000.0 < pattern.fade_out_ms:
                        fade = min(fade, max(0.0, remaining * 1000.0 / pattern.fade_out_ms))

                pending = []
                for device_id, feature_index, output, track, step_max in self._program:
                    if self._run.stop_event.is_set():
                        break
                    value = interpolate(track.keyframes, cycle_ms)
                    if pattern.jitter_pct:
                        value *= 1.0 + random.uniform(
                            -pattern.jitter_pct, pattern.jitter_pct
                        ) / 100.0
                        value = max(0.0, min(1.0, value))
                    value_pct = self._apply_caps(
                        device_id, output, value * 100.0 * fade
                    )
                    if value_pct is None:
                        continue
                    step = int(round(value_pct / 100.0 * step_max))
                    key = (device_id, feature_index, output)
                    if self._last_step.get(key) == step:
                        continue
                    if not self._hub.owns_output(key, self._owner):
                        continue
                    pending.append(
                        (
                            key,
                            step,
                            self._hub.write_output(
                                device_id,
                                feature_index,
                                output,
                                value_pct,
                                owner=self._owner,
                            ),
                        )
                    )

                if pending:
                    results = await asyncio.gather(
                        *(item[2] for item in pending),
                        return_exceptions=True,
                    )
                    for (key, step, _), result in zip(pending, results):
                        if result is True:
                            self._last_step[key] = step
                    pending.clear()

                await asyncio.sleep(tick)

            # Natural end: let the last value stand only for a short fade-out
            # when the pattern asks for it, otherwise stop everything.
            if pattern.fade_out_ms and not self._run.stop_event.is_set():
                await self._fade_out(pattern.fade_out_ms)
            if self._run.status == "running":
                self._run.status = (
                    "stopped" if self._run.stop_event.is_set() else "completed"
                )
            logger.info(
                "[Lovense] Pattern finished",
                run_id=self._run.id,
                pattern=pattern.name,
                status=self._run.status,
                loops=self._run.loops,
                elapsed=round(self._run.elapsed_s, 1),
            )
        except asyncio.CancelledError:
            self._run.status = "stopped"
            raise
        except Exception as err:
            self._run.status = "failed"
            self._run.error = str(err)
            logger.exception(
                "[Lovense] Pattern failed", run_id=self._run.id, pattern=pattern.name
            )
        finally:
            await self._release_all(restore=self._restore_on_finish)
            await self._hub.finish_run(self._run)

    def _apply_caps(
        self, device_id: str, output: str, value_pct: float
    ) -> float | None:
        device = self._hub.get_device(device_id)
        if device is None:
            return None
        device_cap = max(0, min(100, _as_int(device.get("max_intensity_pct"), 100)))
        global_cap = self._hub.global_max_intensity_pct
        pattern_cap = max(0, min(100, self._run.pattern.max_intensity_pct))
        cap = min(device_cap, global_cap, pattern_cap)
        scaled = value_pct * self._scale / 100.0
        applied = max(0.0, min(float(cap), scaled))
        if applied + 0.5 < scaled:
            self._hub.note_limited(device_id, output, scaled, applied, cap)
        return applied

    async def _fade_out(self, fade_ms: int) -> None:
        steps = max(1, min(20, int(fade_ms / 100)))
        interval = (fade_ms / 1000.0) / steps
        for index in range(steps - 1, -1, -1):
            factor = index / steps
            for device_id, feature_index, output, _track, step_max in self._program:
                key = (device_id, feature_index, output)
                current = self._hub.get_output_value(*key) or 0
                value = current * factor
                if self._hub.owns_output(key, self._owner):
                    await self._hub.write_output(
                        device_id, feature_index, output, value, owner=self._owner
                    )
            await asyncio.sleep(interval)
