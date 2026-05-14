from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class TriggeredEvent(Base):
    """
    Persisted record of every event dispatched through the EventDispatcher.
    Allows replay to newly connected WebSocket clients.
    """

    __tablename__ = "triggered_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_type: Mapped[str] = mapped_column(String, index=True)
    origin: Mapped[str] = mapped_column(String, default="unknown")
    event_data: Mapped[dict] = mapped_column(JSON, default=dict)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    # Summary of which rules/actions were triggered (empty list = no rules matched or WOF)
    triggered_rules: Mapped[List] = mapped_column(JSON, default=list)
