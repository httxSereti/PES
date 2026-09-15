"""
Saved EStim profiles: JSON documents under ``DIR_PROFILE`` that the event
executor can apply (``ActionType.PROFILE``) and users can create from the UI.

A profile maps each unit to its settings plus an optional per-field ``ramps``
block; see ``apps/app/profile/MODELE.json`` for the reference format. Built-in
profiles ship as single-letter files (A-J, Z), user profiles use any slug.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import tempfile
from datetime import UTC, datetime

import structlog

from hardware.ramp import ramp_manager
from store import Store
from utils import to_utc_iso

logger = structlog.get_logger("pes")

# Profile files live next to the app (CWD = apps/app); config.env overrides.
PROFILE_DIR = pathlib.Path(os.getenv("DIR_PROFILE", "profile"))

# Profile name == file stem. Slugs keep the trigger-rule text field readable
# and prevent path traversal.
PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")

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


def profile_path(name: str) -> pathlib.Path:
    if not PROFILE_NAME_RE.match(name):
        raise ProfileError(
            "Profile name must be 1-32 characters: letters, digits, '-' or '_'"
        )
    return PROFILE_DIR / f"{name}.json"


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


def summarize(name: str, document: dict) -> dict:
    """Catalog entry for a profile document."""
    units = document.get("threads_settings") or {}
    ramp_count = sum(len(unit.get("ramps") or {}) for unit in units.values())
    path = PROFILE_DIR / f"{name}.json"
    try:
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
    except OSError:
        modified = None

    return {
        "name": name,
        "description": document.get("comment") or None,
        "builtin": len(name) == 1 and name.isalpha(),
        "unit_count": len(units),
        "ramp_count": ramp_count,
        "modified_at": to_utc_iso(modified) if modified else None,
    }


def list_profiles() -> list[dict]:
    """Every readable profile, built-ins first then user profiles by name."""
    profiles: list[dict] = []
    if not PROFILE_DIR.is_dir():
        return profiles

    for path in sorted(PROFILE_DIR.glob("*.json")):
        if path.stem in _HIDDEN_STEMS:
            continue
        try:
            document = load_profile(path.stem)
        except ProfileError as err:
            logger.warning(f"[Profiles] {err}")
            continue
        profiles.append(summarize(path.stem, document))

    profiles.sort(key=lambda p: (not p["builtin"], p["name"].lower()))
    return profiles


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
    target_path = profile_path(target_name)
    if target_name != name and target_path.exists():
        raise ProfileError(f"Profile '{target_name}' already exists")

    document["updated_by"] = updated_by
    document["updated_at"] = to_utc_iso(datetime.now(UTC))

    _write_document(target_path, document)
    if target_name != name:
        profile_path(name).unlink(missing_ok=True)

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
