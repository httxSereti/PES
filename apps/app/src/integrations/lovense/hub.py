"""
LovenseHub: runtime state for nodes, devices, patterns and ownership.

The hub is the single place that knows which Buttplug servers are connected,
which devices exist, which outputs are currently driven and by whom. Both the
WS commands and the trigger-rule actions go through it, so caps, timeouts and
the output arbiter are applied exactly once.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import structlog
from cuid2 import cuid_wrapper

from database.models.lovense import (
    LovenseDevice,
    LovenseNode,
    LovensePattern,
    LovenseRun,
)
from database.repositories.lovense_repo import LovenseRepo
from events.enums import TriggerableEvent

from .patterns import (
    PatternRun,
    PatternRunner,
    normalize_output,
    parse_pattern,
)

if TYPE_CHECKING:
    from integrations.lovense.integration import LovenseIntegration

    from .node import LovenseNodeRuntime

logger = structlog.get_logger("pes")
generate_id = cuid_wrapper()


@dataclass
class DeviceState:
    id: str
    node_id: str
    device_index: int
    name: str
    alias: str | None
    tags: list[str]
    features: list[dict]
    battery_pct: int | None
    rssi: int | None
    max_intensity_pct: int
    control_policy: str
    owner_user_id: str | None
    enabled: bool
    online: bool = False
    outputs: dict[tuple[int, str], int] = field(default_factory=dict)
    last_seen_at: float | None = None

    @property
    def display_name(self) -> str:
        return self.alias or self.name

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "node_id": self.node_id,
            "device_index": self.device_index,
            "name": self.name,
            "alias": self.alias,
            "display_name": self.display_name,
            "tags": list(self.tags),
            "features": list(self.features),
            "battery_pct": self.battery_pct,
            "rssi": self.rssi,
            "max_intensity_pct": self.max_intensity_pct,
            "control_policy": self.control_policy,
            "owner_user_id": self.owner_user_id,
            "enabled": self.enabled,
            "online": self.online,
            "outputs": [
                {"feature_index": feature_index, "output": output, "value": value}
                for (feature_index, output), value in self.outputs.items()
            ],
        }


@dataclass
class _Owner:
    owner: str
    priority: int
    expires_at: float | None = None


class LovenseHub:
    def __init__(self, integration: LovenseIntegration):
        self._integration = integration
        self._repo = LovenseRepo()
        self._nodes: dict[str, LovenseNodeRuntime] = {}
        self._devices: dict[str, DeviceState] = {}
        self._patterns: dict[str, LovensePattern] = {}
        self._runs: dict[str, PatternRun] = {}
        self._runners: dict[str, PatternRunner] = {}
        self._arbiter: dict[tuple[str, int, str], _Owner] = {}
        self._ramps: dict[tuple[str, int, str], asyncio.Task] = {}
        self._limited_at: dict[tuple[str, str], float] = {}
        self._latency_warned: dict[str, bool] = {}
        self._device_broadcast_at: dict[str, float] = {}
        self._nodes_broadcast_at = 0.0
        self._battery_task: asyncio.Task | None = None
        self._watchdog_task: asyncio.Task | None = None
        self._managed: Any | None = None
        self._relay: Any | None = None
        self._loaded = False
        self._started = False
        self._suppress_events = False
        self._lock = asyncio.Lock()

    # ───────── Settings (read live from the integration registry) ─────────

    def _setting(self, key: str, default: Any) -> Any:
        values = self._integration.settings_values()
        return values.get(key, default)

    def _int(self, key: str, default: int) -> int:
        try:
            return int(self._setting(key, default))
        except (TypeError, ValueError):
            return default

    def _bool(self, key: str, default: bool = False) -> bool:
        value = self._setting(key, default)
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @property
    def auto_scan(self) -> bool:
        return self._bool("auto_scan", False)

    @property
    def scan_seconds(self) -> int:
        return max(1, min(120, self._int("scan_seconds", 10)))

    @property
    def pattern_tick_hz(self) -> int:
        return max(1, min(30, self._int("pattern_tick_hz", 20)))

    @property
    def pattern_max_minutes(self) -> int:
        return max(1, self._int("default_pattern_max_minutes", 30))

    @property
    def global_max_intensity_pct(self) -> int:
        return max(0, min(100, self._int("default_max_intensity_pct", 70)))

    @property
    def manual_hold_seconds(self) -> int:
        return max(5, self._int("manual_hold_seconds", 60))

    @property
    def battery_poll_seconds(self) -> int:
        return max(10, self._int("battery_poll_seconds", 120))

    @property
    def relay_enabled(self) -> bool:
        return self._bool("relay_enabled", False)

    @property
    def latency_warn_ms(self) -> int:
        return max(10, self._int("latency_warn_ms", 250))

    # ───────── Lifecycle ─────────

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        if self._bool("managed_intiface_enabled", True) and self._managed is None:
            from .managed import ManagedIntiface

            self._managed = ManagedIntiface(self)
            await self._managed.start()
        if self.relay_enabled and self._relay is None:
            from .relay import RelayManager

            self._relay = RelayManager(self)
            await self._relay.start()
        if not self._loaded:
            await self._load()
            self._loaded = True
        await self._ensure_managed_node()
        await self._start_nodes()
        self._battery_task = asyncio.create_task(
            self._battery_loop(), name="lovense-battery"
        )
        self._watchdog_task = asyncio.create_task(
            self._watchdog_loop(), name="lovense-watchdog"
        )
        await self._repo.prune_runs()
        logger.info(
            "[Lovense] Hub started",
            nodes=len(self._nodes),
            devices=len(self._devices),
        )

    async def stop(self) -> None:
        self._started = False
        self._suppress_events = True
        if self._battery_task is not None:
            self._battery_task.cancel()
            self._battery_task = None
        if self._watchdog_task is not None:
            self._watchdog_task.cancel()
            self._watchdog_task = None
        await self.stop_all("shutdown")
        for node in list(self._nodes.values()):
            await node.stop()
        self._nodes.clear()
        if self._managed is not None:
            await self._managed.stop()
            self._managed = None
        if self._relay is not None:
            await self._relay.stop()
            self._relay = None
        for task in list(self._ramps.values()):
            task.cancel()
        self._ramps.clear()
        self._suppress_events = False
        logger.info("[Lovense] Hub stopped")

    async def shutdown(self) -> None:
        """Global kill switch (integration disabled)."""
        self._started = False
        self._suppress_events = True
        if self._battery_task is not None:
            self._battery_task.cancel()
            self._battery_task = None
        if self._watchdog_task is not None:
            self._watchdog_task.cancel()
            self._watchdog_task = None
        await self.stop_all("integration_disabled")
        for node in list(self._nodes.values()):
            await node.stop()
        self._nodes.clear()
        self._loaded = False
        if self._managed is not None:
            await self._managed.stop()
            self._managed = None
        if self._relay is not None:
            await self._relay.stop()
            self._relay = None
        self._suppress_events = False

    def set_enabled(self, enabled: bool) -> None:
        if enabled:
            asyncio.create_task(self.start(), name="lovense-restart")
        else:
            asyncio.create_task(self.shutdown(), name="lovense-shutdown")

    async def emergency_stop(self, reason: str) -> None:
        await self.stop_all(reason)

    # ───────── Managed Intiface ─────────

    def _managed_or_create(self) -> Any:
        if self._managed is None:
            from .managed import ManagedIntiface

            self._managed = ManagedIntiface(self)
        return self._managed

    def intiface_status(self) -> dict[str, Any]:
        if self._managed is None:
            return {
                "status": "stopped",
                "running": False,
                "owned": False,
                "external": False,
                "port": self._int("managed_intiface_port", 12345),
                "path": None,
                "pid": None,
                "last_error": None,
                "log_path": "intiface-engine.log",
            }
        return self._managed.status_dict()

    async def start_intiface(self) -> dict[str, Any]:
        managed = self._managed_or_create()
        try:
            status = await managed.start()
            await self._ensure_managed_node()
            return status
        except Exception as err:
            logger.exception("[Lovense] Failed to start managed Intiface")
            return {**managed.status_dict(), "status": "error", "last_error": str(err)}

    async def stop_intiface(self) -> dict[str, Any]:
        if self._managed is None:
            return self.intiface_status()
        return await self._managed.stop()

    async def restart_intiface(self) -> dict[str, Any]:
        managed = self._managed_or_create()
        try:
            status = await managed.restart()
            await self._ensure_managed_node()
            return status
        except Exception as err:
            logger.exception("[Lovense] Failed to restart managed Intiface")
            return {**managed.status_dict(), "status": "error", "last_error": str(err)}

    def broadcast_intiface(self, status: dict[str, Any]) -> None:
        self._notify("lovense:intiface", status)

    async def _load(self) -> None:
        self._nodes.clear()
        self._devices.clear()
        self._patterns.clear()
        rows = await self._repo.list_nodes()
        for row in rows:
            if not row.enabled:
                continue
            self._create_runtime(row)

        device_rows = await self._repo.list_devices()
        for device_row in device_rows:
            self._devices[device_row.id] = self._state_from_row(device_row)

        pattern_rows = await self._repo.list_patterns()
        self._patterns = {pattern_row.id: pattern_row for pattern_row in pattern_rows}
        await self._seed_builtins()

    def _create_runtime(self, row: LovenseNode) -> None:
        if row.kind == "demo":
            from .demo import DemoNodeRuntime

            self._nodes[row.id] = DemoNodeRuntime(self, row.id, row.name)
            return
        url = row.url or ""
        if row.kind == "relay":
            url = self._relay.url_for(row) if self._relay is not None else ""
        from .node import LovenseNodeRuntime

        runtime = LovenseNodeRuntime(
            self,
            row.id,
            row.name,
            row.kind or "direct",
            url,
            token_prefix=row.token_prefix,
        )
        if not url:
            runtime.status = "offline"
            runtime.last_error = "relay disabled"
        self._nodes[row.id] = runtime

    async def _start_nodes(self) -> None:
        if not self._bool("auto_connect", True):
            for node in self._nodes.values():
                node.status = "offline"
                node.last_error = "auto-connect disabled"
            return
        for node in self._nodes.values():
            if node.url:
                node.start()

    async def _ensure_managed_node(self) -> None:
        """Create/reuse the auto-managed 'Local Intiface' node."""
        if self._managed is None or not self._managed.running:
            return
        url = self._managed.url
        rows = await self._repo.list_nodes()
        existing = next(
            (
                row
                for row in rows
                if row.kind == "direct" and (row.url or "") == url
            ),
            None,
        )
        if existing is None:
            # Reuse the node created by a previous managed run when the port
            # changed, so aliases/tags on its devices are not lost.
            existing = next(
                (
                    row
                    for row in rows
                    if row.name == "Local Intiface" and row.kind == "direct"
                ),
                None,
            )
            if existing is not None:
                existing.url = url
                existing.enabled = True
                existing = await self._repo.save_node(existing)
        if existing is None:
            existing = await self._repo.save_node(
                LovenseNode(
                    id=generate_id(),
                    name="Local Intiface",
                    kind="direct",
                    url=url,
                    enabled=True,
                )
            )
        if not existing.enabled:
            return
        if existing.id not in self._nodes:
            self._create_runtime(existing)
            self._notify("lovense:nodes", self.serialize_nodes())
        node = self._nodes.get(existing.id)
        if self._started and node is not None and node.url and not node.is_active:
            node.start()

    async def _battery_loop(self) -> None:
        while True:
            await asyncio.sleep(self.battery_poll_seconds)
            try:
                await self.read_batteries()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[Lovense] Battery poll failed")

    async def _watchdog_loop(self) -> None:
        """Zero manual outputs whose hold TTL expired (dead-man switch)."""
        while True:
            await asyncio.sleep(1)
            now = time.monotonic()
            expired = [
                (key, owner)
                for key, owner in list(self._arbiter.items())
                if owner.owner.startswith("manual:")
                and owner.expires_at is not None
                and owner.expires_at <= now
            ]
            for key, owner in expired:
                device_id, feature_index, output = key
                # Re-check: a new manual command may have refreshed the owner.
                current = self._arbiter.get(key)
                if current is not owner:
                    continue
                await self.write_output(
                    device_id, feature_index, output, 0.0, owner=None
                )
                self._arbiter.pop(key, None)
                device_state = self._devices.get(device_id)
                await self.emit(
                    TriggerableEvent.LOVENSE_MANUAL_RELEASED,
                    {
                        "device_id": device_id,
                        "name": device_state.display_name
                        if device_state
                        else device_id,
                        "output": output,
                    },
                    f"lovense:device:{device_id}",
                )
                logger.info(
                    "[Lovense] Manual hold expired, output stopped",
                    device_id=device_id,
                    output=output,
                )

    # ───────── Node callbacks ─────────

    async def on_node_online(self, node: LovenseNodeRuntime) -> None:
        node.status = "online"
        node.last_error = None
        self._nodes_broadcast_at = 0.0
        await self._repo.touch_node(node.id)
        self._notify("lovense:nodes", self.serialize_nodes())
        await self.emit(
            TriggerableEvent.LOVENSE_NODE_ONLINE,
            {
                "node_id": node.id,
                "name": node.name,
                "kind": node.kind,
                "latency_ms": node.latency_ms,
            },
            f"lovense:node:{node.id}",
        )

    async def on_node_offline(
        self, node: LovenseNodeRuntime, reason: str
    ) -> None:
        was_online = node.status == "online"
        node.status = "offline" if reason else node.status
        if not was_online:
            return
        for device in self._devices.values():
            if device.node_id == node.id and device.online:
                device.online = False
                device.outputs.clear()
                self._broadcast_device(device.id, force=True)
        self._nodes_broadcast_at = 0.0
        self._notify("lovense:nodes", self.serialize_nodes())
        await self.emit(
            TriggerableEvent.LOVENSE_NODE_OFFLINE,
            {"node_id": node.id, "name": node.name, "reason": reason},
            f"lovense:node:{node.id}",
        )

    async def on_node_error(self, node: LovenseNodeRuntime, message: str) -> None:
        node.last_error = message
        self._notify(
            "lovense:error",
            {"scope": "node", "node_id": node.id, "message": message},
        )

    async def on_node_latency(
        self, node: LovenseNodeRuntime, latency_ms: float
    ) -> None:
        if latency_ms < self.latency_warn_ms:
            self._latency_warned[node.id] = False
            return
        if self._latency_warned.get(node.id):
            return
        self._latency_warned[node.id] = True
        await self.emit(
            TriggerableEvent.LOVENSE_NODE_LATENCY_HIGH,
            {
                "node_id": node.id,
                "name": node.name,
                "latency_ms": latency_ms,
                "threshold": self.latency_warn_ms,
            },
            f"lovense:node:{node.id}",
        )

    async def on_device_added(
        self, node: LovenseNodeRuntime, bp_device: Any
    ) -> None:
        index = int(getattr(bp_device, "index", 0))
        name = str(getattr(bp_device, "name", "Lovense device"))
        features = self._serialize_features(bp_device)
        device_tags = [
            str(tag).strip()[:40]
            for tag in (getattr(bp_device, "tags", None) or [])
            if str(tag).strip()
        ][:20]
        row = await self._repo.find_device(node.id, index)
        if row is None:
            # Buttplug indexes are not stable across reconnects: reuse an
            # offline row with the same device name before creating a new one.
            stale = next(
                (
                    device
                    for device in self._devices.values()
                    if device.node_id == node.id
                    and device.name == name
                    and not device.online
                ),
                None,
            )
            if stale is not None:
                row = await self._repo.get_device(stale.id)
        if row is None:
            row = LovenseDevice(
                id=generate_id(),
                node_id=node.id,
                device_index=index,
                name=name,
                alias=None,
                tags=device_tags,
                features=features,
                battery_pct=None,
                rssi=None,
                max_intensity_pct=100,
                control_policy="owner_only",
                owner_user_id=None,
                enabled=True,
                last_seen_at=datetime.now(UTC).replace(tzinfo=None),
            )
        else:
            row.device_index = index
            row.name = name
            row.features = features
            if device_tags:
                row.tags = sorted({*(row.tags or []), *device_tags})[:20]
            row.last_seen_at = datetime.now(UTC).replace(tzinfo=None)
        row = await self._repo.save_device(row)

        state = self._state_from_row(row)
        state.online = True
        state.last_seen_at = time.monotonic()
        self._devices[state.id] = state
        self._broadcast_device(state.id, force=True)
        await self.emit(
            TriggerableEvent.LOVENSE_DEVICE_CONNECTED,
            {
                "device_id": state.id,
                "node_id": state.node_id,
                "name": state.name,
                "display_name": state.display_name,
                "features": state.features,
            },
            f"lovense:device:{state.id}",
        )
        asyncio.create_task(
            self.read_batteries([state.id]), name=f"lovense-battery:{state.id}"
        )

    async def on_device_removed(
        self, node: LovenseNodeRuntime, bp_device: Any
    ) -> None:
        index = int(getattr(bp_device, "index", 0))
        state = self._find_device(node.id, index)
        if state is None:
            return
        state.online = False
        state.outputs.clear()
        self._release_device(state.id)
        self._broadcast_device(state.id, force=True)
        await self.emit(
            TriggerableEvent.LOVENSE_DEVICE_DISCONNECTED,
            {
                "device_id": state.id,
                "node_id": state.node_id,
                "name": state.name,
                "reason": "removed",
            },
            f"lovense:device:{state.id}",
        )

    async def on_scan_finished(
        self, node: LovenseNodeRuntime, found: int | None = None
    ) -> None:
        count = (
            found
            if found is not None
            else len([d for d in self._devices.values() if d.node_id == node.id])
        )
        self._notify("lovense:nodes", self.serialize_nodes())
        await self.emit(
            TriggerableEvent.LOVENSE_SCAN_FINISHED,
            {"node_id": node.id, "found": count},
            f"lovense:scan:{node.id}",
        )

    # ───────── Device serialization / persistence ─────────

    @staticmethod
    def _serialize_features(device: Any) -> list[dict[str, Any]]:
        features: list[dict[str, Any]] = []
        for index, feature in (device.features or {}).items():
            outputs: dict[str, Any] = {}
            for name, definition in (feature.outputs or {}).items():
                value = getattr(definition, "value", None)
                duration = getattr(definition, "duration", None)
                entry: dict[str, Any] = {
                    "min": int(value[0]) if value else 0,
                    "max": int(value[1]) if value else 1,
                }
                if duration:
                    entry["duration"] = [int(duration[0]), int(duration[1])]
                outputs[str(name)] = entry
            inputs: dict[str, Any] = {}
            for name, definition in (feature.inputs or {}).items():
                inputs[str(name)] = {
                    "commands": list(getattr(definition, "command", []) or [])
                }
            features.append(
                {
                    "index": int(index),
                    "description": str(feature.description or ""),
                    "outputs": outputs,
                    "inputs": inputs,
                }
            )
        return features

    def _state_from_row(self, row: LovenseDevice) -> DeviceState:
        return DeviceState(
            id=row.id,
            node_id=row.node_id,
            device_index=row.device_index,
            name=row.name,
            alias=row.alias,
            tags=list(row.tags or []),
            features=list(row.features or []),
            battery_pct=row.battery_pct,
            rssi=row.rssi,
            max_intensity_pct=row.max_intensity_pct,
            control_policy=row.control_policy or "owner_only",
            owner_user_id=row.owner_user_id,
            enabled=row.enabled,
            online=False,
        )

    def _find_device(self, node_id: str, device_index: int) -> DeviceState | None:
        for device in self._devices.values():
            if device.node_id == node_id and device.device_index == device_index:
                return device
        return None

    def serialize_nodes(self) -> list[dict[str, Any]]:
        result = []
        for node in self._nodes.values():
            result.append(
                {
                    "id": node.id,
                    "name": node.name,
                    "kind": node.kind,
                    "url": node.url if node.kind == "direct" else None,
                    "status": node.status,
                    "latency_ms": node.latency_ms,
                    "scanning": node.scanning,
                    "last_error": node.last_error,
                    "token_prefix": node.token_prefix,
                    "devices": len(
                        [d for d in self._devices.values() if d.node_id == node.id]
                    ),
                }
            )
        return result

    def serialize_devices(self) -> list[dict[str, Any]]:
        return [device.to_dict() for device in self._devices.values()]

    def serialize_runs(self) -> list[dict[str, Any]]:
        return [run.to_dict() for run in self._runs.values()]

    def serialize_patterns(self) -> list[dict[str, Any]]:
        rows = []
        for row in self._patterns.values():
            duration = 0
            try:
                duration = parse_pattern(row.definition).duration_ms
            except Exception:
                duration = 0
            rows.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "description": row.description or "",
                    "author_id": row.author_id,
                    "visibility": row.visibility,
                    "tags": list(row.tags or []),
                    "built_in": row.author_id == "system",
                    "duration_ms": duration,
                    "updated_at": row.updated_at.isoformat()
                    if row.updated_at
                    else None,
                }
            )
        return rows

    def snapshot(self) -> dict[str, Any]:
        return {
            "nodes": self.serialize_nodes(),
            "devices": self.serialize_devices(),
            "runs": self.serialize_runs(),
            "patterns": self.serialize_patterns(),
            "health": self.health(),
            "intiface": self.intiface_status(),
            "settings": {
                "max_intensity_pct": self.global_max_intensity_pct,
                "pattern_tick_hz": self.pattern_tick_hz,
                "manual_hold_seconds": self.manual_hold_seconds,
                "relay_enabled": self.relay_enabled,
            },
        }

    def health(self) -> dict[str, Any]:
        nodes_online = sum(1 for node in self._nodes.values() if node.status == "online")
        devices_online = sum(1 for device in self._devices.values() if device.online)
        latencies = [
            node.latency_ms
            for node in self._nodes.values()
            if node.latency_ms is not None
        ]
        return {
            "status": "online" if nodes_online else "idle",
            "nodes": len(self._nodes),
            "nodes_online": nodes_online,
            "devices": len(self._devices),
            "devices_online": devices_online,
            "runs": len(self._runs),
            "relay_enabled": self.relay_enabled,
            "latency_ms": round(sum(latencies) / len(latencies), 1)
            if latencies
            else None,
            "intiface": self.intiface_status(),
        }

    # ───────── Node management ─────────

    async def add_node(
        self,
        name: str,
        kind: str,
        url: str | None,
        enabled: bool = True,
        node_id: str | None = None,
    ) -> dict[str, Any]:
        name = name.strip()[:80]
        if not name:
            raise ValueError("Node name is required")
        if kind not in {"direct", "relay", "demo"}:
            kind = "direct"
        if kind == "direct" and not (url or "").strip():
            raise ValueError("A direct node needs an Intiface URL")
        if kind == "relay" and self._relay is None:
            raise ValueError(
                "Relay is disabled: enable 'relay_enabled' in the Lovense settings first"
            )
        stored_url = ((url or "").strip() or None) if kind == "direct" else None

        row = await self._repo.get_node(node_id) if node_id else None
        token: str | None = None
        if row is None:
            row = LovenseNode(
                id=node_id or generate_id(),
                name=name,
                kind=kind,
                url=stored_url,
                enabled=enabled,
            )
            if kind == "relay":
                token = self._make_token(row)
        else:
            row.name = name
            row.kind = kind
            row.url = stored_url
            row.enabled = enabled
            if kind in {"direct", "demo"}:
                row.token_hash = None
                row.token_prefix = None
            elif not row.token_hash:
                token = self._make_token(row)
        row = await self._repo.save_node(row)

        existing = self._nodes.pop(row.id, None)
        if existing is not None:
            await existing.stop()
        if kind != "relay" and self._relay is not None:
            self._relay.remove_node(row.id)
        if row.enabled:
            self._create_runtime(row)
            if self._started and row.id in self._nodes:
                self._nodes[row.id].start()
        if not row.enabled:
            for device in self._devices.values():
                if device.node_id == row.id:
                    device.online = False
                    device.outputs.clear()
                    self._broadcast_device(device.id, force=True)
        self._notify("lovense:nodes", self.serialize_nodes())
        result = {
            "node": self._node_dict(row),
            "token": token,
        }
        return result

    async def update_node(
        self,
        node_id: str,
        name: str | None = None,
        url: str | None = None,
        enabled: bool | None = None,
    ) -> dict[str, Any]:
        row = await self._repo.get_node(node_id)
        if row is None:
            raise ValueError("Node not found")
        return await self.add_node(
            name=name if name is not None else row.name,
            kind=row.kind,
            url=url if url is not None else row.url,
            enabled=enabled if enabled is not None else row.enabled,
            node_id=node_id,
        )

    @staticmethod
    def _make_token(row: LovenseNode) -> str:
        import hashlib
        import secrets

        token = secrets.token_urlsafe(32)
        row.token_hash = hashlib.sha256(token.encode()).hexdigest()
        row.token_prefix = token[:8]
        return token

    def _node_dict(self, row: LovenseNode) -> dict[str, Any]:
        runtime = self._nodes.get(row.id)
        return {
            "id": row.id,
            "name": row.name,
            "kind": row.kind,
            "url": row.url if row.kind == "direct" else None,
            "enabled": row.enabled,
            "status": runtime.status if runtime else "offline",
            "latency_ms": runtime.latency_ms if runtime else None,
            "token_prefix": row.token_prefix,
        }

    async def delete_node(self, node_id: str) -> None:
        runtime = self._nodes.pop(node_id, None)
        if runtime is not None:
            await runtime.stop()
        if self._relay is not None:
            self._relay.remove_node(node_id)
        for device in [
            device for device in self._devices.values() if device.node_id == node_id
        ]:
            self._devices.pop(device.id, None)
        await self._repo.delete_node(node_id)
        self._notify("lovense:nodes", self.serialize_nodes())
        self._notify("lovense:devices", self.serialize_devices())

    async def rotate_token(self, node_id: str) -> str:
        row = await self._repo.get_node(node_id)
        if row is None:
            raise ValueError("Node not found")
        if row.kind != "relay":
            raise ValueError("Only relay nodes have a token")
        token = self._make_token(row)
        await self._repo.save_node(row)
        runtime = self._nodes.get(node_id)
        if runtime is not None:
            runtime.token_prefix = row.token_prefix
        self._notify("lovense:nodes", self.serialize_nodes())
        return token

    async def reconnect_node(self, node_id: str | None = None) -> None:
        if node_id:
            node = self._nodes.get(node_id)
            if node is None:
                raise ValueError("Node not found")
            targets = [node]
        else:
            targets = list(self._nodes.values())
        for node in targets:
            await node.request_reconnect()

    # ───────── Target resolution ─────────

    def resolve_devices(self, targets: dict[str, Any] | None) -> list[dict[str, Any]]:
        targets = targets or {}
        device_ids = [str(v) for v in targets.get("device_ids") or [] if v]
        tags = {str(v) for v in targets.get("tags") or [] if v}
        node_ids = {str(v) for v in targets.get("node_ids") or [] if v}
        all_devices = bool(targets.get("all", False))
        if not (device_ids or tags or node_ids or all_devices):
            all_devices = True

        result = []
        for device in self._devices.values():
            if not device.online or not device.enabled:
                continue
            if all_devices:
                result.append(device.to_dict())
                continue
            if device.id in device_ids:
                result.append(device.to_dict())
                continue
            if device.node_id in node_ids:
                result.append(device.to_dict())
                continue
            if tags.intersection(device.tags):
                result.append(device.to_dict())
        return result

    def resolve_output_keys(
        self,
        targets: dict[str, Any] | None,
        output: str,
        feature: int | str = "all",
    ) -> list[tuple[str, int, str]]:
        output = normalize_output(output)
        keys: list[tuple[str, int, str]] = []
        for device in self.resolve_devices(targets):
            for feat in device.get("features") or []:
                if not isinstance(feat, dict):
                    continue
                index = int(feat.get("index", 0))
                if feature != "all" and index != int(feature):
                    continue
                if output not in (feat.get("outputs") or {}):
                    continue
                keys.append((str(device["id"]), index, output))
        return keys

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        state = self._devices.get(device_id)
        return state.to_dict() if state is not None else None

    def get_output_value(
        self, device_id: str, feature_index: int, output: str
    ) -> int | None:
        state = self._devices.get(device_id)
        if state is None:
            return None
        return state.outputs.get((feature_index, output))

    # ───────── Ownership ─────────

    def acquire_output(
        self,
        key: tuple[str, int, str],
        owner: str,
        priority: int = 10,
        ttl: float | None = None,
        force: bool = False,
    ) -> bool:
        now = time.monotonic()
        current = self._arbiter.get(key)
        if current is not None and current.expires_at is not None:
            if current.expires_at <= now:
                current = None
        if current is None or current.owner == owner:
            self._arbiter[key] = _Owner(
                owner=owner,
                priority=priority,
                expires_at=now + ttl if ttl else None,
            )
            return True
        if force or current.priority <= priority:
            self._arbiter[key] = _Owner(
                owner=owner,
                priority=priority,
                expires_at=now + ttl if ttl else None,
            )
            return True
        return False

    def owns_output(self, key: tuple[str, int, str], owner: str) -> bool:
        current = self._arbiter.get(key)
        if current is None:
            return False
        if current.expires_at is not None and current.expires_at <= time.monotonic():
            self._arbiter.pop(key, None)
            return False
        return current.owner == owner

    def release_output(self, key: tuple[str, int, str], owner: str) -> None:
        current = self._arbiter.get(key)
        if current is not None and current.owner == owner:
            self._arbiter.pop(key, None)

    def _release_device(self, device_id: str) -> None:
        for key in [key for key in self._arbiter if key[0] == device_id]:
            self._arbiter.pop(key, None)
        for key, task in list(self._ramps.items()):
            if key[0] == device_id:
                task.cancel()
                self._ramps.pop(key, None)

    # ───────── Outputs ─────────

    async def write_output(
        self,
        device_id: str,
        feature_index: int,
        output: str,
        value_pct: float,
        owner: str | None = None,
    ) -> bool:
        state = self._devices.get(device_id)
        if state is None or not state.online or not state.enabled:
            return False
        if owner is not None and not self.owns_output(
            (device_id, feature_index, output), owner
        ):
            return False
        node = self._nodes.get(state.node_id)
        if node is None:
            return False
        try:
            await node.write_output(
                state.device_index, feature_index, output, value_pct
            )
        except Exception as err:
            logger.warning(
                "[Lovense] Output write failed",
                device_id=device_id,
                feature_index=feature_index,
                output=output,
                error=str(err),
            )
            self._notify(
                "lovense:error",
                {
                    "scope": "device",
                    "device_id": device_id,
                    "message": str(err),
                },
            )
            await self.emit(
                TriggerableEvent.LOVENSE_DEVICE_ERROR,
                {
                    "device_id": device_id,
                    "node_id": state.node_id,
                    "message": str(err),
                },
                f"lovense:device:{device_id}",
            )
            return False
        state.outputs[(feature_index, output)] = int(round(value_pct))
        self._broadcast_device(device_id)
        return True

    async def set_output(
        self,
        targets: dict[str, Any] | None,
        output: str,
        feature: int | str,
        value: float,
        mode: str = "absolute",
        ramp_ms: int = 0,
        owner: str | None = None,
        priority: int = 20,
        ttl: float | None = None,
        force: bool = False,
    ) -> int:
        keys = self.resolve_output_keys(targets, output, feature)
        if not keys:
            return 0
        applied_count = 0
        for key in keys:
            device_id, feature_index, output_name = key
            state = self._devices.get(device_id)
            if state is None or not state.online or not state.enabled:
                continue
            owner_name = owner or "manual:unknown"
            if not self.acquire_output(
                key,
                owner_name,
                priority=priority,
                ttl=ttl,
                force=force,
            ):
                continue
            current = state.outputs.get((feature_index, output_name), 0)
            if mode == "relative":
                target = current + float(value)
            elif mode == "percent":
                target = current * float(value) / 100.0
            elif mode == "expression":
                from utils.calculate_magic_number import calculate_magic_number

                target = float(calculate_magic_number(current, str(value)))
            else:
                target = float(value)
            cap = min(
                state.max_intensity_pct, self.global_max_intensity_pct
            )
            applied = max(0.0, min(float(cap), target))
            if applied + 0.5 < target:
                self.note_limited(device_id, output_name, target, applied, cap)
            if ramp_ms > 0:
                self._schedule_ramp(key, applied, min(60000, ramp_ms), owner_name)
                applied_count += 1
            else:
                ok = await self.write_output(
                    device_id, feature_index, output_name, applied, owner=owner_name
                )
                if ok:
                    applied_count += 1
        return applied_count

    def _schedule_ramp(
        self,
        key: tuple[str, int, str],
        target: float,
        ramp_ms: int,
        owner: str,
    ) -> None:
        previous = self._ramps.pop(key, None)
        if previous is not None:
            previous.cancel()
        task = asyncio.create_task(
            self._run_ramp(key, target, ramp_ms, owner),
            name=f"lovense-ramp:{key[0]}:{key[1]}:{key[2]}",
        )
        self._ramps[key] = task

    async def _run_ramp(
        self,
        key: tuple[str, int, str],
        target: float,
        ramp_ms: int,
        owner: str,
    ) -> None:
        device_id, feature_index, output = key
        state = self._devices.get(device_id)
        if state is None:
            return
        start = float(state.outputs.get((feature_index, output), 0))
        steps = max(1, min(40, int(ramp_ms / 100)))
        interval = (ramp_ms / 1000.0) / steps
        for index in range(1, steps + 1):
            if not self.owns_output(key, owner):
                return
            value = start + (target - start) * (index / steps)
            await self.write_output(
                device_id, feature_index, output, value, owner=owner
            )
            await asyncio.sleep(interval)
        if self._ramps.get(key) is asyncio.current_task():
            self._ramps.pop(key, None)

    async def pulse(
        self,
        targets: dict[str, Any] | None,
        output: str,
        value: float,
        attack_ms: int,
        hold_ms: int,
        release_ms: int,
        owner: str,
    ) -> None:
        keys = self.resolve_output_keys(targets, output, "all")
        if not keys:
            return

        async def one(key: tuple[str, int, str]) -> None:
            device_id, feature_index, output_name = key
            if not self.acquire_output(key, owner, priority=20, force=False):
                return
            cap = min(
                self._devices[device_id].max_intensity_pct,
                self.global_max_intensity_pct,
            )
            target = max(0.0, min(float(cap), float(value)))
            await self._animate(key, target, min(10000, attack_ms), owner)
            await asyncio.sleep(max(0, min(30000, hold_ms)) / 1000.0)
            await self._animate(key, 0.0, min(10000, release_ms), owner)
            self.release_output(key, owner)

        await asyncio.gather(*(one(key) for key in keys), return_exceptions=True)

    async def _animate(
        self,
        key: tuple[str, int, str],
        target: float,
        duration_ms: int,
        owner: str,
    ) -> None:
        device_id, feature_index, output = key
        state = self._devices.get(device_id)
        if state is None:
            return
        start = float(state.outputs.get((feature_index, output), 0))
        steps = max(1, min(20, int(max(0, duration_ms) / 50)))
        interval = (max(0, duration_ms) / 1000.0) / steps
        for index in range(1, steps + 1):
            if not self.owns_output(key, owner):
                return
            value = start + (target - start) * (index / steps)
            await self.write_output(
                device_id, feature_index, output, value, owner=owner
            )
            await asyncio.sleep(interval)

    async def stop_outputs(
        self,
        targets: dict[str, Any] | None,
        output: str | None = None,
        owner: str | None = None,
    ) -> int:
        count = 0
        devices = self.resolve_devices(targets)
        for device in devices:
            device_id = str(device["id"])
            for feature in device.get("features") or []:
                feature_index = int(feature.get("index", 0))
                outputs = list((feature.get("outputs") or {}).keys())
                if output and normalize_output(output) not in outputs:
                    continue
                for output_name in outputs:
                    key = (device_id, feature_index, output_name)
                    if owner is not None and not self.owns_output(key, owner):
                        continue
                    task = self._ramps.pop(key, None)
                    if task is not None:
                        task.cancel()
                    ok = await self.write_output(
                        device_id, feature_index, output_name, 0.0, owner=None
                    )
                    if ok:
                        count += 1
                    if owner is None:
                        self._arbiter.pop(key, None)
                    else:
                        self.release_output(key, owner)
        return count

    async def stop_all(self, reason: str = "stop_all") -> None:
        previous_suppress = self._suppress_events
        self._suppress_events = True
        try:
            # Phase 1: tell every runner to stop immediately (no restore), so no
            # tick can send a non-zero value after the hardware stop below.
            for runner in list(self._runners.values()):
                runner.request_stop(restore=False)
            for key, task in list(self._ramps.items()):
                task.cancel()
                self._ramps.pop(key, None)
            # Phase 2: hardware stop.
            for node in list(self._nodes.values()):
                await node.emergency_stop()
            # Phase 3: reap the runners (their finally writes 0 and releases).
            await self.stop_patterns(all_runs=True, reason=reason, restore=False)
            for device in self._devices.values():
                device.outputs.clear()
                self._broadcast_device(device.id, force=True)
            self._arbiter.clear()
            self._notify("lovense:runs", self.serialize_runs())
            logger.info("[Lovense] Stop all", reason=reason)
        finally:
            self._suppress_events = previous_suppress

    def note_limited(
        self,
        device_id: str,
        output: str,
        requested: float,
        applied: float,
        cap: int,
    ) -> None:
        key = (device_id, output)
        now = time.monotonic()
        if now - self._limited_at.get(key, 0.0) < 5.0:
            return
        self._limited_at[key] = now
        state = self._devices.get(device_id)
        asyncio.create_task(
            self.emit(
                TriggerableEvent.LOVENSE_OUTPUT_LIMITED,
                {
                    "device_id": device_id,
                    "name": state.display_name if state else device_id,
                    "output": output,
                    "requested_pct": round(requested, 1),
                    "applied_pct": round(applied, 1),
                    "cap_pct": cap,
                },
                f"lovense:device:{device_id}",
                echo=True,
            )
        )

    # ───────── Patterns ─────────

    def pattern_rows(self) -> list[LovensePattern]:
        return sorted(self._patterns.values(), key=lambda row: row.name.lower())

    def get_pattern_row(self, pattern_id: str) -> LovensePattern | None:
        return self._patterns.get(pattern_id)

    async def save_pattern(
        self,
        name: str,
        definition: dict[str, Any],
        description: str = "",
        visibility: str = "private",
        tags: list[str] | None = None,
        pattern_id: str | None = None,
        author_id: str = "system",
    ) -> LovensePattern:
        pattern = parse_pattern({**definition, "name": name})
        row = self._patterns.get(pattern_id) if pattern_id else None
        if row is not None and row.author_id == "system":
            raise ValueError("Built-in patterns cannot be edited; duplicate it first")
        if row is None:
            row = LovensePattern(
                id=generate_id(),
                name=pattern.name,
                description=description or pattern.description,
                author_id=author_id,
                visibility=visibility,
                tags=tags or pattern.tags,
                definition=pattern.to_definition(),
                version=1,
            )
        else:
            row.name = pattern.name
            row.description = description or pattern.description
            row.visibility = visibility
            row.tags = tags or pattern.tags
            row.definition = pattern.to_definition()
            row.updated_at = datetime.now(UTC).replace(tzinfo=None)
        row = await self._repo.save_pattern(row)
        self._patterns[row.id] = row
        self._notify("lovense:patterns", self.serialize_patterns())
        self._notify(
            "lovense:pattern_saved",
            {
                "id": row.id,
                "name": row.name,
                "description": row.description or "",
                "author_id": row.author_id,
                "visibility": row.visibility,
                "tags": list(row.tags or []),
                "built_in": row.author_id == "system",
                "duration_ms": pattern.duration_ms,
                "updated_at": row.updated_at.isoformat()
                if row.updated_at
                else None,
            },
        )
        return row

    async def delete_pattern(self, pattern_id: str) -> None:
        row = self._patterns.get(pattern_id)
        if row is None:
            raise ValueError("Pattern not found")
        if row.author_id == "system":
            raise ValueError("Built-in patterns cannot be deleted")
        for run in list(self._runs.values()):
            if run.pattern_id == pattern_id:
                await self.stop_patterns(run_id=run.id, reason="pattern_deleted")
        await self._repo.delete_pattern(pattern_id)
        self._patterns.pop(pattern_id, None)
        self._notify("lovense:patterns", self.serialize_patterns())
        self._notify("lovense:pattern_deleted", {"id": pattern_id})

    async def play_pattern(
        self,
        pattern_id: str | None,
        pattern_name: str | None = None,
        targets: dict[str, Any] | None = None,
        options: dict[str, Any] | None = None,
        origin: str = "manual",
        created_by: str = "system",
        queue_item_id: str | None = None,
    ) -> dict[str, Any]:
        row = (
            self._patterns.get(pattern_id)
            if pattern_id
            else next(
                (
                    candidate
                    for candidate in self._patterns.values()
                    if candidate.name == pattern_name
                ),
                None,
            )
        )
        if row is None:
            raise ValueError("Pattern not found")
        if queue_item_id:
            for existing in list(self._runs.values()):
                if existing.queue_item_id == queue_item_id:
                    await self.stop_patterns(
                        run_id=existing.id, reason="replaced"
                    )
        pattern = parse_pattern(row.definition)
        options = dict(options or {})
        if options.get("fade_in_ms") is not None:
            pattern = replace(
                pattern,
                fade_in_ms=max(0, min(10000, int(options["fade_in_ms"]))),
            )
        if options.get("fade_out_ms") is not None:
            pattern = replace(
                pattern,
                fade_out_ms=max(0, min(10000, int(options["fade_out_ms"]))),
            )
        run = PatternRun(
            id=generate_id(),
            pattern=pattern,
            pattern_id=row.id,
            targets=targets or {},
            options=options,
            origin=origin,
            created_by=created_by,
            queue_item_id=queue_item_id,
        )
        runner = PatternRunner(self, run)
        self._runs[run.id] = run
        self._runners[run.id] = runner
        try:
            await runner.start()
        except Exception:
            self._runs.pop(run.id, None)
            self._runners.pop(run.id, None)
            raise
        if run.finished:
            return run.to_dict()
        try:
            await self._repo.save_run(
                LovenseRun(
                    id=run.id,
                    pattern_id=row.id,
                    pattern_name=pattern.name,
                    status="running",
                    targets=targets or {},
                    options=options,
                    origin=origin,
                    created_by=created_by,
                    queue_item_id=queue_item_id,
                )
            )
        except Exception:
            logger.exception("[Lovense] Failed to persist run", run_id=run.id)
        self._notify("lovense:runs", self.serialize_runs())
        await self.emit(
            TriggerableEvent.LOVENSE_PATTERN_STARTED,
            {
                "run_id": run.id,
                "pattern_id": row.id,
                "pattern_name": pattern.name,
                "targets": targets or {},
                "origin": origin,
                "duration": options.get("duration", -1),
            },
            f"lovense:run:{run.id}",
            echo=queue_item_id is not None,
        )
        return run.to_dict()

    async def stop_patterns(
        self,
        run_id: str | None = None,
        pattern_id: str | None = None,
        all_runs: bool = False,
        reason: str = "stopped",
        restore: bool = False,
    ) -> int:
        targets = []
        for run in list(self._runs.values()):
            if all_runs or run.id == run_id or run.pattern_id == pattern_id:
                targets.append(run)
        for run in targets:
            runner = self._runners.get(run.id)
            if runner is not None:
                await runner.stop(reason, restore=restore)
            await self.finish_run(run)
        return len(targets)

    async def finish_run(self, run: PatternRun) -> None:
        if run.finished:
            return
        run.finished = True
        self._runs.pop(run.id, None)
        self._runners.pop(run.id, None)
        status = run.status
        try:
            await self._repo.finish_run(run.id, status, run.error)
        except Exception:
            logger.exception("[Lovense] Failed to persist finished run", run_id=run.id)
        self._notify("lovense:runs", self.serialize_runs())
        if status == "completed":
            await self.emit(
                TriggerableEvent.LOVENSE_PATTERN_COMPLETED,
                {
                    "run_id": run.id,
                    "pattern_id": run.pattern_id,
                    "pattern_name": run.pattern.name,
                    "elapsed_s": round(run.elapsed_s, 1),
                    "loops": run.loops,
                },
                f"lovense:run:{run.id}",
                echo=run.queue_item_id is not None,
            )
        elif status == "failed":
            await self.emit(
                TriggerableEvent.LOVENSE_DEVICE_ERROR,
                {
                    "device_id": None,
                    "node_id": None,
                    "message": run.error or "pattern failed",
                },
                f"lovense:run:{run.id}",
            )
        else:
            await self.emit(
                TriggerableEvent.LOVENSE_PATTERN_STOPPED,
                {
                    "run_id": run.id,
                    "pattern_id": run.pattern_id,
                    "pattern_name": run.pattern.name,
                    "reason": run.status,
                },
                f"lovense:run:{run.id}",
                echo=run.queue_item_id is not None,
            )

    # ───────── Devices / caps / battery ─────────

    async def delete_device(self, device_id: str) -> None:
        state = self._devices.get(device_id)
        if state is not None:
            node = self._nodes.get(state.node_id)
            if node is not None:
                await node.stop_device(state.device_index)
            self._release_device(device_id)
            self._devices.pop(device_id, None)
        await self._repo.delete_device(device_id)
        self._notify("lovense:devices", self.serialize_devices())

    async def update_device(
        self,
        device_id: str,
        alias: str | None = None,
        tags: list[str] | None = None,
        max_intensity_pct: int | None = None,
        control_policy: str | None = None,
    ) -> dict[str, Any]:
        changes: dict[str, Any] = {}
        if alias is not None:
            changes["alias"] = alias.strip()[:80] or None
        if tags is not None:
            changes["tags"] = [str(tag).strip()[:40] for tag in tags if str(tag).strip()][:20]
        if max_intensity_pct is not None:
            changes["max_intensity_pct"] = max(0, min(100, int(max_intensity_pct)))
        if control_policy is not None:
            changes["control_policy"] = control_policy
        row = await self._repo.update_device(device_id, changes)
        if row is None:
            raise ValueError("Device not found")
        state = self._devices.get(device_id)
        if state is not None:
            if alias is not None:
                state.alias = changes["alias"]
            if tags is not None:
                state.tags = changes["tags"]
            if max_intensity_pct is not None:
                state.max_intensity_pct = changes["max_intensity_pct"]
            if control_policy is not None:
                state.control_policy = changes["control_policy"]
        self._broadcast_device(device_id, force=True)
        return state.to_dict() if state else {"id": device_id}

    async def set_cap(
        self, targets: dict[str, Any] | None, max_pct: int
    ) -> int:
        devices = self.resolve_devices(targets)
        applied = 0
        for device in devices:
            await self.update_device(
                str(device["id"]), max_intensity_pct=max_pct
            )
            applied += 1
        return applied

    async def read_batteries(
        self, device_ids: list[str] | None = None
    ) -> list[dict[str, Any]]:
        results = []
        for device in list(self._devices.values()):
            if device_ids and device.id not in device_ids:
                continue
            if not device.online or not device.enabled:
                continue
            node = self._nodes.get(device.node_id)
            if node is None:
                continue
            value = await node.read_battery(device.device_index)
            if value is None:
                continue
            pct = max(0, min(100, int(round(value))))
            previous = device.battery_pct
            device.battery_pct = pct
            await self._repo.update_device(device.id, {"battery_pct": pct})
            self._broadcast_device(device.id, force=True)
            results.append({"device_id": device.id, "battery_pct": pct})
            low = max(0, min(100, self._int("battery_low_pct", 15)))
            if pct <= low and (previous is None or previous > low):
                await self.emit(
                    TriggerableEvent.LOVENSE_BATTERY_LOW,
                    {
                        "device_id": device.id,
                        "name": device.display_name,
                        "battery_pct": pct,
                        "threshold": low,
                    },
                    f"lovense:device:{device.id}",
                )
            elif pct >= low + 10 and previous is not None and previous < low + 10:
                await self.emit(
                    TriggerableEvent.LOVENSE_BATTERY_CHARGED,
                    {
                        "device_id": device.id,
                        "name": device.display_name,
                        "battery_pct": pct,
                    },
                    f"lovense:device:{device.id}",
                )
        return results

    async def identify(self, device_id: str) -> None:
        device = self._devices.get(device_id)
        if device is None:
            raise ValueError("Device not found")
        targets = {"device_ids": [device_id]}
        await self.pulse(
            targets,
            "Vibrate",
            40.0,
            attack_ms=150,
            hold_ms=250,
            release_ms=150,
            owner=f"identify:{device_id}",
        )

    async def scan(self, node_id: str, seconds: int | None = None) -> dict[str, Any]:
        node = self._nodes.get(node_id)
        if node is None:
            raise ValueError("Node not found")
        return await node.scan(seconds or self.scan_seconds)

    # ───────── Built-in patterns ─────────

    async def _seed_builtins(self) -> None:
        builtins: list[dict[str, Any]] = [
            {
                "name": "Constant",
                "description": "A steady vibration at 50%.",
                "tags": ["basic"],
                "tracks": [
                    {
                        "match": {"all": True},
                        "output": "Vibrate",
                        "keyframes": [{"at_ms": 0, "value": 0.5}],
                    }
                ],
            },
            {
                "name": "Pulse",
                "description": "One second on, one second off.",
                "tags": ["basic", "tease"],
                "loop": True,
                "tracks": [
                    {
                        "match": {"all": True},
                        "output": "Vibrate",
                        "keyframes": [
                            {"at_ms": 0, "value": 0.7, "easing": "step"},
                            {"at_ms": 1000, "value": 0.0, "easing": "step"},
                            {"at_ms": 2000, "value": 0.7, "easing": "step"},
                        ],
                    }
                ],
            },
            {
                "name": "Wave",
                "description": "A slow sine wave.",
                "tags": ["basic", "tease"],
                "loop": True,
                "tracks": [
                    {
                        "match": {"all": True},
                        "output": "Vibrate",
                        "keyframes": [
                            {"at_ms": 0, "value": 0.0, "easing": "sine"},
                            {"at_ms": 4000, "value": 0.8, "easing": "sine"},
                            {"at_ms": 8000, "value": 0.0, "easing": "sine"},
                        ],
                    }
                ],
            },
            {
                "name": "Slow Build",
                "description": "Ten minutes of slow escalation.",
                "tags": ["tease", "edging"],
                "tracks": [
                    {
                        "match": {"all": True},
                        "output": "Vibrate",
                        "keyframes": [
                            {"at_ms": 0, "value": 0.0, "easing": "ease-in"},
                            {"at_ms": 300000, "value": 0.45, "easing": "ease-in-out"},
                            {"at_ms": 600000, "value": 0.9, "easing": "linear"},
                        ],
                    }
                ],
            },
            {
                "name": "Storm",
                "description": "Fast random-feeling bursts.",
                "tags": ["intense"],
                "loop": True,
                "tracks": [
                    {
                        "match": {"all": True},
                        "output": "Vibrate",
                        "keyframes": [
                            {"at_ms": 0, "value": 0.2, "easing": "step"},
                            {"at_ms": 300, "value": 0.9, "easing": "step"},
                            {"at_ms": 600, "value": 0.1, "easing": "step"},
                            {"at_ms": 1200, "value": 0.7, "easing": "step"},
                            {"at_ms": 1500, "value": 0.3, "easing": "step"},
                        ],
                    }
                ],
            },
            {
                "name": "Aftercare",
                "description": "A gentle, low, slow wave.",
                "tags": ["care"],
                "loop": True,
                "tracks": [
                    {
                        "match": {"all": True},
                        "output": "Vibrate",
                        "keyframes": [
                            {"at_ms": 0, "value": 0.1, "easing": "sine"},
                            {"at_ms": 3000, "value": 0.25, "easing": "sine"},
                            {"at_ms": 6000, "value": 0.1, "easing": "sine"},
                        ],
                    }
                ],
            },
        ]
        for definition in builtins:
            try:
                pattern = parse_pattern(definition)
            except Exception:
                logger.exception(
                    "[Lovense] Invalid built-in pattern skipped",
                    pattern=definition.get("name"),
                )
                continue
            existing = next(
                (
                    row
                    for row in self._patterns.values()
                    if row.name == pattern.name
                ),
                None,
            )
            if existing is not None and existing.author_id != "system":
                continue
            if existing is not None:
                existing.description = pattern.description
                existing.tags = pattern.tags
                existing.definition = pattern.to_definition()
                row = await self._repo.save_pattern(existing)
            else:
                row = LovensePattern(
                    id=generate_id(),
                    name=pattern.name,
                    description=pattern.description,
                    author_id="system",
                    visibility="public",
                    tags=pattern.tags,
                    definition=pattern.to_definition(),
                    version=1,
                )
                row = await self._repo.save_pattern(row)
            self._patterns[row.id] = row

    # ───────── Broadcast / events ─────────

    def _notify(self, message_type: str, payload: Any) -> None:
        ctx = getattr(self._integration, "ctx", None)
        notifier = getattr(ctx, "notifier", None) if ctx else None
        if notifier is None:
            return
        try:
            notifier.notify(message_type, payload)
        except Exception:
            logger.debug("[Lovense] WS notify failed", message_type=message_type)

    def _broadcast_device(self, device_id: str, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._device_broadcast_at.get(device_id, 0.0) < 0.1:
            return
        self._device_broadcast_at[device_id] = now
        state = self._devices.get(device_id)
        if state is not None:
            self._notify("lovense:device", state.to_dict())

    async def emit(
        self,
        event_type: TriggerableEvent | str,
        data: dict[str, Any],
        origin: str,
        echo: bool = False,
    ) -> None:
        ctx = getattr(self._integration, "ctx", None)
        if ctx is None or self._suppress_events:
            return
        if not ctx.registry.is_enabled(self._integration.id):
            return
        value = event_type.value if isinstance(event_type, TriggerableEvent) else event_type
        try:
            await ctx.dispatcher.dispatch(
                value,
                data,
                origin=origin,
                source_integration_id=self._integration.id if echo else None,
            )
        except Exception:
            logger.exception(
                "[Lovense] Event dispatch failed",
                event_type=value,
                origin=origin,
            )
