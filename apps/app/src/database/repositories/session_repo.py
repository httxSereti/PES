from __future__ import annotations

from typing import List, Optional

from cuid2 import cuid_wrapper
from sqlalchemy import delete, select

from database.connection import Database
from database.models import AppSession

generate_id = cuid_wrapper()


class SessionRepo:
    """
    Repository for application sessions (the app-level lifecycle).
    """

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def create_session(
        self,
        *,
        session_type: str,
        name: str,
        description: str | None,
        unit_ids: list[str],
        sensor_ids: list[str],
        created_by: str,
    ) -> AppSession:
        session = AppSession(
            id=generate_id(),
            type=session_type,
            name=name,
            description=description,
            unit_ids=unit_ids,
            sensor_ids=sensor_ids,
            status="running",
            created_by=created_by,
        )
        async with self._db.session_maker() as db_session:
            db_session.add(session)
            await db_session.commit()
            await db_session.refresh(session)
            return session

    async def get_session(self, session_id: str) -> Optional[AppSession]:
        async with self._db.session_maker() as db_session:
            stmt = select(AppSession).where(AppSession.id == session_id)
            result = await db_session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_active_session(self) -> Optional[AppSession]:
        """The running application session, if any."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(AppSession)
                .where(AppSession.status == "running")
                .order_by(AppSession.started_at.desc())
                .limit(1)
            )
            result = await db_session.execute(stmt)
            return result.scalar_one_or_none()

    async def list_sessions(self, limit: int = 100) -> List[AppSession]:
        """All sessions, newest first."""
        async with self._db.session_maker() as db_session:
            stmt = (
                select(AppSession)
                .order_by(AppSession.created_at.desc())
                .limit(limit)
            )
            result = await db_session.execute(stmt)
            return list(result.scalars().all())

    async def delete_session(self, session_id: str) -> bool:
        async with self._db.session_maker() as db_session:
            stmt = delete(AppSession).where(AppSession.id == session_id)
            result = await db_session.execute(stmt)
            await db_session.commit()
            return result.rowcount > 0

    async def update_session(
        self, session_id: str, **fields
    ) -> Optional[AppSession]:
        async with self._db.session_maker() as db_session:
            session = await db_session.get(AppSession, session_id)
            if not session:
                return None
            for key, value in fields.items():
                setattr(session, key, value)
            await db_session.commit()
        return await self.get_session(session_id)
