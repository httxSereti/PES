"""
Relay for remote Lovense companions.

A companion runs on the machine that owns the Bluetooth radio, connects out to
PES and pipes raw Buttplug frames to its local Intiface. PES exposes a loopback
WebSocket endpoint per relay node; `buttplug-py` connects to it exactly like a
local Intiface, so direct and remote nodes share the same code path.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from websockets.asyncio.server import ServerConnection, serve

from database.repositories.lovense_repo import LovenseRepo

logger = structlog.get_logger("pes")

PROTOCOL_VERSION = 1
SUBPROTOCOL = "pes-lovense-v1"
MAX_FRAME_BYTES = 1024 * 1024
QUEUE_SIZE = 512


class Bridge:
    """Frame queues between one Buttplug client and one companion."""

    def __init__(self, node_id: str, name: str):
        self.node_id = node_id
        self.name = name
        self.path_token = secrets.token_urlsafe(24)
        self.to_companion: asyncio.Queue[str | bytes | None] = asyncio.Queue(
            maxsize=QUEUE_SIZE
        )
        self.to_client: asyncio.Queue[str | bytes | None] = asyncio.Queue(
            maxsize=QUEUE_SIZE
        )
        self.client_connected = False
        self.companion_connected = False
        self.last_pong = time.monotonic()
        self.heartbeat_s = 15

    def _drop_oldest(self, queue: asyncio.Queue) -> None:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass

    async def put_to_companion(self, message: str | bytes | None) -> None:
        if self.to_companion.full():
            self._drop_oldest(self.to_companion)
        await self.to_companion.put(message)

    async def put_to_client(self, message: str | bytes | None) -> None:
        if self.to_client.full():
            self._drop_oldest(self.to_client)
        await self.to_client.put(message)

    async def attach_client(self, connection: ServerConnection) -> None:
        self.client_connected = True
        logger.info("[Lovense] Relay client attached", node_id=self.node_id)

        async def client_to_companion() -> None:
            try:
                async for message in connection:
                    await self.put_to_companion(message)
            except Exception:
                pass
            finally:
                await self.put_to_companion(None)

        async def companion_to_client() -> None:
            while True:
                message = await self.to_client.get()
                if message is None:
                    break
                try:
                    await connection.send(message)
                except Exception:
                    break
            try:
                await connection.close(code=1000, reason="companion disconnected")
            except Exception:
                pass

        tasks = [
            asyncio.create_task(client_to_companion()),
            asyncio.create_task(companion_to_client()),
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            self.client_connected = False
            logger.info("[Lovense] Relay client detached", node_id=self.node_id)

    async def attach_companion(self, websocket: WebSocket) -> None:
        self.companion_connected = True
        self.last_pong = time.monotonic()
        logger.info("[Lovense] Companion attached", node_id=self.node_id)

        async def companion_to_client() -> None:
            try:
                while True:
                    message = await websocket.receive()
                    if message.get("type") == "websocket.disconnect":
                        break
                    if message.get("text") is not None:
                        raw = message["text"]
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            data = None
                        if isinstance(data, dict) and data.get("type") == "pong":
                            self.last_pong = time.monotonic()
                            continue
                        if isinstance(data, dict) and data.get("type") in {
                            "hello",
                            "ping",
                        }:
                            continue
                        await self.put_to_client(raw)
                    elif message.get("bytes") is not None:
                        await self.put_to_client(message["bytes"])
            except WebSocketDisconnect:
                pass
            except Exception:
                pass
            finally:
                await self.put_to_client(None)

        async def client_to_companion() -> None:
            while True:
                message = await self.to_companion.get()
                if message is None:
                    break
                try:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)
                except Exception:
                    break
            try:
                await websocket.close(code=1000)
            except Exception:
                pass

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(self.heartbeat_s)
                if time.monotonic() - self.last_pong > self.heartbeat_s * 3:
                    logger.warning(
                        "[Lovense] Companion heartbeat lost",
                        node_id=self.node_id,
                    )
                    try:
                        await websocket.close(code=4004, reason="heartbeat")
                    except Exception:
                        pass
                    return
                try:
                    await websocket.send_json(
                        {"type": "ping", "t": round(time.monotonic(), 3)}
                    )
                except Exception:
                    return

        tasks = [
            asyncio.create_task(companion_to_client()),
            asyncio.create_task(client_to_companion()),
            asyncio.create_task(heartbeat()),
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            self.companion_connected = False
            await self.put_to_client(None)
            logger.info("[Lovense] Companion detached", node_id=self.node_id)


class RelayManager:
    def __init__(self, hub: Any):
        self._hub = hub
        self._repo = LovenseRepo()
        self._server: Any | None = None
        self._port = 0
        self._bridges: dict[str, Bridge] = {}
        self._by_path: dict[str, Bridge] = {}

    async def start(self) -> None:
        self._server = await serve(
            self._handle_loopback,
            "127.0.0.1",
            0,
            max_size=MAX_FRAME_BYTES,
        )
        sockets = getattr(self._server, "sockets", None) or []
        self._port = sockets[0].getsockname()[1] if sockets else 0
        logger.info("[Lovense] Relay loopback listening", port=self._port)

    async def stop(self) -> None:
        for bridge in list(self._bridges.values()):
            await bridge.put_to_client(None)
            await bridge.put_to_companion(None)
        self._bridges.clear()
        self._by_path.clear()
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        logger.info("[Lovense] Relay stopped")

    def url_for(self, row: Any) -> str:
        bridge = self._bridges.get(row.id)
        if bridge is None:
            bridge = Bridge(row.id, row.name)
            self._bridges[row.id] = bridge
            self._by_path[bridge.path_token] = bridge
        return f"ws://127.0.0.1:{self._port}/n/{bridge.path_token}"

    def remove_node(self, node_id: str) -> None:
        bridge = self._bridges.pop(node_id, None)
        if bridge is not None:
            self._by_path.pop(bridge.path_token, None)

    async def _handle_loopback(self, connection: ServerConnection) -> None:
        request = connection.request
        if request is None:
            await connection.close(code=4004, reason="missing request")
            return
        path = request.path
        token = path.rsplit("/", 1)[-1]
        bridge = self._by_path.get(token)
        if bridge is None:
            await connection.close(code=4004, reason="unknown node")
            return
        await bridge.attach_client(connection)

    @property
    def companion_count(self) -> int:
        return sum(1 for bridge in self._bridges.values() if bridge.companion_connected)

    async def tunnel(self, node_id: str, websocket: WebSocket) -> None:
        """Accept and run one companion tunnel (called by the REST router)."""
        row = await self._repo.get_node(node_id)
        if row is None or not row.enabled:
            await websocket.close(code=4002, reason="unknown or disabled node")
            return
        if row.kind != "relay":
            await websocket.close(code=4003, reason="node is not a relay node")
            return

        token = websocket.query_params.get("token") or ""
        authorization = websocket.headers.get("authorization") or ""
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
        if not token or not row.token_hash:
            await websocket.close(code=4001, reason="missing token")
            return
        digest = hashlib.sha256(token.encode()).hexdigest()
        if not hmac.compare_digest(digest, row.token_hash):
            await websocket.close(code=4001, reason="invalid token")
            return

        max_nodes = self._hub._int("relay_max_nodes", 10)
        if (
            len([b for b in self._bridges.values() if b.companion_connected])
            >= max_nodes
            and not self._bridges.get(node_id, None)
        ):
            await websocket.close(code=4004, reason="relay is full")
            return

        await websocket.accept(subprotocol=SUBPROTOCOL)
        bridge = self._bridges.get(node_id)
        if bridge is None:
            bridge = Bridge(node_id, row.name)
            self._bridges[node_id] = bridge
            self._by_path[bridge.path_token] = bridge
        bridge.heartbeat_s = max(5, min(120, self._hub._int("relay_heartbeat_seconds", 15)))

        try:
            hello = json.loads(await asyncio.wait_for(websocket.receive_text(), 10))
        except Exception:
            await websocket.close(code=4003, reason="invalid handshake")
            return
        if not isinstance(hello, dict) or hello.get("type") != "hello":
            await websocket.close(code=4003, reason="invalid handshake")
            return
        if int(hello.get("version", 0)) != PROTOCOL_VERSION:
            await websocket.close(code=4003, reason="protocol version mismatch")
            return

        await websocket.send_json(
            {
                "type": "welcome",
                "node_id": node_id,
                "heartbeat_s": bridge.heartbeat_s,
                "max_frame_bytes": MAX_FRAME_BYTES,
            }
        )
        await bridge.attach_companion(websocket)

    def health(self) -> dict[str, Any]:
        return {
            "enabled": self._server is not None,
            "port": self._port,
            "companions": self.companion_count,
        }
