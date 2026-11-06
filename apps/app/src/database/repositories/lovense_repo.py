"""Persistence for the Lovense integration (nodes, devices, patterns, runs)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select

from database.connection import Database
from database.models.lovense import (
    LovenseDevice,
    LovenseNode,
    LovensePattern,
    LovenseRun,
)


class LovenseRepo:
    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    # ───────── Nodes ─────────

    async def list_nodes(self) -> list[LovenseNode]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovenseNode).order_by(LovenseNode.created_at.asc())
            )
            return list(result.scalars().all())

    async def get_node(self, node_id: str) -> LovenseNode | None:
        async with self._db.session_maker() as session:
            return await session.get(LovenseNode, node_id)

    async def save_node(self, node: LovenseNode) -> LovenseNode:
        async with self._db.session_maker() as session:
            merged = await session.merge(node)
            await session.commit()
            return merged

    async def delete_node(self, node_id: str) -> None:
        async with self._db.session_maker() as session:
            node = await session.get(LovenseNode, node_id)
            if node is not None:
                await session.delete(node)
            await session.execute(
                delete(LovenseDevice).where(LovenseDevice.node_id == node_id)
            )
            await session.commit()

    async def touch_node(self, node_id: str) -> None:
        async with self._db.session_maker() as session:
            node = await session.get(LovenseNode, node_id)
            if node is not None:
                node.last_seen_at = datetime.now(UTC).replace(tzinfo=None)
                await session.commit()

    # ───────── Devices ─────────

    async def list_devices(self) -> list[LovenseDevice]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovenseDevice).order_by(LovenseDevice.created_at.asc())
            )
            return list(result.scalars().all())

    async def get_device(self, device_id: str) -> LovenseDevice | None:
        async with self._db.session_maker() as session:
            return await session.get(LovenseDevice, device_id)

    async def find_device(
        self, node_id: str, device_index: int
    ) -> LovenseDevice | None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovenseDevice).where(
                    LovenseDevice.node_id == node_id,
                    LovenseDevice.device_index == device_index,
                )
            )
            return result.scalars().first()

    async def save_device(self, device: LovenseDevice) -> LovenseDevice:
        async with self._db.session_maker() as session:
            merged = await session.merge(device)
            await session.commit()
            return merged

    async def update_device(
        self, device_id: str, changes: dict[str, Any]
    ) -> LovenseDevice | None:
        async with self._db.session_maker() as session:
            device = await session.get(LovenseDevice, device_id)
            if device is None:
                return None
            for key, value in changes.items():
                if hasattr(device, key):
                    setattr(device, key, value)
            await session.commit()
            return device

    async def delete_device(self, device_id: str) -> None:
        async with self._db.session_maker() as session:
            device = await session.get(LovenseDevice, device_id)
            if device is not None:
                await session.delete(device)
            await session.commit()

    # ───────── Patterns ─────────

    async def list_patterns(self) -> list[LovensePattern]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovensePattern).order_by(LovensePattern.name.asc())
            )
            return list(result.scalars().all())

    async def get_pattern(self, pattern_id: str) -> LovensePattern | None:
        async with self._db.session_maker() as session:
            return await session.get(LovensePattern, pattern_id)

    async def get_pattern_by_name(self, name: str) -> LovensePattern | None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovensePattern).where(LovensePattern.name == name)
            )
            return result.scalars().first()

    async def save_pattern(self, pattern: LovensePattern) -> LovensePattern:
        async with self._db.session_maker() as session:
            merged = await session.merge(pattern)
            await session.commit()
            return merged

    async def delete_pattern(self, pattern_id: str) -> None:
        async with self._db.session_maker() as session:
            pattern = await session.get(LovensePattern, pattern_id)
            if pattern is not None:
                await session.delete(pattern)
            await session.commit()

    # ───────── Runs ─────────

    async def list_active_runs(self) -> list[LovenseRun]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovenseRun).where(LovenseRun.status == "running")
            )
            return list(result.scalars().all())

    async def save_run(self, run: LovenseRun) -> LovenseRun:
        async with self._db.session_maker() as session:
            merged = await session.merge(run)
            await session.commit()
            return merged

    async def finish_run(
        self, run_id: str, status: str, error: str | None = None
    ) -> None:
        async with self._db.session_maker() as session:
            run = await session.get(LovenseRun, run_id)
            if run is not None:
                run.status = status
                run.error = error
                run.ended_at = datetime.now(UTC).replace(tzinfo=None)
                await session.commit()

    async def prune_runs(self, keep: int = 500) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(LovenseRun.id)
                .order_by(LovenseRun.started_at.desc())
                .offset(keep)
            )
            stale = [row[0] for row in result.fetchall()]
            if stale:
                await session.execute(
                    delete(LovenseRun).where(LovenseRun.id.in_(stale))
                )
                await session.commit()
