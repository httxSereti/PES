"""
Persisted runtime logging configuration.

The log level is stored in ``configurations/logs.json`` so a level selected
from the Logs page survives backend restarts.  If the file is missing or
invalid, the application falls back to INFO.
"""

from __future__ import annotations

import json
import logging
import pathlib
import threading

LOGS_CONFIG_PATH = pathlib.Path("configurations/logs.json")
DEFAULT_LEVEL = "INFO"

LOG_LEVELS: dict[str, int] = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "WARN": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


def normalize_level(level: str) -> str:
    normalized = level.strip().upper()
    if normalized == "WARN":
        return "WARNING"
    if normalized not in LOG_LEVELS:
        raise ValueError(f"Invalid log level: {level}")
    return normalized


class LogSettingsStore:
    """Thread-safe persisted log level."""

    def __init__(self, path: pathlib.Path | str = LOGS_CONFIG_PATH) -> None:
        self._path = pathlib.Path(path)
        self._lock = threading.RLock()
        self._level = DEFAULT_LEVEL
        self.load()

    def load(self) -> None:
        try:
            with open(self._path, encoding="utf-8") as config_file:
                data = json.load(config_file)
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            return

        if not isinstance(data, dict):
            return

        level = data.get("level")
        if isinstance(level, str):
            try:
                self._level = normalize_level(level)
            except ValueError:
                pass

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as config_file:
            json.dump({"level": self._level}, config_file, indent=2)
            config_file.write("\n")

    def level_name(self) -> str:
        with self._lock:
            return self._level

    def level_int(self) -> int:
        with self._lock:
            return LOG_LEVELS[self._level]

    def set_level(self, level: str) -> str:
        normalized = normalize_level(level)
        with self._lock:
            self._level = normalized
            try:
                self._save()
            except OSError as err:
                # The level still applies for this run.
                logging.getLogger("pes").warning(
                    f"[Logs] Failed to persist log settings: {err}"
                )
        return normalized


log_settings = LogSettingsStore()
