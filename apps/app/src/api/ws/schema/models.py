"""
Shared payload models of the WS contract: unit/sensor state, trigger rules,
triggered events, queue status, and the command response envelope.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field

from events.enums import ActionType
from typings import RampMode

from .base import TsType, WireModel

# Partial<T> patch views of shared models (runtime: plain dicts)
UnitSettingsPatch = Annotated[dict[str, Any], TsType("Partial<UnitSettings>")]
SensorPatch = Annotated[dict[str, Any], TsType("Partial<Sensor>")]
TriggerRulePatch = Annotated[dict[str, Any], TsType("Partial<TriggerRule>")]


class UsageLimit(WireModel):
    start: int
    warn: int
    max: int


class UnitSettings(WireModel):
    id: str
    # Channel A
    ch_A: float
    ch_A_multiplier: float
    # Channel B
    ch_B: float
    ch_B_multiplier: float
    # Channels usage
    ch_A_use: str
    ch_B_use: str
    ch_A_limit: UsageLimit
    ch_B_limit: UsageLimit
    # Waveform settings
    adj_1: float
    adj_2: float
    # 2B timer adjusts
    adj_3: float
    adj_4: float
    # Power config
    ch_link: bool
    level_d: bool
    level_h: bool
    level_map: float
    power_bias: float
    # Mode
    mode: int
    # Status
    cnx_ok: bool
    sync: bool
    updated: bool


class BaseSensor(WireModel):
    id: str
    sensor_online: bool
    alarm_enable: bool


class MotionSensor(BaseSensor):
    sensor_type: Literal["motion"]

    position_ref: float
    position_alarm_level: float
    position_delay_on: int
    position_delay_off: int

    move_alarm_level: float
    move_delay_on: int
    move_delay_off: int

    position_alarm_counter: int
    move_alarm_counter: int

    position_alarm_number: int
    move_alarm_number: int

    position_alarm_number_action: int
    move_alarm_number_action: int

    current_position: float
    current_move: float


class SoundSensor(BaseSensor):
    sensor_type: Literal["sound"]

    sound_alarm_level: float
    sound_delay_on: int
    sound_delay_off: int

    sound_alarm_counter: int
    sound_alarm_number: int
    sound_alarm_number_action: int

    current_sound: float


Sensor = Annotated[
    MotionSensor | SoundSensor, Field(discriminator="sensor_type")
]


class TriggerRuleLabel(WireModel):
    id: str
    name: str
    # nullable, matching the DB column (labels can be created name-only)
    description: str | None


class TriggerAction(WireModel):
    id: str
    trigger_rule_id: str
    action_type: ActionType
    payload: dict[str, Any]
    duration: int
    cumulative: bool
    sort_order: int


class TriggerRule(WireModel):
    id: str
    event_type: str
    name: str
    description: str | None
    enabled: bool
    priority: int
    actions: list[TriggerAction]
    labels: list[TriggerRuleLabel]
    # nullable for legacy rows created before the columns existed
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TriggeredAction(WireModel):
    queue_item_id: str
    action_id: str | None
    action_type: str
    display_name: str | None
    duration: int
    cumulative: bool
    payload: dict[str, Any]


class TriggeredRule(WireModel):
    rule_id: str | None
    rule_name: str
    priority: int
    actions: list[TriggeredAction]


class TriggeredEvent(WireModel):
    id: str
    event_type: str
    origin: str
    event_data: dict[str, Any]
    triggered_at: datetime
    triggered_rules: list[TriggeredRule]


class QueueStatus(WireModel):
    paused: bool
    waiting: int
    running: int
    total_in_queue: int
    total_done: int
    total_cancelled: int


class Ramp(WireModel):
    """State of one software ramp on (unit, field) — see hardware/ramp.py."""

    unit: str
    field: str
    max_value: int
    timer: float
    step: float
    step_unit: str
    mode: RampMode
    duration: float
    elapsed: float
    paused: bool
    progress: float
    value: int


class CommandResult(WireModel):
    status: str
    message: str | None = None
    # Present on trigger_rules:create / trigger_rules:edit replies
    rule: TriggerRule | None = None
    # Present on training mutation replies (create/update/start/edge/end)
    session: EdgingSession | None = None
    edge: EdgingEdge | None = None


class StatusMessage(WireModel):
    status: str
    message: str


# ─────────────────────────────── Training ───────────────────────────────


class EdgingGoal(WireModel):
    type: str
    value: int


class EdgingEdge(WireModel):
    id: str
    session_id: str
    difficulty: str
    outcome: str
    recorded_by: str
    recorded_at: datetime


class EdgingSession(WireModel):
    id: str
    name: str
    goals: list[EdgingGoal]
    auto_stop_on_goal: bool
    initiator: str
    initiator_user_id: str | None
    created_by: str
    status: str
    rating: int | None
    notes: str | None
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    # Derived: successful edges so far, elapsed seconds, and whether every
    # goal is currently reached.
    edge_count: int
    duration_seconds: int | None
    goals_met: bool


class TrainingOverviewStats(WireModel):
    """Aggregate stats for the whole Training module (see overview page)."""

    total_sessions: int
    ended_sessions: int
    succeeded_sessions: int
    failed_sessions: int
    cancelled_sessions: int
    total_edges: int
    total_success_edges: int
    total_failed_edges: int
    total_duration_seconds: int
    average_duration_seconds: float | None
    average_edges_per_session: float | None
    success_rate: float | None
    average_rating: float | None
    difficulty_counts: dict[str, int]


class EdgingSessionStats(WireModel):
    """Per-session stats, compared to the previous session and averages."""

    duration_seconds: int | None
    success_edges: int
    failed_edges: int
    edges_per_minute: float | None
    edges_per_minute_previous: float | None
    edges_per_minute_average: float | None
    duration_previous_seconds: int | None
    duration_average_seconds: float | None
    edges_previous: int | None
    edges_average: float | None
    difficulty_counts: dict[str, int]


# ─────────────────────────────── Session ───────────────────────────────


SessionUnitId = Literal["UNIT1", "UNIT2", "UNIT3"]
SessionSensorId = Literal["sound", "motion1", "motion2"]


class Session(WireModel):
    """An application session (lifecycle wrapper, not a training session)."""

    id: str
    type: Literal["testing", "solo_play", "multiplayer"]
    name: str
    description: str | None
    unit_ids: list[SessionUnitId]
    sensor_ids: list[SessionSensorId]
    status: Literal["running", "ended"]
    created_by: str
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None


class SessionHistoryItem(Session):
    """An application session with quick log counts for the history pages."""

    duration_seconds: int | None
    edging_session_count: int
    event_count: int


class SessionHistoryDetail(WireModel):
    """One application session + the edging sessions and events logged in it."""

    session: SessionHistoryItem
    # null when the requester lacks the matching read permission
    edging_sessions: list[EdgingSession] | None
    events: list[TriggeredEvent] | None


__all__ = [
    "UnitSettingsPatch",
    "SensorPatch",
    "TriggerRulePatch",
    "UsageLimit",
    "UnitSettings",
    "BaseSensor",
    "MotionSensor",
    "SoundSensor",
    "Sensor",
    "TriggerRuleLabel",
    "TriggerAction",
    "TriggerRule",
    "TriggeredAction",
    "TriggeredRule",
    "TriggeredEvent",
    "QueueStatus",
    "Ramp",
    "CommandResult",
    "StatusMessage",
    "EdgingGoal",
    "EdgingEdge",
    "EdgingSession",
    "TrainingOverviewStats",
    "EdgingSessionStats",
    "SessionUnitId",
    "SessionSensorId",
    "Session",
    "SessionHistoryItem",
    "SessionHistoryDetail",
]
