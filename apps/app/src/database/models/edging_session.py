from __future__ import annotations

from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base

if TYPE_CHECKING:
    from .edging_edge import EdgingEdge


class EdgingSession(Base):
    """
    An edging training session. Goals are a JSON list of
    ``{"type": "duration"|"edges", "value": int}`` — the session reaches its
    goal when *all* of them are met. ``status`` follows
    EdgingSessionStatus (configured -> running -> succeeded/failed/cancelled).
    """

    __tablename__ = "training_edging_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    goals: Mapped[List] = mapped_column(JSON, default=list)
    auto_stop_on_goal: Mapped[bool] = mapped_column(Boolean, default=False)
    initiator: Mapped[str] = mapped_column(String, default="self")
    initiator_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="configured", index=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    edges: Mapped[List[EdgingEdge]] = relationship(
        "EdgingEdge",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="EdgingEdge.recorded_at",
    )
