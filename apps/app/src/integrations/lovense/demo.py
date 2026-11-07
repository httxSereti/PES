"""Virtual Lovense node used to exercise the UI without physical hardware.

The demo node behaves like a Buttplug node from the hub's point of view: it
registers one device with two vibration motors, answers battery reads and
accepts output writes. Nothing is sent over the network.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .node import LovenseNodeRuntime

if TYPE_CHECKING:
    from .hub import LovenseHub


@dataclass(frozen=True)
class _DemoOutput:
    value: tuple[int, int] = (0, 20)
    duration: tuple[int, int] | None = None


@dataclass(frozen=True)
class _DemoFeature:
    index: int
    description: str
    outputs: dict[str, _DemoOutput]
    inputs: dict[str, Any] = field(default_factory=dict)


class _DemoDevice:
    """Minimal stand-in for a Buttplug device passed to the hub callbacks."""

    def __init__(self, index: int, name: str) -> None:
        self.index = index
        self.name = name
        self.features: dict[int, _DemoFeature] = {
            0: _DemoFeature(0, "Main motor", {"Vibrate": _DemoOutput()}),
            1: _DemoFeature(1, "Secondary motor", {"Vibrate": _DemoOutput()}),
        }


class DemoNodeRuntime(LovenseNodeRuntime):
    """In-process node exposing a single two-motor demo toy."""

    def __init__(self, hub: LovenseHub, node_id: str, name: str) -> None:
        super().__init__(hub, node_id, name, "demo", "demo://local")
        self._device = _DemoDevice(0, name)

    async def _connect(self) -> None:
        # No Buttplug client: register the fake device directly with the hub.
        self.status = "online"
        self.latency_ms = 8.0
        self.last_error = None
        self._connected = True
        await self.hub.on_node_online(self)
        await self.hub.on_device_added(self, self._device)

    async def scan(self, seconds: int = 10) -> dict[str, Any]:
        if self.scanning:
            return {"status": "already_scanning"}
        self.scanning = True
        try:
            await asyncio.sleep(min(2.0, max(0.25, seconds / 10.0)))
        finally:
            self.scanning = False
        await self.hub.on_scan_finished(self, 0)
        return {"status": "ok", "found": 0}

    async def write_output(
        self,
        device_index: int,
        feature_index: int,
        output: str,
        value_pct: float,
    ) -> None:
        # The hub already keeps the authoritative output value; yield once so
        # pattern runners keep their regular timing.
        await asyncio.sleep(0)
        self.latency_ms = 8.0

    async def read_battery(self, device_index: int) -> float | None:
        return 82.0

    async def stop_device(self, device_index: int) -> None:
        return None

    async def stop_all(self) -> None:
        return None

    async def emergency_stop(self) -> None:
        return None
