from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base

if TYPE_CHECKING:
    from .edging_session import EdgingSession


class EdgingEdge(Base):
    """
    A single edge recorded during a session: stopping right before climax.
    ``difficulty`` follows EdgeDifficulty, ``outcome`` follows EdgeOutcome
    (a failed edge ends the session). ``recorded_by`` is a user id, or
    ``system`` for automated recordings.

    ``client_edge_id`` makes recording idempotent across retries, and the
    metadata columns capture what the hardware was doing at that moment.
    """

    __tablename__ = "training_edging_edges"
    __table_args__ = (
        UniqueConstraint(
            "session_id", "client_edge_id", name="uq_edging_edge_client"
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("training_edging_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    difficulty: Mapped[str] = mapped_column(String, default="normal")
    outcome: Mapped[str] = mapped_column(String, default="success")
    recorded_by: Mapped[str] = mapped_column(String, default="system")
    source: Mapped[str] = mapped_column(String, default="host")
    # Seconds since the previous edge (or since the session start for the first).
    interval_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Snapshot of the live units/profile when the edge was recorded.
    level_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_edge_id: Mapped[str | None] = mapped_column(String, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    session: Mapped[EdgingSession] = relationship("EdgingSession", back_populates="edges")
