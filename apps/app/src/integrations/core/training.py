"""
Training — core integration (metadata facade).

The training service owns the session lifecycle and emits these events through
the EventDispatcher; this facade exposes them to the trigger-rule catalog so
they appear in the UI and in `/api/events/types`.
"""

from __future__ import annotations

from events.enums import ActionType, TriggerableEvent
from integrations.base import ActionDef, EventDef, Integration, IntegrationKind

from .training_actions import TrainingActionHandler

_SESSION_FIELDS = {
    "session_id": "opaque training session id",
    "status": "session status after the event",
    "edge_count": "successful edges so far",
    "duration_seconds": "active duration in seconds (pauses excluded)",
    "goals_met": "whether every goal is currently reached",
    "auto_stop_on_goal": "whether the session stops automatically on success",
    "mode": "manual or guided",
    "program_id": "program id when the session belongs to a program",
    "program_step": "zero-based program step index",
}

_ACTION_HANDLER = TrainingActionHandler()

# One-shot state transitions: the dispatcher runs them once, concurrently,
# and finalizes them on the next queue tick (no meaningful duration/reverse).
_ACTIONS = [
    ActionDef(
        id=ActionType.TRAINING_START.value,
        label="Start training session",
        description=(
            "Create and start an edging session from a saved template or from "
            "the next step of a program."
        ),
        group="Training",
        payload_schema={
            "template_id": "template id (mutually exclusive with program_id)",
            "program_id": "program id (starts its next uncompleted step)",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
    ActionDef(
        id=ActionType.TRAINING_PAUSE.value,
        label="Pause training session",
        description="Pause the running training session (idempotent).",
        group="Training",
        payload_schema={
            "session_id": "optional session id; defaults to the running session",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
    ActionDef(
        id=ActionType.TRAINING_RESUME.value,
        label="Resume training session",
        description="Resume the paused running training session (idempotent).",
        group="Training",
        payload_schema={
            "session_id": "optional session id; defaults to the running session",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
    ActionDef(
        id=ActionType.TRAINING_END.value,
        label="End training session",
        description=(
            "End the running session as succeeded, cancelled or failed. "
            "Succeeded still requires every goal to be met."
        ),
        group="Training",
        payload_schema={
            "status": "succeeded, cancelled or failed (default: cancelled)",
            "session_id": "optional session id; defaults to the running session",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
    ActionDef(
        id=ActionType.TRAINING_NEXT_PROGRAM_STEP.value,
        label="Start next program step",
        description=(
            "Create and start the next uncompleted step of a training program. "
            "Use it after a succeeded session to unlock the next step."
        ),
        group="Training",
        payload_schema={
            "program_id": "program id",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
    ActionDef(
        id=ActionType.TRAINING_RECORD_EDGE.value,
        label="Record system edge",
        description=(
            "Record an edge on the running session as the system actor. "
            "Reserved for automation: ignored on training-origin events to "
            "avoid feedback loops."
        ),
        group="Training",
        payload_schema={
            "difficulty": "easy, normal, hard or extreme (default: normal)",
            "outcome": "success or fail (default: success)",
            "note": "optional note",
            "session_id": "optional session id; defaults to the running session",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
    ActionDef(
        id=ActionType.TRAINING_STOP_AND_NEUTRALIZE.value,
        label="Stop training and neutralize",
        description=(
            "Fail the running session (if any), cancel the action queue, stop "
            "ramps and zero every output. Use it as a safety action on failure."
        ),
        group="Training",
        payload_schema={
            "session_id": "optional session id; defaults to the running session",
        },
        one_shot=True,
        handler=_ACTION_HANDLER,
    ),
]


class TrainingIntegration(Integration):
    id = "training"
    name = "Training"
    description = "Edging training sessions, goals, edges and pauses."
    kind = IntegrationKind.CORE

    def actions(self) -> list[ActionDef]:
        return list(_ACTIONS)

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
