"""Repository for Events v3 flows, versions, runs and effect ledger."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Iterable

from cuid2 import cuid_wrapper
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from database.connection import Database
from database.models.flow import (
    EffectLedger,
    FlowDef,
    FlowRun,
    FlowTriggerIndex,
    FlowVersion,
    NodeRun,
)

generate_id = cuid_wrapper()


class FlowRepo:
    """Persistence facade used by the shadow recorder and, later, the compiler."""

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    # ───────── Flow definitions ─────────

    async def create_flow(
        self,
        *,
        name: str,
        graph: dict | None = None,
        settings: dict | None = None,
        description: str | None = None,
        status: str = "draft",
        created_by: str | None = None,
        legacy_rule_id: str | None = None,
    ) -> FlowDef:
        flow = FlowDef(
            id=generate_id(),
            name=name,
            description=description,
            status=status,
            graph=graph or {},
            settings=settings or {},
            created_by=created_by,
            legacy_rule_id=legacy_rule_id,
        )
        async with self._db.session_maker() as session:
            session.add(flow)
            await session.commit()
            await session.refresh(flow)
            return flow

    async def get_flow(self, flow_id: str) -> FlowDef | None:
        async with self._db.session_maker() as session:
            return await session.get(
                FlowDef, flow_id, options=[selectinload(FlowDef.versions)]
            )

    async def list_flows(
        self, *, status: str | None = None, limit: int = 100, offset: int = 0
    ) -> list[FlowDef]:
        async with self._db.session_maker() as session:
            stmt = select(FlowDef).order_by(FlowDef.updated_at.desc())
            if status is not None:
                stmt = stmt.where(FlowDef.status == status)
            stmt = stmt.limit(limit).offset(offset)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def update_flow(
        self,
        flow_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        graph: dict | None = None,
        settings: dict | None = None,
        status: str | None = None,
    ) -> FlowDef | None:
        async with self._db.session_maker() as session:
            flow = await session.get(FlowDef, flow_id)
            if flow is None:
                return None
            if name is not None:
                flow.name = name
            if description is not None:
                flow.description = description
            if graph is not None:
                flow.graph = graph
            if settings is not None:
                flow.settings = settings
            if status is not None:
                flow.status = status
            await session.commit()
            await session.refresh(flow)
            return flow

    async def delete_flow(self, flow_id: str) -> bool:
        async with self._db.session_maker() as session:
            flow = await session.get(FlowDef, flow_id)
            if flow is None:
                return False
            await session.execute(
                delete(FlowTriggerIndex).where(FlowTriggerIndex.flow_id == flow_id)
            )
            await session.delete(flow)
            await session.commit()
            return True

    async def publish_flow(
        self,
        flow_id: str,
        *,
        graph: dict | None = None,
        compiled: dict | None = None,
        patterns: Iterable[str] | None = None,
        published_by: str | None = None,
    ) -> FlowVersion | None:
        """
        Publish a new immutable version and rebuild the trigger index.

        `patterns` are the event patterns this flow listens to. The compiler
        will derive them from trigger nodes in phase 1; phase 0 accepts them
        explicitly so the index can be tested.
        """

        now = datetime.now(UTC)
        async with self._db.session_maker() as session:
            flow = await session.get(FlowDef, flow_id)
            if flow is None:
                return None

            current = await session.scalar(
                select(FlowVersion.version)
                .where(FlowVersion.flow_id == flow_id)
                .order_by(FlowVersion.version.desc())
                .limit(1)
            )
            version = (current or 0) + 1
            published_graph = graph if graph is not None else flow.graph
            version_row = FlowVersion(
                flow_id=flow_id,
                version=version,
                graph=published_graph,
                compiled=compiled,
                published_at=now,
                published_by=published_by,
            )
            session.add(version_row)

            flow.current_version = version
            flow.status = "published"
            if graph is not None:
                flow.graph = graph

            if patterns is not None:
                await session.execute(
                    delete(FlowTriggerIndex).where(
                        FlowTriggerIndex.flow_id == flow_id
                    )
                )
                priority = int((flow.settings or {}).get("priority", 0))
                for pattern in dict.fromkeys(pattern.strip() for pattern in patterns):
                    if pattern:
                        session.add(
                            FlowTriggerIndex(
                                flow_id=flow_id,
                                pattern=pattern,
                                priority=priority,
                            )
                        )

            await session.commit()
            await session.refresh(version_row)
            return version_row

    # ───────── Runs and telemetry ─────────

    async def save_run(
        self,
        run: FlowRun,
        *,
        node_runs: Iterable[NodeRun] = (),
        effects: Iterable[EffectLedger] = (),
    ) -> FlowRun:
        async with self._db.session_maker() as session:
            session.add(run)
            for node_run in node_runs:
                node_run.run_id = run.id
                session.add(node_run)
            for effect in effects:
                effect.run_id = run.id
                session.add(effect)
            await session.commit()
            await session.refresh(run)
            return run

    async def get_run(self, run_id: str) -> FlowRun | None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(FlowRun)
                .options(
                    selectinload(FlowRun.node_runs),
                    selectinload(FlowRun.effects),
                )
                .where(FlowRun.id == run_id)
            )
            return result.scalar_one_or_none()

    async def list_runs(
        self,
        *,
        event_id: str | None = None,
        flow_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[FlowRun]:
        async with self._db.session_maker() as session:
            stmt = select(FlowRun).order_by(FlowRun.started_at.desc())
            if event_id is not None:
                stmt = stmt.where(FlowRun.event_id == event_id)
            if flow_id is not None:
                stmt = stmt.where(FlowRun.flow_id == flow_id)
            stmt = stmt.limit(limit).offset(offset)
            result = await session.execute(stmt)
            return list(result.scalars().all())
