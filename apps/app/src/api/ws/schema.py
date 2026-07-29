"""
Versioned WebSocket contract — single source of truth.

Every `{type, payload}` message exchanged on `/ws` is declared here as a
pydantic model. The TypeScript contract
(`apps/front/src/types/websocket.generated.ts`) is generated from this file:

    uv run python scripts/generate_ws_types.py      # or: pnpm codegen:ws

Bump `WS_SCHEMA_VERSION` on any breaking change. The version is sent to
clients in the `connected` handshake payload as `schemaVersion`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from events.enums import ActionType

WS_SCHEMA_VERSION = 1


class TsType(str):
    """
    Codegen metadata (`Annotated[X, TsType("...")]`): the TypeScript generator
    emits this type verbatim instead of mapping the annotated Python type.
    At runtime the annotation behaves like the plain underlying type.
    """


class WireModel(BaseModel):
    """Base for wire models: tolerate extra keys to avoid false contract failures."""

    model_config = ConfigDict(extra="allow")


# ────────────────────────── Shared payload models ──────────────────────────

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
    description: str


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


class CommandResult(WireModel):
    status: str
    message: str | None = None


class StatusMessage(WireModel):
    status: str
    message: str


# ───────────────────────── Client → server commands ─────────────────────────


class ClientMessage(BaseModel):
    id: str | None = None


class PingCommand(ClientMessage):
    type: Literal["ping"] = "ping"


class CoreStopCommand(ClientMessage):
    type: Literal["core:stop"] = "core:stop"
    payload: dict[str, Any] | None = None


class SensorsUpdateCommand(ClientMessage):
    type: Literal["sensors:update"] = "sensors:update"
    payload: dict[str, SensorPatch]


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


# ───────────────────────── Server → client messages ─────────────────────────


class ServerMessage(BaseModel):
    id: str | None = None


class ConnectedPayload(WireModel):
    message: str
    userId: str
    schemaVersion: int


class ConnectedMessage(ServerMessage):
    type: Literal["connected"] = "connected"
    payload: ConnectedPayload


class PingMessage(ServerMessage):
    type: Literal["ping"] = "ping"


class PongMessage(ServerMessage):
    type: Literal["pong"] = "pong"


class CommandMessage(ServerMessage):
    """Response envelope for client commands (`{id, type: "command"}`)."""

    type: Literal["command"] = "command"
    payload: CommandResult


class SensorsInitMessage(ServerMessage):
    type: Literal["sensors:init"] = "sensors:init"
    payload: dict[str, Sensor]


class SensorUpdatePayload(WireModel):
    id: str
    changes: SensorPatch
    partial: bool | None = None


class SensorsUpdateMessage(ServerMessage):
    type: Literal["sensors:update"] = "sensors:update"
    payload: SensorUpdatePayload


class UnitsInitMessage(ServerMessage):
    type: Literal["units:init"] = "units:init"
    payload: dict[str, UnitSettings]


class UnitUpdatePayload(WireModel):
    id: str
    changes: UnitSettingsPatch


class UnitsUpdateMessage(ServerMessage):
    type: Literal["units:update"] = "units:update"
    payload: UnitUpdatePayload


class CoreStopMessage(ServerMessage):
    type: Literal["core:stop"] = "core:stop"
    payload: StatusMessage


class EventsHistoryMessage(ServerMessage):
    type: Literal["events:history"] = "events:history"
    payload: list[TriggeredEvent]


class EventsTriggeredMessage(ServerMessage):
    type: Literal["events:triggered"] = "events:triggered"
    payload: TriggeredEvent


class QueueUpdateMessage(ServerMessage):
    type: Literal["queue:update"] = "queue:update"
    payload: QueueStatus


class TriggerRulesLoadMessage(ServerMessage):
    type: Literal["trigger_rules:load"] = "trigger_rules:load"
    payload: list[TriggerRule]


class TriggerRulesLoadLabelsMessage(ServerMessage):
    type: Literal["trigger_rules:load_labels"] = "trigger_rules:load_labels"
    payload: list[TriggerRuleLabel]


class TriggerRuleBroadcastPayload(WireModel):
    id: str
    changes: TriggerRulePatch


class TriggerRulesUpdateMessage(ServerMessage):
    type: Literal["trigger_rules:update"] = "trigger_rules:update"
    payload: TriggerRuleBroadcastPayload


class TriggerRuleCreatedPayload(WireModel):
    rule: TriggerRule


class TriggerRulesCreateMessage(ServerMessage):
    type: Literal["trigger_rules:create"] = "trigger_rules:create"
    payload: TriggerRuleCreatedPayload


class TriggerRulesCreateLabelMessage(ServerMessage):
    type: Literal["trigger_rules:create_label"] = "trigger_rules:create_label"
    payload: TriggerRuleLabel


class TriggerRuleDeletedPayload(WireModel):
    id: str


class TriggerRulesDeleteMessage(ServerMessage):
    type: Literal["trigger_rules:delete"] = "trigger_rules:delete"
    payload: TriggerRuleDeletedPayload


# ─────────────────────────────── Registries ────────────────────────────────

CLIENT_MESSAGE_MODELS = [
    PingCommand,
    CoreStopCommand,
    SensorsUpdateCommand,
    UnitsUpdateLevelCommand,
    UnitsUpdateModeCommand,
    UnitsUpdatePowerModeCommand,
    UnitsUpdateAdjCommand,
    TriggerRulesUpdateCommand,
    TriggerRulesCreateCommand,
    TriggerRulesEditCommand,
    TriggerRulesDeleteCommand,
]

SERVER_MESSAGE_MODELS = [
    ConnectedMessage,
    PingMessage,
    PongMessage,
    CommandMessage,
    SensorsInitMessage,
    SensorsUpdateMessage,
    UnitsInitMessage,
    UnitsUpdateMessage,
    CoreStopMessage,
    EventsHistoryMessage,
    EventsTriggeredMessage,
    QueueUpdateMessage,
    TriggerRulesLoadMessage,
    TriggerRulesLoadLabelsMessage,
    TriggerRulesUpdateMessage,
    TriggerRulesCreateMessage,
    TriggerRulesCreateLabelMessage,
    TriggerRulesDeleteMessage,
]

InboundMessage = Annotated[
    Union[tuple(CLIENT_MESSAGE_MODELS)],  # type: ignore[valid-type]  # noqa: UP007
    Field(discriminator="type"),
]
OutboundMessage = Annotated[
    Union[tuple(SERVER_MESSAGE_MODELS)],  # type: ignore[valid-type]  # noqa: UP007
    Field(discriminator="type"),
]
