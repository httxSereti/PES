from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base

if TYPE_CHECKING:
    from .trigger_action import TriggerAction
    from .trigger_rule_event import TriggerRuleEvent
    from .trigger_rule_label import TriggerRuleLabel


def _action_order_by():
    """Deterministic action order for relationship loading."""
    # Imported lazily to avoid a module-level circular import.
    from .trigger_action import TriggerAction

    return (
        TriggerAction.sort_order,
        TriggerAction.created_at,
        TriggerAction.id,
    )


class TriggerRule(Base):
    __tablename__ = "trigger_rules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # Legacy single-event field: first selected event. Multi-event rules live
    # in `event_links`; rows without links fall back to this column.
    event_type: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    # Flat condition list evaluated before the actions. `condition_mode` is
    # "all" (AND) or "any" (OR); empty means the rule always matches.
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    condition_mode: Mapped[str] = mapped_column(String, default="all")
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # Aggregate window: require `window_count` matching events inside
    # `window_seconds` before the rule fires (0 disables the gate).
    window_count: Mapped[int] = mapped_column(Integer, default=0)
    window_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # Budget: at most `budget_count` fires per `budget_window_seconds`.
    budget_count: Mapped[int] = mapped_column(Integer, default=0)
    budget_window_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    budget_per_actor: Mapped[bool] = mapped_column(Boolean, default=False)
    # Approval gate: matched actions wait in `approval_requests`.
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_timeout_seconds: Mapped[int] = mapped_column(Integer, default=300)
    # In-app notification when this rule fires (opt-in: noisy sensor rules
    # stay silent by default).
    notify_on_fire: Mapped[bool] = mapped_column(Boolean, default=False)
    # Last saved canvas graph and its version. `graph` is a serialized
    # FlowSpec; `graph_version` matches TriggerRuleVersion.version.
    graph: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    graph_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    actions: Mapped[List[TriggerAction]] = relationship(
        "TriggerAction",
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by=_action_order_by,
        lazy="selectin",
    )

    labels: Mapped[List[TriggerRuleLabel]] = relationship(
        "TriggerRuleLabel",
        secondary="trigger_rule_label_map",
        back_populates="rules",
        lazy="selectin",
    )

    event_links: Mapped[List[TriggerRuleEvent]] = relationship(
        "TriggerRuleEvent",
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by="TriggerRuleEvent.sort_order",
        lazy="selectin",
    )


class TriggerRuleVersion(Base):
    """Immutable canvas graph snapshots for visual diff/restore."""

    __tablename__ = "trigger_rule_versions"
    __table_args__ = (
        UniqueConstraint("rule_id", "version", name="uq_trigger_rule_version"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    rule_id: Mapped[str] = mapped_column(
        ForeignKey("trigger_rules.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    graph: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
