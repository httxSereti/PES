from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .enums import ActionType, QueueItemStatus

# Import ORM models to keep existing imports working
from database.models import TriggerRule, TriggerAction

@dataclass
class QueueItem:
    """
    An action item in the execution queue. In-memory only, not persisted.
    """

    id: str
    action_type: ActionType
    payload: dict
    duration: int  # seconds, -1 = permanent
    cumulative: bool
    priority: int
    status: QueueItemStatus = QueueItemStatus.WAITING
    origin: str = ""
    display_name: Optional[str] = None
    elapsed: int = 0
    snapshot_data: Optional[dict] = None  # Unit state backup for reverse
    trigger_action_id: Optional[str] = None
    trigger_rule_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
