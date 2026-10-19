"""
PuryFi plugin protocol — WebSocket server side.

PuryFi's extension connects to this server (client/server is inverted: the
plugin hosts the socket). Messages are msgpack-encoded:

    PuryFi -> plugin:  {"type": <message>, "payload": {...}, "responseId"?: n}
    plugin -> PuryFi:  {"type": <message>, "payload": {...}, "responseId": n}
    PuryFi -> plugin:  {"payload": <response>, "responseId": n}   (a reply)

The plugin must answer `ready` before sending anything else, then request
intents (the user grants them in PuryFi's options page).
"""

from __future__ import annotations

import asyncio
from typing import Any, Protocol

import msgpack
import structlog
from websockets.asyncio.server import Server, ServerConnection, serve

logger = structlog.get_logger("pes")

# The SDK accepts apiVersion >= 1.0.0 and < 2.0.0
API_MIN = (1, 0, 0)
API_MAX = (2, 0, 0)

REQUEST_TIMEOUT = 10.0

# PuryFi offers these intents; PES only needs the state/media read-write set.
DESIRED_INTENTS = (
    "readEnabledState",
    "writeEnabledState",
    "readLockConfigurationState",
    "writeLockConfigurationState",
    "readWBlistConfigurationState",
    "writeWBlistConfigurationState",
    "readMediaProcesses",
)


class PuryFiError(RuntimeError):
    """A request failed (error response, timeout or closed connection)."""


class PuryFiNotConnected(PuryFiError):
    pass


def _parse_version(value: str) -> tuple[int, ...] | None:
    try:
        parts = tuple(int(part) for part in value.split("."))
    except (AttributeError, ValueError):
        return None
    return parts if len(parts) == 3 and all(part >= 0 for part in parts) else None


class PuryFiEvents(Protocol):
    """Callbacks the integration implements."""

    async def puryfi_connected(self, connection: PuryFiConnection, info: dict) -> None: ...

    async def puryfi_disconnected(self) -> None: ...

    async def puryfi_intents(self, connection: PuryFiConnection, intents: list[str]) -> None: ...

    async def puryfi_state_change(self, path: str, value: Any) -> None: ...

    async def puryfi_media_scan(self, objects: list[dict]) -> None: ...


class PuryFiConnection:
    def __init__(self, websocket: ServerConnection, client: PuryFiClient):
        self._ws = websocket
        self._client = client
        self.open = True
        self.instance_id: str | None = None
        self.version: str | None = None
        self.api_version: str | None = None
        self.intents: list[str] = []
        self._next_id = 1
        self._pending: dict[int, asyncio.Future] = {}
        self._subscribed: set[str] = set()
        self._ready_info: dict | None = None

    # ───────── outgoing requests ─────────

    async def request(self, message_type: str, payload: dict | None = None) -> dict:
        if not self.open:
            raise PuryFiNotConnected("PuryFi is not connected")
        response_id = self._next_id
        self._next_id += 1
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[response_id] = future
        await self._send({"type": message_type, "payload": payload or {}, "responseId": response_id})

        try:
            response = await asyncio.wait_for(future, timeout=REQUEST_TIMEOUT)
        except TimeoutError:
            self._pending.pop(response_id, None)
            raise PuryFiError(f"'{message_type}' timed out") from None

        if not isinstance(response, dict):
            return {"type": "ok"}
        if response.get("type") == "error":
            raise PuryFiError(
                f"'{message_type}' failed: {response.get('name')}: {response.get('message')}"
            )
        return response

    async def subscribe(self, path: str) -> bool:
        """Subscribe to a state path; False when the path is unavailable."""
        if path in self._subscribed:
            return True
        try:
            await self.request("subscribeToState", {"path": path})
        except PuryFiError as err:
            logger.debug(f"[PuryFi] subscribe '{path}' refused: {err}")
            return False
        self._subscribed.add(path)
        return True

    async def send_message(self, message_type: str, payload: dict | None = None) -> None:
        await self._send({"type": message_type, "payload": payload or {}})

    async def _send(self, message: dict) -> None:
        if not self.open:
            raise PuryFiNotConnected("PuryFi is not connected")
        await self._ws.send(msgpack.packb(message, use_bin_type=True))

    # ───────── incoming ─────────

    async def handle_raw(self, raw: Any) -> None:
        try:
            message = msgpack.unpackb(raw, raw=False, strict_map_key=False)
        except Exception:
            logger.warning("[PuryFi] Undecodable message ignored")
            return
        if not isinstance(message, dict):
            return

        if "type" not in message:
            self._resolve_response(message)
            return

        message_type = str(message.get("type"))
        payload = message.get("payload") or {}

        try:
            response = await self._dispatch(message_type, payload)
        except Exception:
            logger.exception(f"[PuryFi] Handler error for '{message_type}'")
            response = {
                "type": "error",
                "name": "internalError",
                "message": "handler failed",
            }

        response_id = message.get("responseId")
        if response_id is not None and response is not None:
            await self._send({"payload": response, "responseId": response_id})

        # `ready` must be answered before anything else is sent
        if self._ready_info is not None:
            info, self._ready_info = self._ready_info, None
            self._schedule(self._client._events.puryfi_connected(self, info))

    def _schedule(self, coro: Any) -> None:
        """
        Run an integration hook as a task.

        Hooks may issue their own requests (`setPluginManifest`, ...) whose
        replies are read by this same loop, so they must never be awaited
        from the reader.
        """
        task = asyncio.create_task(coro)

        def _log_failure(finished: asyncio.Task) -> None:
            if finished.cancelled():
                return
            error = finished.exception()
            if error is not None:
                logger.error(f"[PuryFi] Hook failed: {error}")

        task.add_done_callback(_log_failure)

    def _resolve_response(self, message: dict) -> None:
        response_id = message.get("responseId")
        future = self._pending.pop(response_id, None) if isinstance(response_id, int) else None
        if future is None:
            logger.debug(f"[PuryFi] Response for unknown request {response_id}")
            return
        if not future.done():
            future.set_result(message.get("payload"))

    async def _dispatch(self, message_type: str, payload: dict) -> dict | None:
        if message_type == "ready":
            return self._handle_ready(payload)

        if message_type == "intentsGrant":
            self.intents = [str(intent) for intent in payload.get("intents") or []]
            self._schedule(self._client._events.puryfi_intents(self, self.intents))
            return None

        if message_type == "stateChange":
            path = payload.get("path")
            if isinstance(path, str):
                self._schedule(
                    self._client._events.puryfi_state_change(path, payload.get("value"))
                )
            return None

        if message_type == "staticMediaScan":
            objects = payload.get("objects") or []
            self._schedule(self._client._events.puryfi_media_scan(objects))
            return None

        if message_type == "mediaCensorHookRequest":
            # PES never intercepts images; let PuryFi censor normally.
            return {"type": "pass"}

        if message_type == "configurationChange":
            return None

        logger.debug(f"[PuryFi] Unhandled message '{message_type}'")
        return None

    def _handle_ready(self, payload: dict) -> dict:
        api_version = str(payload.get("apiVersion", ""))
        parsed = _parse_version(api_version)
        if parsed is None or not (API_MIN <= parsed < API_MAX):
            return {
                "type": "error",
                "name": "incompatibleApiVersion",
                "message": "Not compatible with the offered plugin API version",
            }

        self.version = str(payload.get("version", ""))
        self.api_version = api_version
        self.instance_id = str(payload.get("instanceId", ""))
        self._ready_info = {
            "version": self.version,
            "api_version": self.api_version,
            "instance_id": self.instance_id,
        }
        return {"type": "ok"}


class PuryFiClient:
    """Owns the WebSocket server PuryFi connects to (one active connection)."""

    def __init__(self, events: PuryFiEvents, host: str = "127.0.0.1", port: int = 8088):
        self._events = events
        self._host = host
        self._port = port
        self._server: Server | None = None
        self._connection: PuryFiConnection | None = None

    @property
    def port(self) -> int:
        return self._port

    @property
    def url(self) -> str:
        return f"ws://{self._host}:{self._port}"

    @property
    def connected(self) -> bool:
        return self._connection is not None and self._connection.open

    @property
    def connection(self) -> PuryFiConnection:
        if self._connection is None or not self._connection.open:
            raise PuryFiNotConnected("PuryFi is not connected")
        return self._connection

    async def start(self) -> None:
        self._server = await serve(
            self._handle,
            self._host,
            self._port,
            max_size=16 * 1024 * 1024,
            ping_interval=20,
        )
        logger.info(f"[PuryFi] Plugin server listening on {self.url}")

    async def stop(self) -> None:
        server, self._server = self._server, None
        if server is not None:
            server.close()
            await server.wait_closed()

    async def _handle(self, websocket: ServerConnection) -> None:
        previous, self._connection = self._connection, PuryFiConnection(websocket, self)
        connection = self._connection
        if previous is not None and previous.open:
            logger.info("[PuryFi] Replacing previous connection")
            previous.open = False
            try:
                await previous._ws.close()
            except Exception as err:  # noqa: BLE001 - closing must never raise
                logger.debug(f"[PuryFi] Closing previous connection failed: {err}")

        try:
            async for raw in websocket:
                await connection.handle_raw(raw)
        except Exception:
            logger.exception("[PuryFi] Connection error")
        finally:
            connection.open = False
            if self._connection is connection:
                self._connection = None
                await self._events.puryfi_disconnected()
