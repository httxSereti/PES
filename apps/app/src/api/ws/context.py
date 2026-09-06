"""
Per-command handler context. Kept separate from registry.py so command
handlers can import it without an import cycle (registry imports handlers).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from api.ws.websocket_notifier import WebSocketNotifier
from models import User


@dataclass
class CommandContext:
    """Context handed to command handlers alongside the validated model."""

    user: User
    msg_id: Optional[str]
    notifier: WebSocketNotifier
