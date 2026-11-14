"""Persistence for editable trigger-rule canvas graphs and versions."""

from __future__ import annotations

from datetime import datetime

from cuid2 import cuid_wrapper
from sqlalchemy import func, select

from database.connection import Database
from database.models.trigger_rule import TriggerRule, TriggerRuleVersion

generate_id = cuid_wrapper()


class TriggerRuleGraphRepo:
    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def get_graph(self, rule_id: str) -> dict | None:
        async with self._db.session_maker() as session:
            rule = await session.get(TriggerRule, rule_id)
            return dict(rule.graph) if rule is not None and rule.graph else None

    async def list_versions(self, rule_id: str) -> list[TriggerRuleVersion]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(TriggerRuleVersion)
                .where(TriggerRuleVersion.rule_id == rule_id)
                .order_by(TriggerRuleVersion.version.desc())
            )
            return list(result.scalars().all())

    async def get_version(
        self, rule_id: str, version: int
    ) -> TriggerRuleVersion | None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(TriggerRuleVersion).where(
                    TriggerRuleVersion.rule_id == rule_id,
                    TriggerRuleVersion.version == version,
                )
            )
            return result.scalar_one_or_none()

    async def save_graph(
        self,
        rule_id: str,
        graph: dict,
        *,
        created_by: str | None = None,
    ) -> TriggerRuleVersion | None:
        async with self._db.session_maker() as session:
            rule = await session.get(TriggerRule, rule_id)
            if rule is None:
                return None
            current = await session.scalar(
                select(func.max(TriggerRuleVersion.version)).where(
                    TriggerRuleVersion.rule_id == rule_id
                )
            )
            version = max(int(current or 0), int(rule.graph_version or 0)) + 1
            row = TriggerRuleVersion(
                id=generate_id(),
                rule_id=rule_id,
                version=version,
                graph=graph,
                created_at=datetime.utcnow(),
                created_by=created_by,
            )
            rule.graph = graph
            rule.graph_version = version
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row
