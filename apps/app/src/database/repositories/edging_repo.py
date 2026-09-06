from __future__ import annotations

from typing import List, Optional

from cuid2 import cuid_wrapper
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from database.connection import Database
from database.models import EdgingEdge, EdgingSession

generate_id = cuid_wrapper()


class EdgingRepo:
    """
    Repository for edging training sessions and their recorded edges.
    """

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    # ───────── Sessions ─────────

    async def create_session(
        self,
        *,
        name: str,
        goals: list[dict],
        auto_stop_on_goal: bool,
        initiator: str,
        initiator_user_id: str | None,
        created_by: str,
    ) -> EdgingSession:
        session = EdgingSession(
            id=generate_id(),
            name=name,
            goals=goals,
            auto_stop_on_goal=auto_stop_on_goal,
            initiator=initiator,
            initiator_user_id=initiator_user_id,
            created_by=created_by,
        )
        async with self._db.session_maker() as db_session:
            db_session.add(session)
            await db_session.commit()
            await db_session.refresh(session)
            return session

    async def get_session(self, session_id: str) -> Optional[EdgingSession]:
        async with self._db.session_maker() as db_session:
            stmt = (
                select(EdgingSession)
                .options(selectinload(EdgingSession.edges))
                .where(EdgingSession.id == session_id)
            )
            result = await db_session.execute(stmt)
            return result.scalar_one_or_none()

    async def list_sessions(self, limit: int = 100) -> List[EdgingSession]:
        """All sessions, newest first, edges included."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(EdgingSession)
                .options(selectinload(EdgingSession.edges))
                .order_by(EdgingSession.created_at.desc())
                .limit(limit)
            )
            result = await db_session.execute(stmt)
            return list(result.scalars().all())

    async def get_running_session(self) -> Optional[EdgingSession]:
        """The live session, if any (status == running)."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(EdgingSession)
                .options(selectinload(EdgingSession.edges))
                .where(EdgingSession.status == "running")
                .order_by(EdgingSession.started_at.desc())
                .limit(1)
            )
            result = await db_session.execute(stmt)
            return result.scalar_one_or_none()

    async def update_session(
        self, session_id: str, **fields
    ) -> Optional[EdgingSession]:
        async with self._db.session_maker() as db_session:
            session = await db_session.get(EdgingSession, session_id)
            if not session:
                return None
            for key, value in fields.items():
                setattr(session, key, value)
            await db_session.commit()
        return await self.get_session(session_id)

    async def delete_session(self, session_id: str) -> bool:
        async with self._db.session_maker() as db_session:
            stmt = delete(EdgingSession).where(EdgingSession.id == session_id)
            result = await db_session.execute(stmt)
            await db_session.commit()
            return result.rowcount > 0

    # ───────── Edges ─────────

    async def add_edge(
        self,
        session_id: str,
        *,
        difficulty: str,
        outcome: str,
        recorded_by: str,
    ) -> Optional[EdgingEdge]:
        edge = EdgingEdge(
            id=generate_id(),
            session_id=session_id,
            difficulty=difficulty,
            outcome=outcome,
            recorded_by=recorded_by,
        )
        async with self._db.session_maker() as db_session:
            session = await db_session.get(EdgingSession, session_id)
            if not session:
                return None
            db_session.add(edge)
            await db_session.commit()
            await db_session.refresh(edge)
            return edge
