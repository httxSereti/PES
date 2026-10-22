"""
Saved EStim profiles: JSON documents the event executor can apply
(``ActionType.PROFILE``) and users can create from the UI.

A profile maps each unit to its settings plus an optional per-field ``ramps``
block; see ``apps/app/profile/MODELE.json`` for the reference format.

Two kinds of profiles share the catalog:

- **legacy**: single-letter ids (A-K, Z) bound by the Chaster WOF codes
  (``{p:JfA}``). They live at the root of ``DIR_PROFILE``.
- **custom**: any other name, created from the UI. New ones are stored under
  ``DIR_PROFILE/custom/``; custom files from the older flat layout are still
  read and edited in place.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import tempfile
from datetime import UTC, datetime
from functools import lru_cache

import structlog

from events.enums import ActionType, QueueItemStatus
from events.queue import ActionQueue
from hardware.ramp import RAMP_FIELDS, ramp_manager
from store import Store
from typings import RampEndAction, RampMode, UnitDict
from utils import to_utc_iso

logger = structlog.get_logger("pes")

# Profile files live next to the app (CWD = apps/app); config.env overrides.
PROFILE_DIR = pathlib.Path(os.getenv("DIR_PROFILE", "profile"))

# Shared hardware configuration files (same source as hardware/units.py)
CONFIG_DIR = pathlib.Path("configurations")

# Custom (user-created) profiles live in a subfolder of the profile directory.
CUSTOM_DIR_NAME = "custom"
CUSTOM_PROFILE_DIR = PROFILE_DIR / CUSTOM_DIR_NAME

# Profile name == file stem. Slugs keep the trigger-rule text field readable
# and prevent path traversal.
PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")

# Unit keys a profile may target (hand-edited files can contain anything)
_VALID_UNIT_NAMES = frozenset(unit.value for unit in UnitDict)

# Template/example files that are not applicable profiles
_HIDDEN_STEMS = {"MODELE"}

# Unit fields persisted in a profile (the applied subset lives in the executor)
PROFILE_UNIT_FIELDS = (
    "ch_A",
    "ch_B",
    "ch_A_use",
    "ch_B_use",
    "adj_1",
    "adj_2",
    "adj_3",
    "adj_4",
    "ch_link",
    "level_d",
    "level_h",
    "level_map",
    "power_bias",
    "mode",
)


class ProfileError(Exception):
    """Invalid profile operation (bad name, missing file, ...)."""


def _is_legacy_name(name: str) -> bool:
    """Legacy ids are single letters: the Chaster WOF codes bind that shape."""
    return len(name) == 1 and name.isalpha()


def profile_path(name: str) -> pathlib.Path:
    """
    File backing a profile.

    Legacy ids always live at the root. Custom profiles are stored under
    ``custom/``; pre-existing custom files from the flat layout are still
    resolved (and edited) at the root so nothing moves on its own.
    """
    if not PROFILE_NAME_RE.match(name):
        raise ProfileError(
            "Profile name must be 1-32 characters: letters, digits, '-' or '_'"
        )
    if _is_legacy_name(name):
        return PROFILE_DIR / f"{name}.json"

    custom_path = CUSTOM_PROFILE_DIR / f"{name}.json"
    if custom_path.is_file():
        return custom_path
    root_path = PROFILE_DIR / f"{name}.json"
    if root_path.is_file():
        return root_path
    return custom_path


def profile_exists(name: str) -> bool:
    return profile_path(name).is_file()


def load_profile(name: str) -> dict:
    """Read a profile document; raises ProfileError when missing/invalid."""
    path = profile_path(name)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            document = json.load(handle)
    except FileNotFoundError:
        raise ProfileError(f"Profile '{name}' not found")
    except (json.JSONDecodeError, OSError) as err:
        raise ProfileError(f"Can't read profile '{name}': {err}")

    if not isinstance(document, dict):
        raise ProfileError(f"Profile '{name}' is not a JSON object")
    return document


# MagicNumber-style range in a ramp config, resolved to its midpoint for previews
_RAMP_RANGE_RE = re.compile(r"^\[(\d+)-(\d+)\]$")


def _explicit_level(value: object) -> int | None:
    """
    Resolve an explicit ramp level: an int/float or a MagicNumber-style
    "[low-high]" range (midpoint). Returns None for invalid values — the
    executor skips the whole ramp in that case.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    if isinstance(value, str):
        match = _RAMP_RANGE_RE.match(value.strip())
        if not match:
            return None
        low, high = sorted((int(match.group(1)), int(match.group(2))))
        value = (low + high) // 2
    return max(0, min(100, int(value)))


def _preview_ramps(units: dict) -> list[dict]:
    """
    Resolved per-ramp preview of a profile's ``threads_settings``.

    Mirrors the action executor (``_apply_profile`` → ``RampManager.start``):
    invalid entries it would skip are omitted here too. ``step`` is normalized
    to percent of the max value; ``start`` / ``max`` default to the level the
    profile just applied to the field.
    """
    if not isinstance(units, dict):
        return []

    ramps: list[dict] = []
    for unit_name in sorted(units):
        unit_profile = units[unit_name]
        if not isinstance(unit_profile, dict):
            continue
        unit_ramps = unit_profile.get("ramps") or {}
        if not isinstance(unit_ramps, dict):
            continue

        for field in RAMP_FIELDS:
            cfg = unit_ramps.get(field)
            if not isinstance(cfg, dict):
                continue

            try:
                timer = cfg["timer"]
                step = float(cfg.get("step", 1))
                duration = cfg.get("duration", -1)
                mode = RampMode(cfg.get("mode", "reset"))
                end_action = RampEndAction(
                    cfg.get("end_action", "hold_peak")
                )
            except (KeyError, TypeError, ValueError):
                continue

            step_unit = cfg.get("step_unit", "percent")
            dwell = cfg.get("dwell", 0)
            release = cfg.get("release", 4)
            if (
                not isinstance(timer, (int, float))
                or isinstance(timer, bool)
                or not isinstance(duration, (int, float))
                or isinstance(duration, bool)
                or not isinstance(dwell, (int, float))
                or isinstance(dwell, bool)
                or not isinstance(release, (int, float))
                or isinstance(release, bool)
                or step_unit not in ("percent", "absolute")
                or timer <= 0
                or step <= 0
                or (step_unit == "percent" and step > 100)
                or (duration != -1 and duration <= 0)
                or dwell < 0
                or release <= 0
            ):
                continue

            field_level = _explicit_level(unit_profile.get(field)) or 0
            max_level = (
                _explicit_level(cfg["max"]) if "max" in cfg else field_level
            )
            start_level = (
                _explicit_level(cfg["start"]) if "start" in cfg else field_level
            )
            if max_level is None or start_level is None:
                continue

            end_value: int | None = None
            if end_action is RampEndAction.SET_LEVEL:
                end_value = _coerce_int(cfg.get("end_value"))
                if end_value is None or not 0 <= end_value <= 100:
                    continue
                # Mirror RampManager.start: never preview an end above the peak.
                end_value = min(end_value, max_level)

            if step_unit == "absolute" and max_level > 0:
                step = step * 100 / max_level

            ramps.append(
                {
                    "unit": unit_name,
                    "field": field,
                    "mode": mode.value,
                    "timer": float(timer),
                    "step": round(step, 2),
                    "dwell": float(dwell),
                    "release": float(release),
                    "duration": float(duration),
                    "start": start_level,
                    "max": max_level,
                    "end_action": end_action.value,
                    "end_value": end_value,
                }
            )

    return ramps


# ─────────────────────── Editing (validation / defaults) ────────────────────
#
# The UI editor sends a full `threads_settings` replacement; everything is
# validated here against the same constraints the action executor enforces,
# so a saved profile never contains values an apply would silently skip.

# Known unit-block fields and their accepted integer ranges (2B firmware)
_UNIT_INT_RANGES: dict[str, tuple[int, int]] = {
    "ch_A": (0, 100),
    "ch_B": (0, 100),
    "adj_1": (0, 100),
    "adj_2": (0, 100),
    "adj_3": (0, 3),  # ramp speed R0-R3 (x1..x4)
    "adj_4": (0, 5),  # warp factor W0-W5 (x1..x32)
    "power_bias": (0, 3),  # Q0-Q3 (A, B, avg, max)
    "level_map": (0, 2),  # O0-O2 (map A/B/C)
    "mode": (0, 16),  # MODE_2B index
}

_UNIT_BOOL_FIELDS = ("ch_link", "level_d", "level_h")
_UNIT_USAGE_FIELDS = ("ch_A_use", "ch_B_use")


@lru_cache(maxsize=4)
def _read_config(filename: str) -> dict:
    """Read a `configurations/*.json` file (empty dict when unavailable)."""
    try:
        with open(CONFIG_DIR / filename, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as err:
        logger.warning(f"[Profiles] Can't read configuration '{filename}': {err}")
        return {}
    return data if isinstance(data, dict) else {}


def _usage_limits() -> dict[str, dict]:
    """Usage levels limits ({start, warn, max} per usage name)."""
    return _read_config("usage_limit.json")


def _unit_defaults() -> dict[str, dict]:
    """
    Fallback unit block for units absent from a profile, built from the same
    initial settings the hardware threads use (``init_settings.json`` +
    ``default_usage.json``).
    """
    init_settings = _read_config("init_settings.json")
    default_usage = _read_config("default_usage.json")

    blocks: dict[str, dict] = {}
    for unit_name in sorted(_VALID_UNIT_NAMES):
        init = init_settings.get(unit_name)
        init = init if isinstance(init, dict) else {}
        usage = default_usage.get(unit_name)
        usage = usage if isinstance(usage, dict) else {}
        blocks[unit_name] = {
            "ch_A": 0,
            "ch_B": 0,
            "ch_A_use": str(usage.get("A", "default")),
            "ch_B_use": str(usage.get("B", "default")),
            "adj_1": _coerce_int(init.get("adj_1", 50)) or 0,
            "adj_2": _coerce_int(init.get("adj_2", 50)) or 0,
            "adj_3": 0,
            "adj_4": 0,
            "ch_link": False,
            "level_d": False,
            "level_h": bool(init.get("level_h", False)),
            "level_map": 0,
            "power_bias": 0,
            "mode": _coerce_int(init.get("mode", 0)) or 0,
        }
    return blocks


def _coerce_int(value: object) -> int | None:
    """Rounded int for JSON numbers; None for anything else (bool excluded)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return round(value)


def _validate_level_value(value: object, path: str) -> int | str:
    """A 0-100 level, or a MagicNumber-style range like `[25-35]`."""
    if isinstance(value, str):
        match = _RAMP_RANGE_RE.match(value.strip())
        if not match:
            raise ProfileError(
                f"{path} must be a number 0-100 or a range like [25-35]"
            )
        low, high = int(match.group(1)), int(match.group(2))
        if not (0 <= low <= 100 and 0 <= high <= 100):
            raise ProfileError(f"{path} range must stay between 0 and 100")
        return f"[{low}-{high}]"

    number = _coerce_int(value)
    if number is None or not 0 <= number <= 100:
        raise ProfileError(f"{path} must be a number 0-100 or a range like [25-35]")
    return number


def _validate_ramps(unit_name: str, ramps: dict) -> dict:
    """Validated per-field ramp block (mirrors hardware/ramp.py semantics)."""
    cleaned: dict[str, dict] = {}
    for field, cfg in ramps.items():
        path = f"{unit_name}.ramps.{field}"
        if field not in RAMP_FIELDS:
            raise ProfileError(
                f"{path} is not rampable (use ch_A, ch_B, adj_1 or adj_2)"
            )
        if not isinstance(cfg, dict):
            raise ProfileError(f"{path} must be a JSON object")
        config = dict(cfg)

        timer = cfg.get("timer")
        if (
            isinstance(timer, bool)
            or not isinstance(timer, (int, float))
            or timer <= 0
        ):
            raise ProfileError(f"{path}.timer must be greater than 0")
        config["timer"] = float(timer)

        step_unit = cfg.get("step_unit", "percent")
        if step_unit not in ("percent", "absolute"):
            raise ProfileError(f"{path}.step_unit must be 'percent' or 'absolute'")
        config["step_unit"] = step_unit

        step = cfg.get("step", 1)
        if isinstance(step, bool) or not isinstance(step, (int, float)) or step <= 0:
            raise ProfileError(f"{path}.step must be greater than 0")
        if step_unit == "percent" and step > 100:
            raise ProfileError(f"{path}.step cannot exceed 100% of the max")
        config["step"] = float(step)

        dwell = cfg.get("dwell", 0)
        if (
            isinstance(dwell, bool)
            or not isinstance(dwell, (int, float))
            or dwell < 0
        ):
            raise ProfileError(f"{path}.dwell must be 0 or greater")
        config["dwell"] = float(dwell)

        release = cfg.get("release", 4)
        if (
            isinstance(release, bool)
            or not isinstance(release, (int, float))
            or release <= 0
        ):
            raise ProfileError(f"{path}.release must be greater than 0")
        config["release"] = float(release)

        try:
            mode = RampMode(cfg.get("mode", "reset"))
        except ValueError:
            allowed = ", ".join(entry.value for entry in RampMode)
            raise ProfileError(f"{path}.mode must be one of {allowed}")
        config["mode"] = mode.value

        duration = cfg.get("duration", -1)
        if (
            isinstance(duration, bool)
            or not isinstance(duration, (int, float))
            or (duration != -1 and duration <= 0)
        ):
            raise ProfileError(f"{path}.duration must be -1 or greater than 0")
        config["duration"] = float(duration)

        try:
            end_action = RampEndAction(cfg.get("end_action", "hold_peak"))
        except ValueError:
            allowed = ", ".join(entry.value for entry in RampEndAction)
            raise ProfileError(
                f"{path}.end_action must be one of {allowed}"
            )
        config["end_action"] = end_action.value
        if end_action is RampEndAction.SET_LEVEL:
            end_value = _coerce_int(cfg.get("end_value"))
            if end_value is None or not 0 <= end_value <= 100:
                raise ProfileError(f"{path}.end_value must be a number 0-100")
            # The runtime caps this at the resolved max; keep the explicit
            # value so lowering the ceiling later does not rewrite the file.
            config["end_value"] = end_value
        else:
            config.pop("end_value", None)

        # Optional: omitted = live field value at apply time
        for key in ("start", "max"):
            if key not in cfg or cfg[key] is None:
                config.pop(key, None)
            else:
                config[key] = _validate_level_value(cfg[key], f"{path}.{key}")

        cleaned[field] = config
    return cleaned


def _validate_unit_block(unit_name: str, block: dict) -> dict:
    """Validated copy of one unit block (unknown keys are preserved)."""
    cleaned = dict(block)

    for field, (low, high) in _UNIT_INT_RANGES.items():
        if field not in block:
            continue
        value = _coerce_int(block[field])
        if value is None or not low <= value <= high:
            raise ProfileError(
                f"{unit_name}.{field} must be an integer between {low} and {high}"
            )
        cleaned[field] = value

    for field in _UNIT_BOOL_FIELDS:
        if field in block and not isinstance(block[field], bool):
            raise ProfileError(f"{unit_name}.{field} must be true or false")

    for field in _UNIT_USAGE_FIELDS:
        if field not in block:
            continue
        usage = block[field]
        if not isinstance(usage, str) or not usage.strip():
            raise ProfileError(f"{unit_name}.{field} must be a usage name")
        cleaned[field] = usage.strip()

    if "ramps" in block:
        ramps = block["ramps"]
        if not isinstance(ramps, dict):
            raise ProfileError(f"{unit_name}.ramps must be a JSON object")
        validated = _validate_ramps(unit_name, ramps)
        if validated:
            cleaned["ramps"] = validated
        else:
            cleaned.pop("ramps", None)

    return cleaned


def validate_threads_settings(settings: object) -> dict[str, dict]:
    """
    Validate a full `threads_settings` replacement.

    Raises `ProfileError` on the first invalid value; returns the normalized
    mapping (unknown keys preserved, ramp defaults filled where applicable).
    """
    if not isinstance(settings, dict) or not settings:
        raise ProfileError("A profile must target at least one unit")

    cleaned: dict[str, dict] = {}
    for unit_name, block in settings.items():
        if unit_name not in _VALID_UNIT_NAMES:
            raise ProfileError(f"Unknown unit '{unit_name}'")
        if not isinstance(block, dict):
            raise ProfileError(f"'{unit_name}' must be a JSON object")
        cleaned[unit_name] = _validate_unit_block(unit_name, block)
    return cleaned


def _validate_defaults(defaults: object, unit_names: set[str]) -> dict:
    """Validate the optional `defaults` block written by the editor."""
    if not isinstance(defaults, dict):
        raise ProfileError("defaults must be a JSON object")

    level = _coerce_int(defaults.get("level_pct", 100))
    if level is None or not 0 <= level <= 150:
        raise ProfileError("defaults.level_pct must be between 0 and 150")

    duration = _coerce_int(defaults.get("duration", -1))
    if duration is None or (duration != -1 and duration <= 0):
        raise ProfileError("defaults.duration must be -1 or greater than 0")

    raw_units = defaults.get("units", [])
    if not isinstance(raw_units, list):
        raise ProfileError("defaults.units must be a list of unit names")
    units = list(dict.fromkeys(str(unit) for unit in raw_units))
    unknown = [unit for unit in units if unit not in unit_names]
    if unknown:
        raise ProfileError(
            f"defaults.units contains units not in the profile: {', '.join(unknown)}"
        )

    return {"level_pct": level, "duration": duration, "units": units}


def _read_defaults(document: dict) -> dict | None:
    """Lenient read of a profile's `defaults` block (None when absent/invalid)."""
    raw = document.get("defaults")
    if not isinstance(raw, dict):
        return None

    level = _coerce_int(raw.get("level_pct", 100))
    duration = _coerce_int(raw.get("duration", -1))
    raw_units = raw.get("units")
    units = (
        [unit for unit in raw_units if isinstance(unit, str)]
        if isinstance(raw_units, list)
        else []
    )
    return {
        "level_pct": min(150, max(0, level)) if level is not None else 100,
        "duration": duration
        if duration is not None and (duration == -1 or duration > 0)
        else -1,
        "units": units,
    }


def _modified_at(name: str) -> str | None:
    try:
        modified = datetime.fromtimestamp(profile_path(name).stat().st_mtime, tz=UTC)
    except OSError:
        return None
    return to_utc_iso(modified)


def summarize(name: str, document: dict) -> dict:
    """Catalog entry for a profile document."""
    raw_units = document.get("threads_settings")
    units = raw_units if isinstance(raw_units, dict) else {}
    unit_names = sorted(unit for unit in units if unit in _VALID_UNIT_NAMES)
    ramps = _preview_ramps(units)
    return {
        "name": name,
        "description": document.get("comment") or None,
        "legacy": _is_legacy_name(name),
        "unit_count": len(unit_names),
        "units": unit_names,
        "ramp_count": len(ramps),
        "modified_at": _modified_at(name),
        "created_by": document.get("created_by") or None,
        "updated_by": document.get("updated_by") or None,
        "created_at": document.get("created_at") or None,
        "updated_at": document.get("updated_at") or None,
        "ramps": ramps,
        "defaults": _read_defaults(document),
    }


def list_profiles() -> list[dict]:
    """Every readable profile, legacy ids first then by name."""
    names: set[str] = set()
    for directory in (PROFILE_DIR, CUSTOM_PROFILE_DIR):
        if not directory.is_dir():
            continue
        for path in directory.glob("*.json"):
            if path.stem in _HIDDEN_STEMS:
                continue
            names.add(path.stem)

    profiles: list[dict] = []
    for name in names:
        try:
            document = load_profile(name)
        except ProfileError as err:
            logger.warning(f"[Profiles] {err}")
            continue
        profiles.append(summarize(name, document))

    profiles.sort(key=lambda p: (not p["legacy"], p["name"].lower()))
    return profiles


def get_profile_detail(name: str) -> dict:
    """
    Editable content of one profile, for the UI editor.

    Returns the raw unit blocks (unknown keys preserved) plus the usage
    vocabulary / limits and the fallback defaults used when adding a unit
    that is not in the profile yet.
    """
    document = load_profile(name)

    settings: dict[str, dict] = {}
    raw_settings = document.get("threads_settings")
    if isinstance(raw_settings, dict):
        settings = {
            unit: block
            for unit, block in raw_settings.items()
            if isinstance(block, dict)
        }

    limits = _usage_limits()
    return {
        "name": name,
        "description": document.get("comment") or None,
        "legacy": _is_legacy_name(name),
        "threads_settings": settings,
        "defaults": _read_defaults(document),
        "usage_limits": limits,
        "usage_names": sorted(usage for usage in limits if usage != "default"),
        "unit_defaults": _unit_defaults(),
        "modified_at": _modified_at(name),
        "created_by": document.get("created_by") or None,
        "updated_by": document.get("updated_by") or None,
        "created_at": document.get("created_at") or None,
        "updated_at": document.get("updated_at") or None,
    }


def list_pending_applies() -> list[dict]:
    """
    Waiting PROFILE items in the action queue, oldest first.

    Feeds the `profiles:pending` broadcast / reply so the UI can show (and
    cancel) applies queued behind a running action. An empty list is
    returned before the queue is initialized.
    """
    try:
        queue = ActionQueue.get_instance()
    except RuntimeError:
        return []

    pending = [
        item
        for item in queue.get_items()
        if item.action_type == ActionType.PROFILE
        and item.status == QueueItemStatus.WAITING
    ]
    pending.sort(key=lambda item: item.created_at)

    items: list[dict] = []
    for item in pending:
        payload = item.payload if isinstance(item.payload, dict) else {}
        try:
            level_pct = int(payload.get("level_pct", 100))
        except (TypeError, ValueError):
            level_pct = 100
        units = payload.get("units")
        items.append(
            {
                "id": item.id,
                "name": str(payload.get("profile", "")),
                "level_pct": level_pct,
                "duration": item.duration,
                "units": [str(unit) for unit in units]
                if isinstance(units, list)
                else [],
                "origin": item.origin,
                "display_name": item.display_name,
                "created_at": to_utc_iso(item.created_at),
            }
        )
    return items


def capture_threads_settings(include_ramps: bool) -> dict:
    """Current unit settings (and optionally active ramps) as profile content."""
    store = Store()
    unit_settings = store.get_all_units_settings()
    ramps = ramp_manager.get_all()

    threads_settings: dict[str, dict] = {}
    for unit_name, settings in unit_settings.items():
        if not settings:
            continue

        unit_profile = {
            field: settings[field]
            for field in PROFILE_UNIT_FIELDS
            if field in settings
        }

        if include_ramps:
            unit_ramps = {
                ramp["field"]: {
                    "timer": ramp["timer"],
                    "step": ramp["step"],
                    "step_unit": ramp.get("step_unit", "percent"),
                    "mode": ramp["mode"],
                    "dwell": ramp.get("dwell", 0),
                    "release": ramp.get("release", 4),
                    "duration": ramp["duration"],
                    "max": ramp["max_value"],
                    "start": ramp["start_value"],
                    "end_action": ramp.get("end_action", "hold_peak"),
                    "end_value": ramp.get("end_value"),
                }
                for ramp in ramps
                if ramp["unit"] == unit_name
            }
            if unit_ramps:
                unit_profile["ramps"] = unit_ramps

        threads_settings[unit_name] = unit_profile

    return threads_settings


def save_profile(
    name: str,
    *,
    description: str | None,
    include_ramps: bool,
    created_by: str,
    overwrite: bool = False,
) -> dict:
    """
    Snapshot the current unit settings (and active ramps) as a profile file.

    Returns the saved profile's catalog summary.
    """
    path = profile_path(name)
    if path.exists() and not overwrite:
        raise ProfileError(f"Profile '{name}' already exists")

    threads_settings = capture_threads_settings(include_ramps)
    if not threads_settings:
        raise ProfileError("No unit settings to save yet")

    document = {
        "comment": description or "",
        "created_by": created_by,
        "created_at": to_utc_iso(datetime.now(UTC)),
        "threads_settings": threads_settings,
    }

    _write_document(path, document)
    logger.info(f"[Profiles] Saved profile '{name}'", created_by=created_by)
    return summarize(name, document)


def update_profile(
    name: str,
    *,
    description: str | None = None,
    rename_to: str | None = None,
    from_current: bool = False,
    include_ramps: bool = True,
    threads_settings: dict | None = None,
    defaults: dict | None = None,
    replace_defaults: bool = False,
    updated_by: str,
) -> dict:
    """
    Update a profile in place: description, content, defaults and/or name.

    `threads_settings` (validated) replaces the stored unit blocks when not
    None; `from_current` snapshots the live state first, so explicit settings
    win over the snapshot. `defaults` is only written when
    `replace_defaults` is true (None then clears the block).

    Returns the updated profile's catalog summary.
    """
    document = load_profile(name)

    if description is not None:
        document["comment"] = description

    if from_current:
        captured = capture_threads_settings(include_ramps)
        if not captured:
            raise ProfileError("No unit settings to save yet")
        document["threads_settings"] = captured

    if threads_settings is not None:
        document["threads_settings"] = validate_threads_settings(threads_settings)

    if replace_defaults:
        if defaults is None:
            document.pop("defaults", None)
        else:
            stored = document.get("threads_settings")
            unit_names = set(stored) if isinstance(stored, dict) else set()
            document["defaults"] = _validate_defaults(defaults, unit_names)

    target_name = rename_to or name
    old_path = profile_path(name)
    target_path = profile_path(target_name)
    if target_name != name and target_path.exists():
        raise ProfileError(f"Profile '{target_name}' already exists")

    document["updated_by"] = updated_by
    document["updated_at"] = to_utc_iso(datetime.now(UTC))

    _write_document(target_path, document)
    if target_name != name and target_path != old_path:
        old_path.unlink(missing_ok=True)

    logger.info(f"[Profiles] Updated profile '{name}'", updated_by=updated_by)
    return summarize(target_name, document)


def duplicate_profile(name: str, new_name: str, created_by: str) -> dict:
    """Copy a profile under a new name. Returns the copy's summary."""
    document = load_profile(name)
    target_path = profile_path(new_name)
    if target_path.exists():
        raise ProfileError(f"Profile '{new_name}' already exists")

    document["created_by"] = created_by
    document["created_at"] = to_utc_iso(datetime.now(UTC))

    _write_document(target_path, document)
    logger.info(f"[Profiles] Duplicated '{name}' to '{new_name}'", created_by=created_by)
    return summarize(new_name, document)


def delete_profile(name: str) -> None:
    path = profile_path(name)
    if not path.is_file():
        raise ProfileError(f"Profile '{name}' not found")
    path.unlink()
    logger.info(f"[Profiles] Deleted profile '{name}'")


def _write_document(path: pathlib.Path, document: dict) -> None:
    """Atomic JSON write: temp file in the same dir, then os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=f".{path.stem}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    except BaseException:
        pathlib.Path(temp_name).unlink(missing_ok=True)
        raise
