from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class UserModel(Base):
    """
    Persisted application user. `custom_permissions` stores permission
    *values* (strings) granted on top of the role bundle.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="guest")
    custom_permissions: Mapped[List] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
