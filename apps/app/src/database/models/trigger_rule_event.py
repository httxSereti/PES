from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base

if TYPE_CHECKING:
    from .trigger_rule import TriggerRule


class TriggerRuleEvent(Base):
    """One event type that can trigger a rule.

    A rule can listen to several events; `trigger_rules.event_type` is kept as
    the legacy single-event field (first selection) for older data/clients.
    """

    __tablename__ = "trigger_rule_events"

    trigger_rule_id: Mapped[str] = mapped_column(
        ForeignKey("trigger_rules.id", ondelete="CASCADE"), primary_key=True
    )
    event_type: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    rule: Mapped[TriggerRule] = relationship(
        "TriggerRule", back_populates="event_links"
    )
