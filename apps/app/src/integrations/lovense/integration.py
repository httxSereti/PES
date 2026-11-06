"""
Lovense — external integration (Buttplug / Intiface).

Events, actions and settings are declared here; the runtime lives in
`hub.py` (nodes, devices, ownership), `patterns.py` (profiles) and `relay.py`
(remote companions). The catalog is consumed by the trigger-rule UI, the
integrations page and `/api/events/*`.
"""

from __future__ import annotations

from typing import Any

import structlog

from events.enums import ActionType, TriggerableEvent
from integrations.base import (
    ActionDef,
    EventDef,
    Integration,
    IntegrationContext,
    IntegrationKind,
    SettingDef,
    SettingType,
)

from .actions import LovenseActionHandler
from .hub import LovenseHub

logger = structlog.get_logger("pes")

_DEVICE_FIELDS = {
    "device_id": "PES device id",
    "node_id": "node the device belongs to",
    "name": "Buttplug device name",
    "display_name": "alias when set, otherwise name",
    "features": "outputs and inputs advertised by Buttplug",
}

_EVENTS = [
    EventDef(
        id=TriggerableEvent.LOVENSE_NODE_ONLINE.value,
        label="Node online",
        description="A Buttplug server (Intiface) connected.",
        group="Connection",
        data_schema={
            "node_id": "node id",
            "name": "node name",
            "kind": "direct or relay",
            "latency_ms": "handshake latency",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_NODE_OFFLINE.value,
        label="Node offline",
        description="A Buttplug server disconnected or failed.",
        group="Connection",
        data_schema={
            "node_id": "node id",
            "name": "node name",
            "reason": "disconnect reason",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_DEVICE_CONNECTED.value,
        label="Device connected",
        description="A Buttplug device was discovered.",
        group="Devices",
        data_schema=_DEVICE_FIELDS,
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_DEVICE_DISCONNECTED.value,
        label="Device disconnected",
        description="A Buttplug device was removed or its node was lost.",
        group="Devices",
        data_schema=_DEVICE_FIELDS,
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_BATTERY_LOW.value,
        label="Battery low",
        description="A device battery reached the low threshold.",
        group="Battery",
        data_schema={
            "device_id": "device id",
            "name": "device display name",
            "battery_pct": "battery percentage",
            "threshold": "configured threshold",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_BATTERY_CHARGED.value,
        label="Battery charged",
        description="A device battery came back above the threshold.",
        group="Battery",
        data_schema={
            "device_id": "device id",
            "name": "device display name",
            "battery_pct": "battery percentage",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_PATTERN_STARTED.value,
        label="Pattern started",
        description="A Lovense pattern started playing.",
        group="Patterns",
        data_schema={
            "run_id": "run id",
            "pattern_id": "pattern id",
            "pattern_name": "pattern name",
            "targets": "resolved target selector",
            "origin": "who/what started it",
            "duration": "duration in seconds (-1 = permanent)",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_PATTERN_COMPLETED.value,
        label="Pattern completed",
        description="A Lovense pattern reached its natural end.",
        group="Patterns",
        data_schema={
            "run_id": "run id",
            "pattern_id": "pattern id",
            "pattern_name": "pattern name",
            "elapsed_s": "active duration",
            "loops": "completed loops",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_PATTERN_STOPPED.value,
        label="Pattern stopped",
        description="A Lovense pattern was stopped before its end.",
        group="Patterns",
        data_schema={
            "run_id": "run id",
            "pattern_id": "pattern id",
            "pattern_name": "pattern name",
            "reason": "stop reason",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_OUTPUT_LIMITED.value,
        label="Output limited",
        description="A command was clamped by the global or device cap.",
        group="Safety",
        data_schema={
            "device_id": "device id",
            "name": "device display name",
            "output": "output type",
            "requested_pct": "requested percentage",
            "applied_pct": "applied percentage",
            "cap_pct": "active cap",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_MANUAL_RELEASED.value,
        label="Manual hold released",
        description="Manual control stopped sending heartbeats; outputs were zeroed.",
        group="Safety",
        data_schema={
            "device_id": "device id",
            "name": "device display name",
            "output": "output type",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_SCAN_FINISHED.value,
        label="Scan finished",
        description="A Buttplug device scan finished.",
        group="Devices",
        data_schema={"node_id": "node id", "found": "devices found"},
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_DEVICE_ERROR.value,
        label="Device error",
        description="A Buttplug command failed.",
        group="Errors",
        data_schema={
            "device_id": "device id",
            "node_id": "node id",
            "message": "error message",
        },
    ),
    EventDef(
        id=TriggerableEvent.LOVENSE_NODE_LATENCY_HIGH.value,
        label="Node latency high",
        description="A node exceeded the latency warning threshold.",
        group="Errors",
        data_schema={
            "node_id": "node id",
            "name": "node name",
            "latency_ms": "measured latency",
            "threshold": "configured threshold",
        },
    ),
]

_SETTINGS = [
    SettingDef(
        key="auto_connect",
        label="Connect at startup",
        type=SettingType.BOOL,
        default=True,
        description="Connect enabled nodes when PES starts",
    ),
    SettingDef(
        key="auto_scan",
        label="Scan after connect",
        type=SettingType.BOOL,
        default=True,
        description="Automatically scan for devices after a node connects",
    ),
    SettingDef(
        key="managed_intiface_enabled",
        label="Manage Intiface",
        type=SettingType.BOOL,
        default=True,
        description="Let PES launch Intiface Engine automatically",
    ),
    SettingDef(
        key="managed_intiface_port",
        label="Intiface port",
        type=SettingType.INT,
        default=12345,
        description="Local port used by the managed Intiface server (restart required)",
    ),
    SettingDef(
        key="intiface_engine_path",
        label="Intiface Engine path",
        type=SettingType.STR,
        default="",
        description="Optional intiface-engine binary path, auto-detected when empty (restart required)",
    ),
    SettingDef(
        key="intiface_extra_args",
        label="Intiface extra args",
        type=SettingType.STR,
        default="--use-bluetooth-le",
        description="Extra command-line arguments for intiface-engine (restart required)",
    ),
    SettingDef(
        key="managed_intiface_auto_restart",
        label="Restart Intiface",
        type=SettingType.BOOL,
        default=True,
        description="Restart the managed engine if it exits unexpectedly",
    ),
    SettingDef(
        key="managed_intiface_auto_download",
        label="Download Intiface Engine",
        type=SettingType.BOOL,
        default=True,
        description=(
            "Download the official standalone intiface-engine binary when no "
            "installation is found (SHA-256 verified)"
        ),
    ),
    SettingDef(
        key="scan_seconds",
        label="Scan duration (s)",
        type=SettingType.INT,
        default=10,
        description="Default device scan duration",
    ),
    SettingDef(
        key="pattern_tick_hz",
        label="Pattern tick rate (Hz)",
        type=SettingType.INT,
        default=20,
        description="Pattern sampling rate (max 30)",
    ),
    SettingDef(
        key="command_rate_limit",
        label="Command rate limit (/s)",
        type=SettingType.INT,
        default=20,
        description="Maximum manual commands per second per user",
    ),
    SettingDef(
        key="battery_poll_seconds",
        label="Battery poll (s)",
        type=SettingType.INT,
        default=120,
        description="How often to read device batteries",
    ),
    SettingDef(
        key="battery_low_pct",
        label="Low battery (%)",
        type=SettingType.INT,
        default=15,
        description="Emit a low-battery event at or below this level",
    ),
    SettingDef(
        key="default_max_intensity_pct",
        label="Global intensity cap (%)",
        type=SettingType.INT,
        default=70,
        description="Hard server-side cap applied to every output",
    ),
    SettingDef(
        key="manual_hold_seconds",
        label="Manual hold (s)",
        type=SettingType.INT,
        default=60,
        description="Zero outputs when manual control stops sending commands",
    ),
    SettingDef(
        key="default_pattern_max_minutes",
        label="Max pattern duration (min)",
        type=SettingType.INT,
        default=30,
        description="Safety limit for a single pattern run",
    ),
    SettingDef(
        key="relay_enabled",
        label="Enable relay",
        type=SettingType.BOOL,
        default=True,
        description="Host the companion relay endpoint (restart required)",
    ),
    SettingDef(
        key="relay_public_url",
        label="Public relay URL",
        type=SettingType.STR,
        default="",
        description="wss:// URL shown to companions (e.g. wss://pes.example.com)",
    ),
    SettingDef(
        key="relay_max_nodes",
        label="Max relay nodes",
        type=SettingType.INT,
        default=10,
        description="Maximum simultaneous companion tunnels",
    ),
    SettingDef(
        key="relay_heartbeat_seconds",
        label="Relay heartbeat (s)",
        type=SettingType.INT,
        default=15,
        description="Companion heartbeat interval",
    ),
    SettingDef(
        key="latency_warn_ms",
        label="Latency warning (ms)",
        type=SettingType.INT,
        default=250,
        description="Emit an event above this command latency",
    ),
]


class LovenseIntegration(Integration):
    id = "lovense"
    name = "Lovense"
    description = (
        "Lovense and Buttplug-compatible toys over Intiface: unlimited devices, "
        "real-time control, patterns and remote companions."
    )
    kind = IntegrationKind.EXTERNAL

    def __init__(self) -> None:
        self._ctx: IntegrationContext | None = None
        self._hub = LovenseHub(self)
        self._handler = LovenseActionHandler(self._hub)
        self._actions = [
            ActionDef(
                id=ActionType.LOVENSE_SET.value,
                label="Set Lovense output",
                description=(
                    "Set vibration (or another output) on the targeted devices. "
                    "Values accept MagicNumber expressions (50, +10, %+10, [10-20])."
                ),
                group="Control",
                payload_schema={
                    "devices": "list of device ids or 'all'",
                    "tags": "list of tags",
                    "output": "Vibrate, Rotate, Oscillate, ... (default Vibrate)",
                    "feature": "feature index or 'all'",
                    "value": "MagicNumber expression (0-100)",
                    "mode": "expression (default), absolute, relative or percent",
                    "ramp_ms": "optional ramp duration in milliseconds",
                },
                reversible=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_PULSE.value,
                label="Lovense pulse",
                description="One attack/hold/release pulse, useful for rewards and punishments.",
                group="Control",
                payload_schema={
                    "devices": "list of device ids or 'all'",
                    "tags": "list of tags",
                    "output": "output type (default Vibrate)",
                    "value": "peak percentage (0-100)",
                    "attack_ms": "ramp up duration",
                    "hold_ms": "time at peak",
                    "release_ms": "ramp down duration",
                },
                one_shot=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_STOP.value,
                label="Stop Lovense output",
                description="Stop the targeted devices (all outputs or one output type).",
                group="Safety",
                payload_schema={
                    "devices": "list of device ids or 'all'",
                    "tags": "list of tags",
                    "output": "optional output type",
                },
                one_shot=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_PATTERN_PLAY.value,
                label="Play Lovense pattern",
                description="Play a saved Lovense profile (pattern) on the targeted devices.",
                group="Patterns",
                payload_schema={
                    "pattern_id": "pattern id",
                    "pattern_name": "pattern name (alternative to id)",
                    "devices": "list of device ids or 'all'",
                    "tags": "list of tags",
                    "duration": "seconds (-1 = until stopped)",
                    "loop": "loop the pattern",
                    "loop_count": "stop after N loops (0 = unlimited)",
                    "scale_pct": "intensity scale (0-150)",
                    "replace": "preempt an existing pattern",
                    "fade_in_ms": "fade-in duration",
                    "fade_out_ms": "fade-out duration",
                    "sync_offset_ms": "latency compensation",
                },
                reversible=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_PATTERN_STOP.value,
                label="Stop Lovense pattern",
                description="Stop one run, every run of a pattern, or every run.",
                group="Patterns",
                payload_schema={
                    "run_id": "optional run id",
                    "pattern_id": "optional pattern id",
                    "all": "stop every run (default when no id is given)",
                },
                one_shot=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_RANDOM_PATTERN.value,
                label="Play random Lovense pattern",
                description="Pick a random saved pattern (optionally filtered by tags) and play it.",
                group="Patterns",
                payload_schema={
                    "pattern_tags": "pattern tags to choose from",
                    "devices": "list of device ids or 'all'",
                    "duration": "seconds (-1 = until stopped)",
                    "scale_pct": "intensity scale (0-150)",
                },
                reversible=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_SCAN.value,
                label="Scan Lovense devices",
                description="Start a device scan on one Buttplug node.",
                group="Setup",
                payload_schema={
                    "node_id": "node id",
                    "seconds": "scan duration",
                },
                one_shot=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_SET_CAP.value,
                label="Set Lovense intensity cap",
                description="Change the maximum output percentage of the targeted devices.",
                group="Safety",
                payload_schema={
                    "devices": "list of device ids or 'all'",
                    "tags": "list of tags",
                    "max_pct": "cap percentage (0-100)",
                },
                one_shot=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_ASSIGN.value,
                label="Assign Lovense devices",
                description="Set an alias and/or tags on the targeted devices.",
                group="Setup",
                payload_schema={
                    "devices": "list of device ids or 'all'",
                    "alias": "display name",
                    "new_tags": "list of tags",
                },
                one_shot=True,
                handler=self._handler,
            ),
            ActionDef(
                id=ActionType.LOVENSE_RECONNECT.value,
                label="Reconnect Lovense node",
                description="Ask one node (or every node) to reconnect.",
                group="Setup",
                payload_schema={"node_id": "optional node id"},
                one_shot=True,
                handler=self._handler,
            ),
        ]

    # ───────── Contribution surfaces ─────────

    def events(self) -> list[EventDef]:
        return list(_EVENTS)

    def actions(self) -> list[ActionDef]:
        return list(self._actions)

    def settings(self) -> list[SettingDef]:
        return list(_SETTINGS)

    # ───────── Runtime ─────────

    @property
    def ctx(self) -> IntegrationContext | None:
        return self._ctx

    @property
    def hub(self) -> LovenseHub:
        return self._hub

    def settings_values(self) -> dict[str, Any]:
        if self._ctx is None:
            return {}
        return self._ctx.registry.settings_values(self.id)

    def endpoint(self) -> str | None:
        public = str(self.settings_values().get("relay_public_url") or "").strip()
        if public:
            return public.rstrip("/") + "/lovense/relay"
        return "ws://127.0.0.1:12345"

    def router(self):
        from .router import router

        return router

    async def start(self, ctx: IntegrationContext) -> None:
        self._ctx = ctx
        try:
            await self._hub.start()
        except Exception:
            await self._hub.stop()
            raise
        logger.info("[Lovense] Integration started")

    async def stop(self) -> None:
        await self._hub.stop()
        self._ctx = None
        logger.info("[Lovense] Integration stopped")

    async def emergency_stop(self, reason: str) -> None:
        await self._hub.emergency_stop(reason)

    def on_enabled_changed(self, enabled: bool) -> None:
        self._hub.set_enabled(enabled)

    def health(self) -> dict[str, Any]:
        health = self._hub.health()
        relay = getattr(self._hub, "_relay", None)
        if relay is not None:
            health["relay"] = relay.health()
        return health
