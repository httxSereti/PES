import asyncio
from typing import Optional
from utils.logger import Logger
from .websocket_manager import WebSocketManager


class WebSocketNotifier:
    def __init__(self):
        self._queue: Optional[asyncio.Queue] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def setup(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop
        self._queue = asyncio.Queue()

    def notify(self, payload_type: str, payload: dict):
        if self._loop is None or self._queue is None:
            Logger.warning("WSNotifier not ready, dropping event")
            return

        message = {"type": payload_type, "payload": payload}
        self._loop.call_soon_threadsafe(self._queue.put_nowait, message)

    async def send_history(self, client_id: str, ws_manager: WebSocketManager, limit: int = 250):
        """
        Send the last `limit` triggered events to a single newly connected client.
        Events are sent oldest-first inside a single 'events:history' message.
        """
        from database.repositories.triggered_event_repo import TriggeredEventRepo

        repo = TriggeredEventRepo()
        events = await repo.get_recent(limit=limit)

        payload = [
            {
                "id": ev.id,
                "event_type": ev.event_type,
                "origin": ev.origin,
                "event_data": ev.event_data,
                "triggered_at": ev.triggered_at.isoformat(),
                "triggered_rules": ev.triggered_rules,
            }
            for ev in events
        ]

        await ws_manager.send_personal_message(
            message={"type": "events:history", "payload": payload},
            client_id=client_id,
        )
        Logger.info(f"[WSNotifier] Sent {len(payload)} historical events to '{client_id}'")

    async def consume(self, ws_manager: WebSocketManager):
        while True:
            try:
                message = await self._queue.get()
                await ws_manager.broadcast(message)
            except Exception as e:
                Logger.error(f"WSNotifier consume error: {e}")


ws_notifier = WebSocketNotifier()
