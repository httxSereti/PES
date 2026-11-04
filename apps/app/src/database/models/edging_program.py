from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class EdgingProgram(Base):
    """Ordered set of session presets forming a progressive training plan."""

    __tablename__ = "training_edging_programs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # [{name, goals: [{type, value}], auto_stop_on_goal}]
    steps: Mapped[List] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
