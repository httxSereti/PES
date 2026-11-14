"""Events v3 foundation: config, event plan and shadow telemetry."""

from __future__ import annotations

from .config import V3Config, get_v3_config
from .plan import ApprovalDraft, EventPlan
from .shadow import LEGACY_FLOW_ID, ShadowRecorder
from .telemetry import TelemetryRecorder

__all__ = [
    "ApprovalDraft",
    "EventPlan",
    "LEGACY_FLOW_ID",
    "ShadowRecorder",
    "TelemetryRecorder",
    "V3Config",
    "get_v3_config",
]
