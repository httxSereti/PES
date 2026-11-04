from __future__ import annotations

from typing import List, Optional

from cuid2 import cuid_wrapper
from sqlalchemy import delete, select, update
from sqlalchemy.orm import noload, selectinload

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
        app_session_id: str | None = None,
        program_id: str | None = None,
        program_step: int | None = None,
        mode: str = "manual",
        participant_ids: list[str] | None = None,
    ) -> EdgingSession:
        session = EdgingSession(
            id=generate_id(),
            name=name,
            goals=goals,
            auto_stop_on_goal=auto_stop_on_goal,
            initiator=initiator,
            initiator_user_id=initiator_user_id,
            created_by=created_by,
            app_session_id=app_session_id,
            program_id=program_id,
            program_step=program_step,
            mode=mode,
            participant_ids=participant_ids or [],
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

    async def get_running_session(
        self, *, load_edges: bool = True
    ) -> Optional[EdgingSession]:
        """The live session, if any (status == running).

        ``load_edges=False`` skips the eager edges load; the auto-stop tick
        uses it to check the flag every second without loading a long history.
        """
        async with self._db.session_maker() as db_session:
            edges_option = (
                selectinload(EdgingSession.edges)
                if load_edges
                else noload(EdgingSession.edges)
            )
            stmt = (
                select(EdgingSession)
                .options(edges_option)
                .where(EdgingSession.status == "running")
                .order_by(EdgingSession.started_at.desc())
                .limit(1)
            )
            result = await db_session.execute(stmt)
            return result.scalar_one_or_none()

    async def list_running_sessions(self) -> List[EdgingSession]:
        """Every session still marked running (startup/shutdown recovery)."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(EdgingSession)
                .options(selectinload(EdgingSession.edges))
                .where(EdgingSession.status == "running")
                .order_by(EdgingSession.started_at.desc())
            )
            result = await db_session.execute(stmt)
            return list(result.scalars().all())

    async def list_running_sessions_for_app_session(
        self, app_session_id: str
    ) -> List[EdgingSession]:
        """Running training sessions linked to one application session."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(EdgingSession)
                .options(selectinload(EdgingSession.edges))
                .where(
                    EdgingSession.status == "running",
                    EdgingSession.app_session_id == app_session_id,
                )
                .order_by(EdgingSession.started_at.desc())
            )
            result = await db_session.execute(stmt)
            return list(result.scalars().all())

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

    async def update_session_if_status(
        self, session_id: str, expected_status: str, **fields
    ) -> Optional[EdgingSession]:
        """Atomically update a session only while it is in `expected_status`.

        Returns None when the row no longer matches, so callers can tell that
        another coroutine (timer, edge, end) already moved the session.
        """
        async with self._db.session_maker() as db_session:
            stmt = (
                update(EdgingSession)
                .where(
                    EdgingSession.id == session_id,
                    EdgingSession.status == expected_status,
                )
                .values(**fields)
            )
            result = await db_session.execute(stmt)
            await db_session.commit()
            if result.rowcount == 0:
                return None
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
        source: str = "host",
        interval_seconds: int | None = None,
        level_snapshot: dict | None = None,
        note: str | None = None,
        client_edge_id: str | None = None,
    ) -> Optional[EdgingEdge]:
        edge = EdgingEdge(
            id=generate_id(),
            session_id=session_id,
            difficulty=difficulty,
            outcome=outcome,
            recorded_by=recorded_by,
            source=source,
            interval_seconds=interval_seconds,
            level_snapshot=level_snapshot,
            note=note,
            client_edge_id=client_edge_id,
        )
        async with self._db.session_maker() as db_session:
            session = await db_session.get(EdgingSession, session_id)
            if not session or session.status != "running":
                return None
            db_session.add(edge)
            await db_session.commit()
            await db_session.refresh(edge)
            return edge

    async def get_edge_by_client_id(
        self, session_id: str, client_edge_id: str
    ) -> Optional[EdgingEdge]:
        """Find an already-recorded edge by its client idempotency key."""
        async with self._db.session_maker() as db_session:
            stmt = select(EdgingEdge).where(
                EdgingEdge.session_id == session_id,
                EdgingEdge.client_edge_id == client_edge_id,
            )
            result = await db_session.execute(stmt)
            return result.scalar_one_or_none()

    async def delete_edge(self, session_id: str, edge_id: str) -> bool:
        """Delete one edge, restricted to the session it belongs to."""
        async with self._db.session_maker() as db_session:
            stmt = delete(EdgingEdge).where(
                EdgingEdge.id == edge_id,
                EdgingEdge.session_id == session_id,
            )
            result = await db_session.execute(stmt)
            await db_session.commit()
            return result.rowcount > 0
