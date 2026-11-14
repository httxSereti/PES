"""Persistence for Events v3 flows, runs and effect ledger.

Phase 0 creates the tables and the minimal repository surface. The compiler
and the visual editor land in phase 1; these tables are already shaped so the
flow engine can persist a run without a second migration.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FlowDef(Base):
    __tablename__ = "flow_defs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="draft")
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    graph: Mapped[dict] = mapped_column(JSON, default=dict)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    legacy_rule_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    versions: Mapped[List["FlowVersion"]] = relationship(
        "FlowVersion",
        back_populates="flow",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class FlowVersion(Base):
    __tablename__ = "flow_versions"

    flow_id: Mapped[str] = mapped_column(
        ForeignKey("flow_defs.id", ondelete="CASCADE"), primary_key=True
    )
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    graph: Mapped[dict] = mapped_column(JSON, default=dict)
    compiled: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    published_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    flow: Mapped[FlowDef] = relationship("FlowDef", back_populates="versions")


class FlowTriggerIndex(Base):
    __tablename__ = "flow_trigger_index"
    __table_args__ = (
        Index("ix_flow_trigger_pattern", "pattern", "priority"),
    )

    flow_id: Mapped[str] = mapped_column(
        ForeignKey("flow_defs.id", ondelete="CASCADE"), primary_key=True
    )
    pattern: Mapped[str] = mapped_column(String, primary_key=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)


class FlowRun(Base):
    __tablename__ = "flow_runs"
    __table_args__ = (
        Index("ix_flow_runs_flow_started", "flow_id", "started_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(String, index=True)
    # No FK: shadow runs use the synthetic "legacy" flow id.
    flow_id: Mapped[str] = mapped_column(String, index=True)
    flow_version: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="shadow")
    trigger_node_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    causation_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trace: Mapped[dict] = mapped_column(JSON, default=dict)

    node_runs: Mapped[List["NodeRun"]] = relationship(
        "NodeRun",
        back_populates="run",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    effects: Mapped[List["EffectLedger"]] = relationship(
        "EffectLedger",
        back_populates="run",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class NodeRun(Base):
    __tablename__ = "node_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("flow_runs.id", ondelete="CASCADE"), index=True
    )
    node_id: Mapped[str] = mapped_column(String)
    node_type: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="ok")
    iteration: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    input_preview: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_preview: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    run: Mapped[FlowRun] = relationship("FlowRun", back_populates="node_runs")


class EffectLedger(Base):
    __tablename__ = "effect_ledger"
    __table_args__ = (
        Index("ix_effect_ledger_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("flow_runs.id", ondelete="CASCADE"), index=True
    )
    node_id: Mapped[str] = mapped_column(String)
    effect_kind: Mapped[str] = mapped_column(String)
    target: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    params_before: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    params_after: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    modifiers: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    clamp: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="planned")
    queue_item_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reversed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    run: Mapped[FlowRun] = relationship("FlowRun", back_populates="effects")
