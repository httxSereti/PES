"""Events v3 foundation: config, event plan and shadow telemetry."""

from __future__ import annotations

from .config import V3Config, get_v3_config
from .plan import EventPlan
from .shadow import LEGACY_FLOW_ID, ShadowRecorder

__all__ = [
    "EventPlan",
    "LEGACY_FLOW_ID",
    "ShadowRecorder",
    "V3Config",
    "get_v3_config",
]
