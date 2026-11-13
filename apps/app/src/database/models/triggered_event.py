from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, Integer, JSON, String
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
    # Id of the active application session when the event fired (null = outside a session)
    session_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)

    # ───────── Events v3 envelope metadata ─────────
    # `triggered_at` is the PES receive time; `occurred_at` is the source time.
    occurred_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, index=True
    )
    causation_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    dedupe_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    severity: Mapped[str] = mapped_column(String, default="info")
    tags: Mapped[List] = mapped_column(JSON, default=list)
    version: Mapped[int] = mapped_column(Integer, default=1)
