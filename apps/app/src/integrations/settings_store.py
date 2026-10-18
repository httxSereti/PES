"""
Non-secret integration state persisted to configurations/integrations.json.

Shape: {"<integration_id>": {"enabled": true, "some_option": ...}}.
Secrets are declared as env-source settings and stay in config.env.
"""

from __future__ import annotations

import json
import pathlib
import threading
from typing import Any

import structlog

logger = structlog.get_logger("pes")

INTEGRATIONS_CONFIG_PATH = pathlib.Path("configurations/integrations.json")


class IntegrationSettingsStore:
    def __init__(self, path: pathlib.Path | str = INTEGRATIONS_CONFIG_PATH):
        self._path = pathlib.Path(path)
        self._lock = threading.RLock()
        self._data: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        try:
            with open(self._path) as json_file:
                data = json.load(json_file)
        except FileNotFoundError:
            data = {}
        except (json.JSONDecodeError, OSError) as err:
            logger.warning(f"[Integrations] Unreadable settings file: {err}")
            data = {}

        if not isinstance(data, dict):
            data = {}
        self._data = {
            key: value
            for key, value in data.items()
            if isinstance(key, str) and isinstance(value, dict)
        }

    def _save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._path, "w") as json_file:
                json.dump(self._data, json_file, indent=2)
        except OSError as err:
            logger.error(f"[Integrations] Failed to persist settings: {err}")

    def get(self, integration_id: str) -> dict[str, Any]:
        with self._lock:
            return dict(self._data.get(integration_id, {}))

    def update(self, integration_id: str, values: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self._data.setdefault(integration_id, {})
            current.update(values)
            self._save()
            return dict(current)

    def is_enabled(self, integration_id: str) -> bool:
        with self._lock:
            return bool(self._data.get(integration_id, {}).get("enabled", True))

    def set_enabled(self, integration_id: str, enabled: bool) -> dict[str, Any]:
        return self.update(integration_id, {"enabled": bool(enabled)})
