from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Integer, String
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
