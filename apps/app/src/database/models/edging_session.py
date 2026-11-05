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
    EdgingSessionStatus (configured -> running -> succeeded/failed/cancelled);
    a session still ``running`` at startup is marked ``interrupted``.

    A session belongs to the application session that was active when it was
    created (or started), and is only visible to its creator, its participants
    and Hosts.
    """

    __tablename__ = "training_edging_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    goals: Mapped[List] = mapped_column(JSON, default=list)
    auto_stop_on_goal: Mapped[bool] = mapped_column(Boolean, default=False)
    initiator: Mapped[str] = mapped_column(String, default="self")
    initiator_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String)
    # Optional application session this training session ran inside.
    app_session_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, index=True
    )
    # Optional program/step this session was created from.
    program_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, index=True
    )
    program_step: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # manual = free session, guided = phase prompts driven by the goals.
    mode: Mapped[str] = mapped_column(String, default="manual")
    # Optional hardware automation for guided sessions (profiles, phase levels,
    # edge drop, reward/fail profile). Normalized by services.training_guided.
    guided_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Minimum seconds between two successful edges (0 disables the cooldown).
    min_edge_interval_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # all / edges / failures / summary / none (see EdgingNotificationLevel).
    notification_level: Mapped[str] = mapped_column(String, default="all")
    # Participants may record successful edges (reported to the Host).
    allow_partner_edges: Mapped[bool] = mapped_column(Boolean, default=False)
    # Extra users allowed to see/control the session (creator is implicit).
    participant_ids: Mapped[List] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="configured", index=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Pause support: active duration excludes total_paused_seconds plus the
    # currently open pause (paused_at).
    paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    total_paused_seconds: Mapped[int] = mapped_column(Integer, default=0)
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
