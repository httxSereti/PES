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
    step: int
    mode: RampMode
    duration: float
    elapsed: float
    paused: bool
    progress: int
    value: int


class CommandResult(WireModel):
    status: str
    message: str | None = None
    # Present on trigger_rules:create / trigger_rules:edit replies
    rule: TriggerRule | None = None


class StatusMessage(WireModel):
    status: str
    message: str


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
]
