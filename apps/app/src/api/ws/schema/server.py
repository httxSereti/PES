"""
Server → client messages (events, loaders, keepalive), grouped by domain.

Every model self-registers with `@server_message(audience=...)`: the
audience is the Permission a connection must hold to receive the message
(None = public). Registration feeds SERVER_MESSAGE_MODELS, MESSAGE_AUDIENCE,
the audience-filtered broadcast, and the generated TypeScript contract.
"""

from __future__ import annotations

from typing import Literal

from typings import Permission

from .base import ServerMessage, WireModel, server_message
from .models import (
    CommandResult,
    QueueStatus,
    Ramp,
    Sensor,
    SensorPatch,
    StatusMessage,
    TriggeredEvent,
    TriggerRule,
    TriggerRuleLabel,
    TriggerRulePatch,
    UnitSettings,
    UnitSettingsPatch,
)

# ─────────────────────────────── Core ───────────────────────────────


class ConnectedPayload(WireModel):
    message: str
    userId: str
    schemaVersion: int


@server_message(audience=None)
class ConnectedMessage(ServerMessage):
    type: Literal["connected"] = "connected"
    payload: ConnectedPayload


@server_message(audience=None)
class PingMessage(ServerMessage):
    type: Literal["ping"] = "ping"


@server_message(audience=None)
class PongMessage(ServerMessage):
    type: Literal["pong"] = "pong"


@server_message(audience=None)
class AuthRefreshMessage(ServerMessage):
    """Nudge telling the client to re-fetch its profile (`GET /auth/me`)."""

    type: Literal["auth:refresh"] = "auth:refresh"


@server_message(audience=None)
class CommandMessage(ServerMessage):
    """Response envelope for client commands (`{id, type: "command"}`)."""

    type: Literal["command"] = "command"
    payload: CommandResult


# ─────────────────────────────── Sensors ───────────────────────────────


@server_message(audience=Permission.READ_SENSORS)
class SensorsInitMessage(ServerMessage):
    type: Literal["sensors:init"] = "sensors:init"
    payload: dict[str, Sensor]


class SensorUpdatePayload(WireModel):
    id: str
    changes: SensorPatch
    partial: bool | None = None


@server_message(audience=Permission.READ_SENSORS)
class SensorsUpdateMessage(ServerMessage):
    type: Literal["sensors:update"] = "sensors:update"
    payload: SensorUpdatePayload


# ─────────────────────────────── Units ───────────────────────────────


@server_message(audience=Permission.READ_UNITS)
class UnitsInitMessage(ServerMessage):
    type: Literal["units:init"] = "units:init"
    payload: dict[str, UnitSettings]


class UnitUpdatePayload(WireModel):
    id: str
    changes: UnitSettingsPatch


@server_message(audience=Permission.READ_UNITS)
class UnitsUpdateMessage(ServerMessage):
    type: Literal["units:update"] = "units:update"
    payload: UnitUpdatePayload


# ─────────────────────────────── Ramps ───────────────────────────────


@server_message(audience=Permission.READ_UNITS)
class RampsInitMessage(ServerMessage):
    type: Literal["ramps:init"] = "ramps:init"
    payload: list[Ramp]


@server_message(audience=Permission.READ_UNITS)
class RampsUpdateMessage(ServerMessage):
    type: Literal["ramps:update"] = "ramps:update"
    payload: Ramp


class RampRemovePayload(WireModel):
    unit: str
    field: str


@server_message(audience=Permission.READ_UNITS)
class RampsRemoveMessage(ServerMessage):
    type: Literal["ramps:remove"] = "ramps:remove"
    payload: RampRemovePayload


# ─────────────────────────────── Hardware ───────────────────────────────

@server_message(audience=Permission.READ_SENSORS)
class HardwareInitMessage(ServerMessage):
    """Per-device hardware enable flags (`{"UNIT1": true, "sound": false, ...}`)."""

    type: Literal["hardware:init"] = "hardware:init"
    payload: dict[str, bool]


@server_message(audience=Permission.READ_SENSORS)
class HardwareUpdateMessage(ServerMessage):
    type: Literal["hardware:update"] = "hardware:update"
    payload: dict[str, bool]


# ─────────────────────────────── Core (cont.) ───────────────────────────────


@server_message(audience=Permission.READ_UNITS)
class CoreStopMessage(ServerMessage):
    type: Literal["core:stop"] = "core:stop"
    payload: StatusMessage


# ─────────────────────────────── Events ───────────────────────────────


@server_message(audience=Permission.READ_EVENTS)
class EventsHistoryMessage(ServerMessage):
    type: Literal["events:history"] = "events:history"
    payload: list[TriggeredEvent]


@server_message(audience=Permission.READ_EVENTS)
class EventsTriggeredMessage(ServerMessage):
    type: Literal["events:triggered"] = "events:triggered"
    payload: TriggeredEvent


# ─────────────────────────────── Queue ───────────────────────────────


@server_message(audience=Permission.ADMIN)
class QueueUpdateMessage(ServerMessage):
    type: Literal["queue:update"] = "queue:update"
    payload: QueueStatus


# ─────────────────────────────── Trigger rules ───────────────────────────────


@server_message(audience=Permission.ADMIN)
class TriggerRulesLoadMessage(ServerMessage):
    type: Literal["trigger_rules:load"] = "trigger_rules:load"
    payload: list[TriggerRule]


@server_message(audience=Permission.ADMIN)
class TriggerRulesLoadLabelsMessage(ServerMessage):
    type: Literal["trigger_rules:load_labels"] = "trigger_rules:load_labels"
    payload: list[TriggerRuleLabel]


class TriggerRuleBroadcastPayload(WireModel):
    id: str
    changes: TriggerRulePatch


@server_message(audience=Permission.ADMIN)
class TriggerRulesUpdateMessage(ServerMessage):
    type: Literal["trigger_rules:update"] = "trigger_rules:update"
    payload: TriggerRuleBroadcastPayload


class TriggerRuleCreatedPayload(WireModel):
    rule: TriggerRule


@server_message(audience=Permission.ADMIN)
class TriggerRulesCreateMessage(ServerMessage):
    type: Literal["trigger_rules:create"] = "trigger_rules:create"
    payload: TriggerRuleCreatedPayload


@server_message(audience=Permission.ADMIN)
class TriggerRulesCreateLabelMessage(ServerMessage):
    type: Literal["trigger_rules:create_label"] = "trigger_rules:create_label"
    payload: TriggerRuleLabel


class TriggerRuleDeletedPayload(WireModel):
    id: str


@server_message(audience=Permission.ADMIN)
class TriggerRulesDeleteMessage(ServerMessage):
    type: Literal["trigger_rules:delete"] = "trigger_rules:delete"
    payload: TriggerRuleDeletedPayload


__all__ = [
    "ConnectedPayload",
    "ConnectedMessage",
    "PingMessage",
    "PongMessage",
    "AuthRefreshMessage",
    "CommandMessage",
    "SensorsInitMessage",
    "SensorUpdatePayload",
    "SensorsUpdateMessage",
    "UnitsInitMessage",
    "UnitUpdatePayload",
    "UnitsUpdateMessage",
    "RampsInitMessage",
    "RampsUpdateMessage",
    "RampRemovePayload",
    "RampsRemoveMessage",
    "HardwareInitMessage",
    "HardwareUpdateMessage",
    "CoreStopMessage",
    "EventsHistoryMessage",
    "EventsTriggeredMessage",
    "QueueUpdateMessage",
    "TriggerRulesLoadMessage",
    "TriggerRulesLoadLabelsMessage",
    "TriggerRuleBroadcastPayload",
    "TriggerRulesUpdateMessage",
    "TriggerRuleCreatedPayload",
    "TriggerRulesCreateMessage",
    "TriggerRulesCreateLabelMessage",
    "TriggerRuleDeletedPayload",
    "TriggerRulesDeleteMessage",
]
