from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class MagicTokenModel(Base):
    """
    Persisted magic login token. Only the SHA-256 hash of the raw token is
    stored; tokens expire and are single-use (`used_at` set on login).
    """

    __tablename__ = "magic_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
