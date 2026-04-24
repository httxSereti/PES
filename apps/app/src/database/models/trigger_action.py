from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, JSON, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base
from events.enums import ActionType

if TYPE_CHECKING:
    from .trigger_rule import TriggerRule

class TriggerAction(Base):
    __tablename__ = "trigger_actions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    trigger_rule_id: Mapped[str] = mapped_column(String, ForeignKey("trigger_rules.id"))
    action_type: Mapped[ActionType] = mapped_column(SQLEnum(ActionType))
    payload: Mapped[dict] = mapped_column(JSON)
    duration: Mapped[int] = mapped_column(Integer, default=-1)
    cumulative: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    rule: Mapped[TriggerRule] = relationship("TriggerRule", back_populates="actions")
