from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import delete, select

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

    async def update_display_name(self, user_id: str, display_name: str) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user = result.scalars().first()
            if user is not None:
                user.display_name = display_name
                await session.commit()

    async def update_active(self, user_id: str, is_active: bool) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user = result.scalars().first()
            if user is not None:
                user.is_active = is_active
                await session.commit()

    async def delete(self, user_id: str) -> bool:
        """Delete a user row. Returns False when the user doesn't exist."""
        async with self._db.session_maker() as session:
            result = await session.execute(
                delete(UserModel).where(UserModel.id == user_id)
            )
            await session.commit()
            return result.rowcount > 0

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

    async def migrate_legacy_root_role(self) -> None:
        """Rewrite legacy 'root' role/permissions to 'host' (backward compat)."""
        async with self._db.session_maker() as session:
            result = await session.execute(select(UserModel))
            changed = False
            for row in result.scalars().all():
                if row.role == "root":
                    row.role = "host"
                    changed = True
                if row.custom_permissions and "root" in row.custom_permissions:
                    row.custom_permissions = [
                        "host" if p == "root" else p for p in row.custom_permissions
                    ]
                    changed = True
            if changed:
                await session.commit()
