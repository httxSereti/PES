from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class LovenseNode(Base):
    """
    One Buttplug server (Intiface Central / Engine).

    `kind="direct"` means PES connects to `url`. `kind="relay"` means a
    companion connects out to PES and PES bridges a loopback endpoint to it;
    the token is stored hashed and only its prefix is kept for display.
    """

    __tablename__ = "lovense_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="direct")
    url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    token_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    token_prefix: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LovenseDevice(Base):
    """A discovered Buttplug device, with PES-side preferences."""

    __tablename__ = "lovense_devices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    node_id: Mapped[str] = mapped_column(String, index=True)
    device_index: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String, default="")
    alias: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[List] = mapped_column(JSON, default=list)
    features: Mapped[List] = mapped_column(JSON, default=list)
    battery_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rssi: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_intensity_pct: Mapped[int] = mapped_column(Integer, default=100)
    control_policy: Mapped[str] = mapped_column(String, default="owner_only")
    owner_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LovensePattern(Base):
    """A Lovense profile (multi-track keyframe sequence)."""

    __tablename__ = "lovense_patterns"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author_id: Mapped[str] = mapped_column(String, default="system")
    visibility: Mapped[str] = mapped_column(String, default="private")
    tags: Mapped[List] = mapped_column(JSON, default=list)
    definition: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class LovenseRun(Base):
    """A pattern playback run (also mirrored in memory while active)."""

    __tablename__ = "lovense_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    pattern_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pattern_name: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="running", index=True)
    targets: Mapped[dict] = mapped_column(JSON, default=dict)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    origin: Mapped[str] = mapped_column(String, default="")
    created_by: Mapped[str] = mapped_column(String, default="system")
    queue_item_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    loops: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
