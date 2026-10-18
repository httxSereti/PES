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

import structlog

from events.enums import ActionType, QueueItemStatus
from events.queue import ActionQueue
from hardware.ramp import RAMP_FIELDS, ramp_manager
from store import Store
from typings import RampMode, UnitDict
from utils import to_utc_iso

logger = structlog.get_logger("pes")

# Profile files live next to the app (CWD = apps/app); config.env overrides.
PROFILE_DIR = pathlib.Path(os.getenv("DIR_PROFILE", "profile"))

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
            except (KeyError, TypeError, ValueError):
                continue

            step_unit = cfg.get("step_unit", "percent")
            if (
                not isinstance(timer, (int, float))
                or isinstance(timer, bool)
                or not isinstance(duration, (int, float))
                or isinstance(duration, bool)
                or step_unit not in ("percent", "absolute")
                or timer <= 0
                or step <= 0
                or (step_unit == "percent" and step > 100)
                or (duration != -1 and duration <= 0)
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

            if step_unit == "absolute" and max_level > 0:
                step = step * 100 / max_level

            ramps.append(
                {
                    "unit": unit_name,
                    "field": field,
                    "mode": mode.value,
                    "timer": float(timer),
                    "step": round(step, 2),
                    "duration": float(duration),
                    "start": start_level,
                    "max": max_level,
                }
            )

    return ramps


def summarize(name: str, document: dict) -> dict:
    """Catalog entry for a profile document."""
    raw_units = document.get("threads_settings")
    units = raw_units if isinstance(raw_units, dict) else {}
    unit_names = sorted(unit for unit in units if unit in _VALID_UNIT_NAMES)
    ramps = _preview_ramps(units)
    try:
        modified = datetime.fromtimestamp(
            profile_path(name).stat().st_mtime, tz=UTC
        )
    except OSError:
        modified = None

    return {
        "name": name,
        "description": document.get("comment") or None,
        "legacy": _is_legacy_name(name),
        "unit_count": len(unit_names),
        "units": unit_names,
        "ramp_count": len(ramps),
        "modified_at": to_utc_iso(modified) if modified else None,
        "created_by": document.get("created_by") or None,
        "updated_by": document.get("updated_by") or None,
        "created_at": document.get("created_at") or None,
        "updated_at": document.get("updated_at") or None,
        "ramps": ramps,
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
                    "mode": ramp["mode"],
                    "duration": ramp["duration"],
                    "max": ramp["max_value"],
                    "start": ramp["start_value"],
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
    updated_by: str,
) -> dict:
    """
    Update a profile in place: description, content snapshot and/or name.

    Returns the updated profile's catalog summary.
    """
    document = load_profile(name)

    if description is not None:
        document["comment"] = description

    if from_current:
        threads_settings = capture_threads_settings(include_ramps)
        if not threads_settings:
            raise ProfileError("No unit settings to save yet")
        document["threads_settings"] = threads_settings

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
