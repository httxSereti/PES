from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select

from database.connection import Database
from database.models.magic_token import MagicTokenModel


class MagicTokenRepo:
    """Repository for magic login tokens (hashed, expiring, single-use)."""

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def create(self, token: MagicTokenModel) -> None:
        async with self._db.session_maker() as session:
            session.add(token)
            await session.commit()

    async def get_by_hash(self, token_hash: str) -> Optional[MagicTokenModel]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(MagicTokenModel).where(
                    MagicTokenModel.token_hash == token_hash
                )
            )
            return result.scalars().first()

    async def mark_used(self, token_id: str) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(MagicTokenModel).where(MagicTokenModel.id == token_id)
            )
            token = result.scalars().first()
            if token is not None:
                token.used_at = datetime.utcnow()
                await session.commit()

    async def revoke_for_user(self, user_id: str) -> None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(MagicTokenModel).where(
                    MagicTokenModel.user_id == user_id,
                    MagicTokenModel.used_at.is_(None),
                    MagicTokenModel.revoked.is_(False),
                )
            )
            for token in result.scalars().all():
                token.revoked = True
            await session.commit()
