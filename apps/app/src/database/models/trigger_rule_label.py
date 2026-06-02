from __future__ import annotations
from typing import List, TYPE_CHECKING, Optional
from sqlalchemy import String, Table, Column, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base

if TYPE_CHECKING:
    from .trigger_rule import TriggerRule

trigger_rule_label_map = Table(
    "trigger_rule_label_map",
    Base.metadata,
    Column(
        "rule_id",
        String,
        ForeignKey("trigger_rules.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "label_id",
        String,
        ForeignKey("trigger_rule_labels.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class TriggerRuleLabel(Base):
    __tablename__ = "trigger_rule_labels"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    rules: Mapped[List[TriggerRule]] = relationship(
        "TriggerRule", secondary=trigger_rule_label_map, back_populates="labels"
    )
