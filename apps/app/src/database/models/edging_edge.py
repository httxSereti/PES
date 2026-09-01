from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
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
    """

    __tablename__ = "training_edging_edges"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("training_edging_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    difficulty: Mapped[str] = mapped_column(String, default="normal")
    outcome: Mapped[str] = mapped_column(String, default="success")
    recorded_by: Mapped[str] = mapped_column(String, default="system")
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    session: Mapped[EdgingSession] = relationship("EdgingSession", back_populates="edges")
