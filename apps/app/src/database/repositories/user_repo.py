from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import select

from database.connection import Database
from database.models.user import UserModel


class UserRepo:
    """Repository for User persistence (see database/models/user.py)."""

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def get_all(self) -> List[UserModel]:
        async with self._db.session_maker() as session:
            result = await session.execute(select(UserModel))
            return list(result.scalars().all())

    async def get_by_id(self, user_id: str) -> Optional[UserModel]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            return result.scalars().first()

    async def create(self, user: UserModel) -> None:
        async with self._db.session_maker() as session:
            session.add(user)
            await session.commit()

    async def update_role(self, user_id: str, role: str) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user = result.scalars().first()
            if user is not None:
                user.role = role
                await session.commit()

    async def update_permissions(self, user_id: str, permissions: List[str]) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user = result.scalars().first()
            if user is not None:
                user.custom_permissions = permissions
                await session.commit()

    async def touch_last_login(self, user_id: str) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user = result.scalars().first()
            if user is not None:
                user.last_login_at = datetime.utcnow()
                await session.commit()

    async def get_active_host(self) -> Optional[UserModel]:
        """The first active HOST user, if any."""
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(
                    UserModel.role == "host", UserModel.is_active.is_(True)
                )
            )
            return result.scalars().first()
