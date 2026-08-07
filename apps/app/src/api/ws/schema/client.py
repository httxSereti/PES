"""
Client → server messages (commands + keepalive), grouped by domain.

Each command model is bound to its handler and permission by the `@command`
decorator in the handler's own file (api/ws/commands/<domain>/handle_*.py) —
this module declares wire shapes only.
"""

from __future__ import annotations

from typing import Any, Literal

from events.enums import ActionType
from typings import RampMode

from .base import ClientMessage, WireModel
from .models import SensorPatch

# ─────────────────────────────── Core ───────────────────────────────


class PingCommand(ClientMessage):
    type: Literal["ping"] = "ping"


class CoreStopCommand(ClientMessage):
    type: Literal["core:stop"] = "core:stop"
    payload: dict[str, Any] | None = None


# ─────────────────────────────── Sensors ───────────────────────────────


class SensorsUpdateCommand(ClientMessage):
    type: Literal["sensors:update"] = "sensors:update"
    payload: dict[str, SensorPatch]


# ─────────────────────────────── Units ───────────────────────────────


class UnitLevelChanges(WireModel):
    """MagicNumber expressions (`+5`, `[5-10]`, `%+5`, ...) per channel."""

    ch_A: str | None = None
    ch_B: str | None = None


class UnitsUpdateLevelCommand(ClientMessage):
    type: Literal["units:update_level"] = "units:update_level"
    payload: dict[str, UnitLevelChanges]


class UnitModeChange(WireModel):
    mode: int | None = None


class UnitsUpdateModeCommand(ClientMessage):
    type: Literal["units:update_mode"] = "units:update_mode"
    payload: dict[str, UnitModeChange]


class UnitPowerModeChange(WireModel):
    power_mode: Literal["L", "H", "D"] | None = None


class UnitsUpdatePowerModeCommand(ClientMessage):
    type: Literal["units:update_power_mode"] = "units:update_power_mode"
    payload: dict[str, UnitPowerModeChange]


class UnitAdjChange(WireModel):
    adj_1: float | None = None
    adj_2: float | None = None


class UnitsUpdateAdjCommand(ClientMessage):
    type: Literal["units:update_adj"] = "units:update_adj"
    payload: dict[str, UnitAdjChange]


# ─────────────────────────────── Ramps ───────────────────────────────


class RampTarget(WireModel):
    unit: Literal["UNIT1", "UNIT2", "UNIT3"]
    field: Literal["ch_A", "ch_B", "adj_1", "adj_2"]


class RampStartPayload(RampTarget):
    timer: float
    step: int = 1
    mode: RampMode = RampMode.RESET
    duration: float = -1  # seconds, -1 = permanent
    max_value: int | None = None  # defaults to the field's current level


class RampsStartCommand(ClientMessage):
    type: Literal["ramps:start"] = "ramps:start"
    payload: RampStartPayload


class RampsPauseCommand(ClientMessage):
    type: Literal["ramps:pause"] = "ramps:pause"
    payload: RampTarget


class RampsResumeCommand(ClientMessage):
    type: Literal["ramps:resume"] = "ramps:resume"
    payload: RampTarget


class RampStopPayload(RampTarget):
    restore: bool = True


class RampsStopCommand(ClientMessage):
    type: Literal["ramps:stop"] = "ramps:stop"
    payload: RampStopPayload


# ─────────────────────────────── Trigger rules ───────────────────────────────


class TriggerRuleUpdatePayload(WireModel):
    rule_id: str
    name: str | None = None
    description: str | None = None
    event_type: str | None = None
    enabled: bool | None = None
    priority: int | None = None


class TriggerRulesUpdateCommand(ClientMessage):
    type: Literal["trigger_rules:update"] = "trigger_rules:update"
    payload: TriggerRuleUpdatePayload


class TriggerActionDraft(WireModel):
    action_type: ActionType
    payload: dict[str, Any] = {}
    duration: int = -1
    cumulative: bool = False
    sort_order: int = 0


class TriggerRuleDraft(WireModel):
    name: str
    event_type: str
    description: str | None = None
    enabled: bool = True
    priority: int = 0
    actions: list[TriggerActionDraft] = []
    labels: list[str] = []


class TriggerRulesCreateCommand(ClientMessage):
    type: Literal["trigger_rules:create"] = "trigger_rules:create"
    payload: TriggerRuleDraft


class TriggerRuleEditDraft(TriggerRuleDraft):
    rule_id: str


class TriggerRulesEditCommand(ClientMessage):
    type: Literal["trigger_rules:edit"] = "trigger_rules:edit"
    payload: TriggerRuleEditDraft


class TriggerRuleDeletePayload(WireModel):
    rule_id: str


class TriggerRulesDeleteCommand(ClientMessage):
    type: Literal["trigger_rules:delete"] = "trigger_rules:delete"
    payload: TriggerRuleDeletePayload


# ─────────────────────────────── Hardware ───────────────────────────────


class HardwareMk2btUpdatePayload(WireModel):
    id: Literal["UNIT1", "UNIT2", "UNIT3"]
    enabled: bool


class HardwareUpdateMk2btCommand(ClientMessage):
    type: Literal["hardware:update_mk2bt"] = "hardware:update_mk2bt"
    payload: HardwareMk2btUpdatePayload


class HardwareMk2btRescanPayload(WireModel):
    id: Literal["UNIT1", "UNIT2", "UNIT3"]


class HardwareRescanMk2btCommand(ClientMessage):
    type: Literal["hardware:rescan_mk2bt"] = "hardware:rescan_mk2bt"
    payload: HardwareMk2btRescanPayload


class HardwareSensorUpdatePayload(WireModel):
    id: Literal["sound", "motion1", "motion2"]
    enabled: bool


class HardwareUpdateBtSensorsCommand(ClientMessage):
    type: Literal["hardware:update_bt_sensors"] = "hardware:update_bt_sensors"
    payload: HardwareSensorUpdatePayload


class HardwareSensorRescanPayload(WireModel):
    id: Literal["sound", "motion1", "motion2"]


class HardwareRescanBtSensorsCommand(ClientMessage):
    type: Literal["hardware:rescan_bt_sensors"] = "hardware:rescan_bt_sensors"
    payload: HardwareSensorRescanPayload


__all__ = [
    "PingCommand",
    "CoreStopCommand",
    "SensorsUpdateCommand",
    "UnitLevelChanges",
    "UnitsUpdateLevelCommand",
    "UnitModeChange",
    "UnitsUpdateModeCommand",
    "UnitPowerModeChange",
    "UnitsUpdatePowerModeCommand",
    "UnitAdjChange",
    "UnitsUpdateAdjCommand",
    "RampTarget",
    "RampStartPayload",
    "RampsStartCommand",
    "RampsPauseCommand",
    "RampsResumeCommand",
    "RampStopPayload",
    "RampsStopCommand",
    "TriggerRuleUpdatePayload",
    "TriggerRulesUpdateCommand",
    "TriggerActionDraft",
    "TriggerRuleDraft",
    "TriggerRulesCreateCommand",
    "TriggerRuleEditDraft",
    "TriggerRulesEditCommand",
    "TriggerRuleDeletePayload",
    "TriggerRulesDeleteCommand",
    "HardwareMk2btUpdatePayload",
    "HardwareUpdateMk2btCommand",
    "HardwareMk2btRescanPayload",
    "HardwareRescanMk2btCommand",
    "HardwareSensorUpdatePayload",
    "HardwareUpdateBtSensorsCommand",
    "HardwareSensorRescanPayload",
    "HardwareRescanBtSensorsCommand",
]
