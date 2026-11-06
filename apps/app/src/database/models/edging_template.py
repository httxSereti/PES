from __future__ import annotations

from datetime import datetime
from typing import List

from sqlalchemy import Boolean, DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class EdgingTemplate(Base):
    """Reusable session preset: name, goals, mode and optional automation."""

    __tablename__ = "training_edging_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    goals: Mapped[List] = mapped_column(JSON, default=list)
    auto_stop_on_goal: Mapped[bool] = mapped_column(Boolean, default=False)
    mode: Mapped[str] = mapped_column(String, default="manual")
    guided_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Session defaults carried by the template.
    visibility: Mapped[str] = mapped_column(String, default="private")
    participant_ids: Mapped[List] = mapped_column(JSON, default=list)
    min_edge_interval_seconds: Mapped[int] = mapped_column(Integer, default=0)
    notification_level: Mapped[str] = mapped_column(String, default="all")
    allow_partner_edges: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
