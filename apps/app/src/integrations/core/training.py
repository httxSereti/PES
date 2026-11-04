"""
Training — core integration (metadata facade).

The training service owns the session lifecycle and emits these events through
the EventDispatcher; this facade exposes them to the trigger-rule catalog so
they appear in the UI and in `/api/events/types`.
"""

from __future__ import annotations

from events.enums import TriggerableEvent
from integrations.base import EventDef, Integration, IntegrationKind

_SESSION_FIELDS = {
    "session_id": "opaque training session id",
    "status": "session status after the event",
    "edge_count": "successful edges so far",
    "duration_seconds": "active duration in seconds (pauses excluded)",
    "goals_met": "whether every goal is currently reached",
    "auto_stop_on_goal": "whether the session stops automatically on success",
}


class TrainingIntegration(Integration):
    id = "training"
    name = "Training"
    description = "Edging training sessions, goals, edges and pauses."
    kind = IntegrationKind.CORE

    def events(self) -> list[EventDef]:
        return [
            EventDef(
                id=TriggerableEvent.TRAINING_SESSION_STARTED.value,
                label="Training session started",
                description="An edging training session started.",
                group="Training",
                data_schema=_SESSION_FIELDS,
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_EDGE_RECORDED.value,
                label="Training edge recorded",
                description="An edge was recorded during a training session.",
                group="Training",
                data_schema={
                    **_SESSION_FIELDS,
                    "difficulty": "easy, normal, hard or extreme",
                    "outcome": "success or fail",
                    "interval_seconds": "seconds since the previous edge",
                    "source": "host, member or system",
                },
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_GOAL_REACHED.value,
                label="Training goal reached",
                description="Every goal of a training session is reached.",
                group="Training",
                data_schema=_SESSION_FIELDS,
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_SESSION_PAUSED.value,
                label="Training session paused",
                description="A training session was paused.",
                group="Training",
                data_schema=_SESSION_FIELDS,
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_SESSION_RESUMED.value,
                label="Training session resumed",
                description="A paused training session was resumed.",
                group="Training",
                data_schema=_SESSION_FIELDS,
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_SESSION_SUCCEEDED.value,
                label="Training session succeeded",
                description="A training session reached all its goals.",
                group="Training",
                data_schema=_SESSION_FIELDS,
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_SESSION_FAILED.value,
                label="Training session failed",
                description="A training session ended on a failed edge.",
                group="Training",
                data_schema={**_SESSION_FIELDS, "outcome": "always fail"},
            ),
            EventDef(
                id=TriggerableEvent.TRAINING_SESSION_CANCELLED.value,
                label="Training session cancelled",
                description="A training session was cancelled by the Host.",
                group="Training",
                data_schema=_SESSION_FIELDS,
            ),
        ]
