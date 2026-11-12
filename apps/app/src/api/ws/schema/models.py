"""
Shared payload models of the WS contract: unit/sensor state, trigger rules,
triggered events, queue status, and the command response envelope.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field, model_validator

from events.enums import ActionType
from typings import RampEndAction, RampMode

from .base import TsType, WireModel

# Partial<T> patch views of shared models (runtime: plain dicts)
UnitSettingsPatch = Annotated[dict[str, Any], TsType("Partial<UnitSettings>")]
SensorPatch = Annotated[dict[str, Any], TsType("Partial<Sensor>")]
TriggerRulePatch = Annotated[dict[str, Any], TsType("Partial<TriggerRule>")]


class UsageLimit(WireModel):
    start: int = Field(ge=0, le=100)
    warn: int = Field(ge=0, le=100)
    max: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def _ordered(self) -> "UsageLimit":
        if not self.start <= self.warn <= self.max:
            raise ValueError("limits must satisfy start <= warn <= max")
        return self


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
    # Legacy single-event field (the first selection) kept for older readers
    event_type: str
    event_types: list[str]
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
    start_value: int
    value: int
    dwell: float = 0
    release: float = 4
    owner: str | None = None
    end_action: RampEndAction = RampEndAction.HOLD_PEAK
    end_value: int | None = None


class ProfileRampPreview(WireModel):
    """Resolved ramp of a saved profile, for the profile shape preview.

    Values mirror what the action executor would pass to the ramp manager:
    ``step`` is normalized to percent of ``max``, ``start``/``max`` are
    absolute field levels (MagicNumber ranges resolved to their midpoint).
    """

    unit: str
    field: str
    mode: RampMode = RampMode.RESET
    timer: float = 1.0
    step: float = 1.0
    dwell: float = 0
    release: float = 4
    duration: float = -1
    start: int = 0
    max: int = 0
    end_action: RampEndAction = RampEndAction.HOLD_PEAK
    # SET_LEVEL target, already capped at ``max`` when that is known
    end_value: int | None = None


class ProfileDefaults(WireModel):
    """Optional per-profile apply defaults, used to prefill the apply dialog."""

    # Same shape as the apply payload: 0-150%, -1 = until stopped, empty = all
    level_pct: int = 100
    duration: int = -1
    units: list[str] = []


class ProfileSummary(WireModel):
    """Catalog entry for a saved profile file (see services/profiles.py)."""

    name: str
    description: str | None = None
    # Single-letter ids (Chaster WOF codes); legacy profiles live at the
    # root of the profile directory, custom ones under `custom/`
    legacy: bool = False
    unit_count: int = 0
    # Valid UNIT names included in the profile (threads_settings keys)
    units: list[str] = []
    ramp_count: int = 0
    modified_at: str | None = None
    # Provenance recorded in the profile file
    created_by: str | None = None
    updated_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    # Resolved per-ramp detail (ramps a profile apply would skip are omitted)
    ramps: list[ProfileRampPreview] = []
    # Optional apply defaults stored in the profile (`defaults` block)
    defaults: ProfileDefaults | None = None


class ProfileDetail(WireModel):
    """Reply to `profiles:detail`: the editable content of one profile."""

    name: str
    description: str | None = None
    legacy: bool = False
    # Raw per-unit blocks (UNIT1..3), exactly as stored — unknown keys kept
    threads_settings: dict[str, dict[str, Any]] = {}
    defaults: ProfileDefaults | None = None
    # Usage vocabulary and level limits (configurations/usage_limit.json)
    usage_limits: dict[str, UsageLimit] = {}
    usage_names: list[str] = []
    # Fallback unit blocks for units absent from the profile (init config)
    unit_defaults: dict[str, dict[str, Any]] = {}
    modified_at: str | None = None
    created_by: str | None = None
    updated_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ActiveProfile(WireModel):
    """The profile currently applied by the action executor (None when idle)."""

    name: str
    level_pct: int
    queue_item_id: str
    started_at: str
    ends_at: str | None = None
    # Units the profile targets (keys of its threads_settings block)
    units: list[str] | None = None


class PendingProfile(WireModel):
    """A waiting PROFILE item in the action queue (not started yet)."""

    id: str
    name: str
    level_pct: int = 100
    duration: int = -1
    units: list[str] = []
    origin: str = ""
    display_name: str | None = None
    created_at: str | None = None


class CommandResult(WireModel):
    status: str
    message: str | None = None
    # Present on trigger_rules:create / trigger_rules:edit replies
    rule: TriggerRule | None = None
    # Present on training mutation replies (create/update/start/edge/end)
    session: EdgingSession | None = None
    edge: EdgingEdge | None = None
    # Present on Lovense mutation replies
    node_id: str | None = None
    token: str | None = None
    run_id: str | None = None
    pattern_id: str | None = None


class StatusMessage(WireModel):
    status: str
    message: str


# ─────────────────────────────── Integrations ───────────────────────────────


class IntegrationEvent(WireModel):
    """One triggerable event contributed by an integration."""

    id: str
    label: str
    description: str
    # Optional display subgroup (e.g. "Pillory", "Votes"); "" = ungrouped
    group: str = ""
    # False = the event is ignored by the dispatcher (rule pipeline only)
    enabled: bool = True
    data_schema: dict[str, str]
    # Optional preview shown by the event picker (e.g. a PuryFi scan thumbnail)
    image_url: str | None = None


class IntegrationAction(WireModel):
    """One action type contributed by an integration."""

    id: str
    label: str
    description: str
    group: str = ""
    # False = trigger rules may not run this action (manual paths unaffected)
    enabled: bool = True
    payload_schema: dict[str, str]
    reversible: bool
    # True = applies immediately and does not stay in the queue for a duration
    one_shot: bool = False


class IntegrationSetting(WireModel):
    """Declaration of one integration setting (source env = read-only)."""

    key: str
    label: str
    description: str
    type: str
    source: str
    secret: bool
    options: list[str]


class IntegrationCatalogEntry(WireModel):
    """One integration with everything it contributes + its enabled state."""

    id: str
    name: str
    description: str
    kind: str
    enabled: bool
    # user-facing connection URI (e.g. the PuryFi plugin WebSocket URL)
    endpoint: str | None = None
    events: list[IntegrationEvent]
    actions: list[IntegrationAction]
    settings: list[IntegrationSetting]


# ─────────────────────────────── Training ───────────────────────────────

TrainingNotificationLevel = Literal[
    "all", "edges", "failures", "summary", "none"
]
TrainingVisibility = Literal["private", "everyone"]


class EdgingGoal(WireModel):
    type: str
    value: int


class TrainingGuidedConfig(WireModel):
    """Optional hardware automation for a guided edging session.

    Every level is a profile level percentage capped by ``max_level_pct``
    (itself capped at 100). The config is only active in guided mode.
    """

    enabled: bool = False
    profile: str | None = None
    start_level_pct: int = Field(default=60, ge=0, le=100)
    phase_step_pct: int = Field(default=0, ge=0, le=30)
    max_level_pct: int = Field(default=80, ge=0, le=100)
    edge_drop_pct: int = Field(default=0, ge=0, le=50)
    edge_cooldown_seconds: int = Field(default=0, ge=0, le=3600)
    restore_after_cooldown: bool = True
    reward_profile: str | None = None
    reward_level_pct: int = Field(default=80, ge=0, le=100)
    fail_profile: str | None = None
    fail_level_pct: int = Field(default=40, ge=0, le=100)
    neutralize_on_fail: bool = True


class EdgingEdge(WireModel):
    id: str
    session_id: str
    difficulty: str
    outcome: str
    recorded_by: str
    source: str
    interval_seconds: int | None
    level_snapshot: dict[str, Any] | None
    note: str | None
    client_edge_id: str | None
    recorded_at: datetime


class EdgingSessionSummary(WireModel):
    """Public session state (broadcasts, lists, live snapshots).

    Deliberately excludes private fields such as ``notes``; those are only
    returned by the personal ``training:session_detail`` reply.
    """

    id: str
    name: str
    goals: list[EdgingGoal]
    auto_stop_on_goal: bool
    initiator: str
    status: str
    rating: int | None
    app_session_id: str | None
    program_id: str | None
    program_step: int | None
    mode: str
    guided_config: TrainingGuidedConfig | None
    # Minimum seconds between two successful edges (0 disables the cooldown).
    min_edge_interval_seconds: int
    notification_level: TrainingNotificationLevel
    allow_partner_edges: bool
    visibility: TrainingVisibility
    paused_at: datetime | None
    total_paused_seconds: int
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    # Derived: successful edges so far, active seconds, and whether every
    # goal is currently reached.
    edge_count: int
    duration_seconds: int | None
    goals_met: bool
    # Timestamp of the latest successful edge (client-side cooldown countdown).
    last_edge_at: datetime | None


class EdgingSession(EdgingSessionSummary):
    """Full session document, including the private Host-authored fields."""

    initiator_user_id: str | None
    created_by: str
    participant_ids: list[str]
    notes: str | None


class TrainingParticipant(WireModel):
    """User that can be added to a training session or template."""

    id: str
    display_name: str | None
    is_guest: bool = False


class TrainingTemplate(WireModel):
    id: str
    name: str
    goals: list[EdgingGoal]
    auto_stop_on_goal: bool
    mode: str
    guided_config: TrainingGuidedConfig | None
    participant_ids: list[str]
    min_edge_interval_seconds: int
    notification_level: TrainingNotificationLevel
    allow_partner_edges: bool
    visibility: TrainingVisibility
    created_by: str
    created_at: datetime


class TrainingProgramStep(WireModel):
    name: str
    goals: list[EdgingGoal]
    auto_stop_on_goal: bool


class TrainingProgram(WireModel):
    id: str
    name: str
    description: str | None
    steps: list[TrainingProgramStep]
    created_by: str
    created_at: datetime
    # Whole-program goals: sessions succeeded and/or cumulative active time.
    goals: list[EdgingGoal]
    # Derived progress across every user's sessions in this program.
    sessions_succeeded: int
    duration_seconds: int
    goals_met: bool
    completed_steps: int
    completed_step_indices: list[int]
    step_count: int
    next_step: int | None
    completed: bool
    # Optional profile applied automatically once the program completes.
    reward_profile: str | None
    reward_level_pct: int
    rewarded_at: datetime | None


class TrainingTrendPoint(WireModel):
    session_id: str
    name: str
    status: str
    ended_at: datetime
    duration_seconds: int | None
    edges: int
    edges_per_minute: float | None
    rating: int | None


class TrainingDailyPoint(WireModel):
    date: str
    sessions: int
    edges: int
    duration_seconds: int


class TrainingIntervalBucket(WireModel):
    label: str
    count: int


class TrainingRecords(WireModel):
    longest_duration_seconds: int | None
    most_edges: int | None
    best_edges_per_minute: float | None
    best_rating: int | None
    current_streak_days: int
    best_streak_days: int


class TrainingAnalytics(WireModel):
    overview: TrainingOverviewStats
    trend: list[TrainingTrendPoint]
    daily: list[TrainingDailyPoint]
    interval_buckets: list[TrainingIntervalBucket]
    records: TrainingRecords


class TrainingOverviewStats(WireModel):
    """Aggregate stats for the whole Training module (see overview page)."""

    total_sessions: int
    ended_sessions: int
    succeeded_sessions: int
    failed_sessions: int
    cancelled_sessions: int
    interrupted_sessions: int
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
    # None on sessions created before per-session integration scoping.
    integration_ids: list[str] | None = None
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
    edging_sessions: list[EdgingSessionSummary] | None
    events: list[TriggeredEvent] | None


# ─────────────────────────────── Lovense ───────────────────────────────


class LovenseTarget(WireModel):
    """Device selector shared by commands and action payloads."""

    device_ids: list[str] = []
    tags: list[str] = []
    node_ids: list[str] = []
    all: bool = False


class LovenseFeatureOutput(WireModel):
    min: int = 0
    max: int = 1
    duration: list[int] | None = None


class LovenseFeature(WireModel):
    index: int
    description: str = ""
    outputs: dict[str, LovenseFeatureOutput] = {}
    inputs: dict[str, dict[str, Any]] = {}


class LovenseNodeInfo(WireModel):
    id: str
    name: str
    kind: str
    url: str | None = None
    status: str = "offline"
    latency_ms: float | None = None
    scanning: bool = False
    last_error: str | None = None
    token_prefix: str | None = None
    devices: int = 0


class LovenseOutputValue(WireModel):
    feature_index: int
    output: str
    value: int


class LovenseDeviceInfo(WireModel):
    id: str
    node_id: str
    device_index: int
    name: str
    alias: str | None = None
    display_name: str
    tags: list[str] = []
    features: list[LovenseFeature] = []
    battery_pct: int | None = None
    rssi: int | None = None
    max_intensity_pct: int = 100
    control_policy: str = "owner_only"
    owner_user_id: str | None = None
    enabled: bool = True
    online: bool = False
    outputs: list[LovenseOutputValue] = []


class LovenseRunInfo(WireModel):
    id: str
    pattern_id: str | None = None
    pattern_name: str = ""
    status: str = "running"
    targets: dict[str, Any] = {}
    options: dict[str, Any] = {}
    origin: str = ""
    created_by: str = "system"
    queue_item_id: str | None = None
    elapsed_s: float = 0
    loops: int = 0
    error: str | None = None


class LovensePatternSummary(WireModel):
    id: str
    name: str
    description: str = ""
    author_id: str = "system"
    visibility: str = "private"
    tags: list[str] = []
    built_in: bool = False
    duration_ms: int = 0
    updated_at: str | None = None


class LovensePatternDetail(LovensePatternSummary):
    definition: dict[str, Any] = {}


class LovenseIntifaceStatus(WireModel):
    status: str = "stopped"
    running: bool = False
    owned: bool = False
    external: bool = False
    port: int = 12345
    path: str | None = None
    pid: int | None = None
    last_error: str | None = None
    log_path: str | None = None


class LovenseHealth(WireModel):
    status: str = "idle"
    nodes: int = 0
    nodes_online: int = 0
    devices: int = 0
    devices_online: int = 0
    runs: int = 0
    relay_enabled: bool = False
    latency_ms: float | None = None
    intiface: LovenseIntifaceStatus | None = None


class LovensePublicSettings(WireModel):
    max_intensity_pct: int = 70
    pattern_tick_hz: int = 20
    manual_hold_seconds: int = 60
    relay_enabled: bool = False


class LovenseSnapshot(WireModel):
    nodes: list[LovenseNodeInfo] = []
    devices: list[LovenseDeviceInfo] = []
    runs: list[LovenseRunInfo] = []
    patterns: list[LovensePatternSummary] = []
    health: LovenseHealth = LovenseHealth()
    intiface: LovenseIntifaceStatus | None = None
    settings: LovensePublicSettings = LovensePublicSettings()


class LovenseError(WireModel):
    scope: str
    message: str
    node_id: str | None = None
    device_id: str | None = None


class LovensePatternDeleted(WireModel):
    id: str


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
    "ProfileRampPreview",
    "ProfileDefaults",
    "ProfileSummary",
    "ProfileDetail",
    "ActiveProfile",
    "PendingProfile",
    "CommandResult",
    "StatusMessage",
    "IntegrationEvent",
    "IntegrationAction",
    "IntegrationSetting",
    "IntegrationCatalogEntry",
    "EdgingGoal",
    "EdgingEdge",
    "EdgingSessionSummary",
    "EdgingSession",
    "TrainingVisibility",
    "TrainingParticipant",
    "TrainingTemplate",
    "TrainingProgramStep",
    "TrainingProgram",
    "TrainingTrendPoint",
    "TrainingDailyPoint",
    "TrainingIntervalBucket",
    "TrainingRecords",
    "TrainingAnalytics",
    "TrainingOverviewStats",
    "EdgingSessionStats",
    "SessionUnitId",
    "SessionSensorId",
    "Session",
    "SessionHistoryItem",
    "SessionHistoryDetail",
    "LovenseTarget",
    "LovenseFeatureOutput",
    "LovenseFeature",
    "LovenseNodeInfo",
    "LovenseOutputValue",
    "LovenseDeviceInfo",
    "LovenseRunInfo",
    "LovensePatternSummary",
    "LovensePatternDetail",
    "LovenseHealth",
    "LovenseIntifaceStatus",
    "LovensePublicSettings",
    "LovenseSnapshot",
    "LovenseError",
    "LovensePatternDeleted",
]
