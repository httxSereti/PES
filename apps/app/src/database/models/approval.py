"""Pending approvals for rule actions marked `requires_approval`."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_status_requested", "status", "requested_at"),
        Index("ix_approval_requests_rule", "rule_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(String, index=True)
    rule_id: Mapped[str] = mapped_column(String)
    rule_name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    items: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
