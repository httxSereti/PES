"""One Buttplug server connection (Intiface Central / Engine)."""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from .hub import LovenseHub

logger = structlog.get_logger("pes")

# Buttplug commands are cheap locally but a remote relay can stall: bound
# every device write so a dead node cannot hold the action queue worker.
_WRITE_TIMEOUT = 5.0


class LovenseNodeRuntime:
    """
    Lifecycle of one Buttplug client.

    A node is either `direct` (PES connects to `url`) or `relay` (a companion
    connects to PES and `url` is the loopback bridge created by RelayManager).
    """

    def __init__(
        self,
        hub: LovenseHub,
        node_id: str,
        name: str,
        kind: str,
        url: str,
        token_prefix: str | None = None,
    ):
        self.hub = hub
        self.id = node_id
        self.name = name
        self.kind = kind
        self.url = url
        self.token_prefix = token_prefix
        self.client: Any | None = None
        self.status = "offline"
        self.latency_ms: float | None = None
        self.last_error: str | None = None
        self.scanning = False
        self._task: asyncio.Task | None = None
        self._scan_task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._disconnect_event = asyncio.Event()
        self._connected = False
        self._last_latency: float | None = None

    @property
    def is_active(self) -> bool:
        return self._task is not None and not self._task.done()

    # ───────── Lifecycle ─────────

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(
            self._run(), name=f"lovense-node:{self.id}"
        )

    async def stop(self) -> None:
        self._stop_event.set()
        self._disconnect_event.set()
        if self._scan_task is not None:
            self._scan_task.cancel()
            self._scan_task = None
        await self._disconnect()
        task = self._task
        self._task = None
        if task is not None and not task.done():
            try:
                await asyncio.wait_for(task, timeout=3.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                task.cancel()

    async def request_reconnect(self) -> None:
        """Ask the run loop to drop the current connection and reconnect."""
        if self._task is None or self._task.done():
            self.start()
            return
        self._disconnect_event.set()

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stop_event.is_set():
            self._disconnect_event.clear()
            try:
                await self._connect()
                backoff = 1.0
                await self._wait_disconnect()
            except asyncio.CancelledError:
                raise
            except Exception as err:
                self.status = "error"
                self.last_error = str(err)
                logger.warning(
                    "[Lovense] Node connection failed",
                    node_id=self.id,
                    name=self.name,
                    error=str(err),
                )
                try:
                    await self.hub.on_node_offline(self, str(err))
                except Exception:
                    logger.exception(
                        "[Lovense] Node offline callback failed", node_id=self.id
                    )
            finally:
                await self._disconnect()

            if self._stop_event.is_set():
                break
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=backoff
                )
            except asyncio.TimeoutError:
                pass
            backoff = min(30.0, backoff * 2)

    async def _wait_disconnect(self) -> None:
        stop_task = asyncio.create_task(self._stop_event.wait())
        disconnect_task = asyncio.create_task(self._disconnect_event.wait())
        try:
            await asyncio.wait(
                {stop_task, disconnect_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            stop_task.cancel()
            disconnect_task.cancel()

    async def _connect(self) -> None:
        try:
            from buttplug import ButtplugClient
        except ImportError as err:
            raise RuntimeError(
                "The 'buttplug' package is not installed (uv sync)"
            ) from err

        if not self.url:
            raise RuntimeError("This node has no connection URL")

        client = ButtplugClient(f"PlunEStim: {self.name}")
        client.on_device_added = self._on_device_added
        client.on_device_removed = self._on_device_removed
        client.on_scanning_finished = self._on_scanning_finished
        client.on_server_disconnect = self._on_server_disconnect
        client.on_error = self._on_error

        logger.info(
            "[Lovense] Connecting node", node_id=self.id, name=self.name
        )
        started = time.monotonic()
        await client.connect(self.url)
        self.client = client
        self._connected = True
        self.status = "online"
        self.last_error = None
        self.latency_ms = round((time.monotonic() - started) * 1000.0, 1)
        try:
            await self.hub.on_node_online(self)
        except Exception:
            logger.exception(
                "[Lovense] Node online callback failed", node_id=self.id
            )

        if self.hub.auto_scan:
            self._scan_task = asyncio.create_task(
                self.scan(self.hub.scan_seconds),
                name=f"lovense-scan:{self.id}",
            )

    async def _disconnect(self) -> None:
        if not self._connected:
            self.client = None
            self.status = "offline"
            return
        self._connected = False
        try:
            await self.hub.on_node_offline(self, "disconnected")
        except Exception:
            logger.exception("[Lovense] Node offline callback failed", node_id=self.id)
        self.status = "offline"
        client = self.client
        self.client = None
        if client is not None:
            try:
                await asyncio.wait_for(client.disconnect(), timeout=3.0)
            except Exception:
                logger.debug(
                    "[Lovense] Node disconnect failed", node_id=self.id
                )

    async def _on_server_disconnect(self) -> None:
        try:
            await self.hub.on_node_offline(self, "server disconnected")
        except Exception:
            logger.exception(
                "[Lovense] Node offline callback failed", node_id=self.id
            )
        self._disconnect_event.set()

    async def _on_device_added(self, device: Any) -> None:
        try:
            await self.hub.on_device_added(self, device)
        except Exception:
            logger.exception(
                "[Lovense] Device added callback failed", node_id=self.id
            )

    async def _on_device_removed(self, device: Any) -> None:
        try:
            await self.hub.on_device_removed(self, device)
        except Exception:
            logger.exception(
                "[Lovense] Device removed callback failed", node_id=self.id
            )

    async def _on_scanning_finished(self) -> None:
        self.scanning = False
        try:
            await self.hub.on_scan_finished(self)
        except Exception:
            logger.exception(
                "[Lovense] Scan finished callback failed", node_id=self.id
            )

    async def _on_error(self, error: Exception) -> None:
        self.last_error = str(error)
        logger.warning(
            "[Lovense] Node error", node_id=self.id, error=str(error)
        )
        try:
            await self.hub.on_node_error(self, str(error))
        except Exception:
            logger.exception(
                "[Lovense] Node error callback failed", node_id=self.id
            )

    # ───────── Commands ─────────

    async def scan(self, seconds: int = 10) -> dict[str, Any]:
        client = self.client
        if client is None or not self._connected:
            raise RuntimeError("Node is not connected")
        if self.scanning:
            return {"status": "already_scanning"}
        self.scanning = True
        found_before = len(client.devices)
        try:
            await asyncio.wait_for(client.start_scanning(), timeout=5.0)
            await asyncio.sleep(max(1, min(120, seconds)))
        finally:
            try:
                await asyncio.wait_for(client.stop_scanning(), timeout=5.0)
            except Exception:
                pass
            self.scanning = False
        found = max(0, len(client.devices) - found_before)
        await self.hub.on_scan_finished(self, found)
        return {"status": "ok", "found": found}

    async def write_output(
        self,
        device_index: int,
        feature_index: int,
        output: str,
        value_pct: float,
    ) -> None:
        client = self.client
        if client is None or not self._connected:
            raise RuntimeError("Node is not connected")
        device = client.devices.get(device_index)
        if device is None:
            raise RuntimeError(f"Device index {device_index} is not connected")
        feature = device.features.get(feature_index)
        if feature is None:
            raise RuntimeError(f"Feature {feature_index} is not available")

        from buttplug import DeviceOutputCommand, OutputType

        output_type = OutputType(output)
        step_max = feature.step_count(output_type)
        if step_max is None:
            raise RuntimeError(f"{output} is not supported by this feature")
        step = int(round(max(0.0, min(100.0, value_pct)) / 100.0 * step_max))
        started = time.monotonic()
        await asyncio.wait_for(
            feature.run_output(
                DeviceOutputCommand(output_type, step)
            ),
            timeout=_WRITE_TIMEOUT,
        )
        elapsed = (time.monotonic() - started) * 1000.0
        self._last_latency = (
            elapsed if self._last_latency is None else self._last_latency * 0.8 + elapsed * 0.2
        )
        self.latency_ms = round(self._last_latency, 1)
        await self.hub.on_node_latency(self, self.latency_ms)

    async def read_battery(self, device_index: int) -> float | None:
        client = self.client
        if client is None or not self._connected:
            return None
        device = client.devices.get(device_index)
        if device is None or not device.has_battery():
            return None
        try:
            value = await asyncio.wait_for(device.battery(), timeout=_WRITE_TIMEOUT)
        except Exception as err:
            logger.debug(
                "[Lovense] Battery read failed",
                node_id=self.id,
                device_index=device_index,
                error=str(err),
            )
            return None
        return float(value) * 100.0

    async def stop_device(self, device_index: int) -> None:
        client = self.client
        if client is None:
            return
        device = client.devices.get(device_index)
        if device is None:
            return
        try:
            await asyncio.wait_for(device.stop(), timeout=_WRITE_TIMEOUT)
        except Exception:
            logger.debug(
                "[Lovense] Device stop failed",
                node_id=self.id,
                device_index=device_index,
            )

    async def stop_all(self) -> None:
        client = self.client
        if client is None:
            return
        try:
            await asyncio.wait_for(client.stop_all_devices(), timeout=_WRITE_TIMEOUT)
        except Exception:
            logger.debug("[Lovense] Node stop_all failed", node_id=self.id)

    async def emergency_stop(self) -> None:
        """Best-effort stop that does not depend on the run loop state."""
        client = self.client
        if client is not None:
            await self.stop_all()
        for device_index in list((client.devices if client else {}).keys()):
            await self.stop_device(device_index)
