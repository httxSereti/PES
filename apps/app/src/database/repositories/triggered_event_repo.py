from __future__ import annotations

from typing import Dict, List

from sqlalchemy import func, select

from database.connection import Database
from database.models.triggered_event import TriggeredEvent


class TriggeredEventRepo:
    """
    Repository for TriggeredEvent persistence.
    Handles saving events and retrieving the most recent ones for WS replay.
    """

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def save(self, event: TriggeredEvent) -> None:
        """Persist a triggered event."""
        async with self._db.session_maker() as session:
            session.add(event)
            await session.commit()

    async def get_recent(self, limit: int = 250) -> List[TriggeredEvent]:
        """
        Return the most recent `limit` events, ordered oldest-first
        so the client can replay them in chronological order.
        """
        async with self._db.session_maker() as session:
            # Inner sub-query: get the N most recent by triggered_at DESC
            subq = (
                select(TriggeredEvent)
                .order_by(TriggeredEvent.triggered_at.desc())
                .limit(limit)
                .subquery()
            )
            # Outer query: return them chronologically (oldest first)
            stmt = (
                select(TriggeredEvent)
                .join(subq, TriggeredEvent.id == subq.c.id)
                .order_by(TriggeredEvent.triggered_at.asc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_by_session(
        self, session_id: str, limit: int = 500
    ) -> List[TriggeredEvent]:
        """Events recorded during one application session, chronological."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(TriggeredEvent)
                .where(TriggeredEvent.session_id == session_id)
                .order_by(TriggeredEvent.triggered_at.asc())
                .limit(limit)
            )
            result = await db_session.execute(stmt)
            return list(result.scalars().all())

    async def count_by_sessions(self, session_ids: List[str]) -> Dict[str, int]:
        """Event counts per application session id (one grouped query)."""
        if not session_ids:
            return {}
        async with self._db.session_maker() as db_session:
            stmt = (
                select(TriggeredEvent.session_id, func.count())
                .where(TriggeredEvent.session_id.in_(session_ids))
                .group_by(TriggeredEvent.session_id)
            )
            result = await db_session.execute(stmt)
            return {session_id: count for session_id, count in result.all()}
