from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class AppSession(Base):
    """
    An application session: the lifecycle wrapper around a PES usage period.

    Holds the session settings (type, name, description, active units and
    sensors) so a session can be reproduced later, and so events/logger/
    trigger rules can be filtered by session id in the future.
    """

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    unit_ids: Mapped[List] = mapped_column(JSON, default=list)
    sensor_ids: Mapped[List] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="running", index=True)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
