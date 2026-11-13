"""Unified actors and their per-platform identities.

An `Actor` is the PES-level person. `ActorIdentity` maps a platform account
(Discord id, Chaster id, Reddit username, ...) to that actor. Rules should
reference `actor.id` (or the stable `actor.slug`), never a raw display name.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Actor(Base):
    __tablename__ = "actors"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String)
    trust: Mapped[float] = mapped_column(Float, default=0.5)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[List] = mapped_column(JSON, default=list)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, index=True
    )

    identities: Mapped[List["ActorIdentity"]] = relationship(
        "ActorIdentity",
        back_populates="actor",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    stats: Mapped[List["ActorStats"]] = relationship(
        "ActorStats",
        back_populates="actor",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ActorIdentity(Base):
    __tablename__ = "actor_identities"

    platform: Mapped[str] = mapped_column(String, primary_key=True)
    platform_id: Mapped[str] = mapped_column(String, primary_key=True)
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("actors.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # SQLAlchemy reserves `metadata`; keep the JSON column named `metadata`
    # while exposing it as `metadata_json` on the model.
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    actor: Mapped[Actor] = relationship("Actor", back_populates="identities")


class ActorStats(Base):
    __tablename__ = "actor_stats"

    actor_id: Mapped[str] = mapped_column(
        ForeignKey("actors.id", ondelete="CASCADE"), primary_key=True
    )
    event_type: Mapped[str] = mapped_column(String, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    actor: Mapped[Actor] = relationship("Actor", back_populates="stats")
