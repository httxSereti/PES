"""Feature flags for the Events v3 migration.

Phase 0 has no flow compiler yet. The flags let the app run the legacy
pipeline unchanged while the envelope, telemetry tables and shadow recorder
are exercised in opt-in mode.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class V3Config:
    """Runtime configuration for the Events v3 rollout."""

    enabled: bool = False
    shadow_mode: bool = False
    max_workers: int = 4


def get_v3_config() -> V3Config:
    """Read flags from the environment on every call (tests can patch them)."""

    return V3Config(
        enabled=_env_bool("EVENTS_V3_ENABLED", False),
        shadow_mode=_env_bool("EVENTS_V3_SHADOW_MODE", False),
        max_workers=max(1, _env_int("EVENTS_V3_MAX_WORKERS", 4)),
    )
