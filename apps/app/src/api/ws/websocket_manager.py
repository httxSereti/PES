import threading

from typing import Dict, Optional, Set
from fastapi import WebSocket

from typings import Permission


class WebSocketManager:
    """
    Thread-safe WebSocket manager with per-connection permission snapshots.

    Each connection registers the user's effective permissions at connect
    time; `broadcast(audience=...)` only delivers to connections holding the
    required permission (ROOT bypasses). Snapshots are refreshed via
    `update_permissions` when a role changes — per-command checks always hit
    the live User object, so only broadcast filtering uses the snapshot.
    """

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}
        self._permissions: Dict[str, Set[Permission]] = {}
        self._lock = threading.RLock()

    async def connect(
        self,
        client_id: str,
        websocket: WebSocket,
        permissions: Optional[Set[Permission]] = None,
    ):
        await websocket.accept()
        with self._lock:
            self._connections[client_id] = websocket
            self._permissions[client_id] = set(permissions or set())

    def disconnect(self, client_id: str):
        with self._lock:
            self._connections.pop(client_id, None)
            self._permissions.pop(client_id, None)

    def update_permissions(self, client_id: str, permissions: Set[Permission]):
        with self._lock:
            if client_id in self._connections:
                self._permissions[client_id] = set(permissions)

    def has_permission(self, client_id: str, permission: Permission) -> bool:
        with self._lock:
            perms = self._permissions.get(client_id, set())
        return Permission.ROOT in perms or permission in perms

    async def send_personal_message(self, message: dict, client_id: str):
        with self._lock:
            websocket = self._connections.get(client_id)

        if websocket:
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(client_id)

    async def broadcast(
        self,
        message: dict,
        exclude: Optional[Set[str]] = None,
        audience: Optional[Permission] = None,
    ):
        exclude = exclude or set()

        with self._lock:
            connections = list(self._connections.items())
            permissions = dict(self._permissions)

        for client_id, websocket in connections:
            if client_id in exclude:
                continue
            if audience is not None:
                perms = permissions.get(client_id, set())
                if Permission.ROOT not in perms and audience not in perms:
                    continue
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(client_id)

    def get_active_connections_count(self) -> int:
        with self._lock:
            return len(self._connections)

    def get_connected_clients(self) -> list[str]:
        with self._lock:
            return list(self._connections.keys())
