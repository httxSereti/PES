"""
Per-unit channel level limits (host overrides over the usage defaults).

`configurations/usage_limit.json` defines the default ``{start, warn, max}``
for each usage name. This module keeps the optional per-unit/channel
overrides written by the host from the Units page, persisted to
``configurations/unit_limits.json``:

    {"UNIT1": {"A": {"start": 20, "warn": 35, "max": 50}}}

The file is read once at import and rewritten atomically on every change.
"""

from __future__ import annotations

import json
import pathlib
import threading
from typing import Any

import structlog

logger = structlog.get_logger("pes")

UNIT_LIMITS_PATH = pathlib.Path("configurations/unit_limits.json")
CHANNELS = ("A", "B")


def _valid_limit(value: Any) -> dict[str, int] | None:
    """Normalize one ``{start, warn, max}`` object; None when invalid."""
    if not isinstance(value, dict):
        return None
    try:
        start = int(value["start"])
        warn = int(value["warn"])
        maximum = int(value["max"])
    except (KeyError, TypeError, ValueError):
        return None
    if not all(0 <= number <= 100 for number in (start, warn, maximum)):
        return None
    if not start <= warn <= maximum:
        return None
    return {"start": start, "warn": warn, "max": maximum}


class UnitLimitsStore:
    """Thread-safe per-unit/channel limit overrides backed by a JSON file."""

    def __init__(self, path: pathlib.Path | str = UNIT_LIMITS_PATH) -> None:
        self._path = pathlib.Path(path)
        self._lock = threading.RLock()
        self._data: dict[str, dict[str, dict[str, int]]] = {}
        self._load()

    def _load(self) -> None:
        try:
            with open(self._path, encoding="utf-8") as json_file:
                data = json.load(json_file)
        except FileNotFoundError:
            data = {}
        except (OSError, json.JSONDecodeError) as err:
            logger.warning(f"[UnitLimits] Unreadable limits file: {err}")
            data = {}

        if not isinstance(data, dict):
            data = {}

        cleaned: dict[str, dict[str, dict[str, int]]] = {}
        for unit_id, channels in data.items():
            if not isinstance(unit_id, str) or not isinstance(channels, dict):
                continue
            for channel, limit in channels.items():
                if channel not in CHANNELS:
                    continue
                valid = _valid_limit(limit)
                if valid is None:
                    logger.warning(
                        "[UnitLimits] Ignored invalid override",
                        unit_id=unit_id,
                        channel=channel,
                    )
                    continue
                cleaned.setdefault(unit_id, {})[channel] = valid

        self._data = cleaned

    def _save(self) -> None:
        tmp_path = self._path.with_name(f"{self._path.name}.tmp")
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with open(tmp_path, "w", encoding="utf-8") as json_file:
                json.dump(self._data, json_file, indent=2)
                json_file.write("\n")
            tmp_path.replace(self._path)
        except OSError as err:
            tmp_path.unlink(missing_ok=True)
            logger.error(f"[UnitLimits] Failed to persist limits: {err}")
            raise

    def get(self, unit_id: str, channel: str) -> dict[str, int] | None:
        """The host override for one unit/channel, or None for the usage default."""
        with self._lock:
            limit = self._data.get(unit_id, {}).get(channel)
            return dict(limit) if limit is not None else None

    def set(self, unit_id: str, channel: str, limit: dict[str, Any]) -> dict[str, int]:
        """Persist one unit/channel override and return the normalized value."""
        if channel not in CHANNELS:
            raise ValueError(f"Unknown channel '{channel}'")
        valid = _valid_limit(limit)
        if valid is None:
            raise ValueError("Limits must satisfy 0 <= start <= warn <= max <= 100")

        with self._lock:
            self._data.setdefault(unit_id, {})[channel] = valid
            self._save()
            return dict(valid)


unit_limits = UnitLimitsStore()
