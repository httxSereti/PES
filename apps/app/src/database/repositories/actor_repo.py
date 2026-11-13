"""Repository for unified actors and platform identities."""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

from cuid2 import cuid_wrapper
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from database.connection import Database
from database.models.actor import Actor, ActorIdentity

generate_id = cuid_wrapper()


def _slug_base(value: str | None, fallback: str) -> str:
    raw = (value or "").strip().lower()
    # Normalize accents so "Séreti" and "Sereti" resolve to the same slug.
    raw = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return slug or fallback


class ActorRepo:
    """Resolve `(platform, platform_id)` pairs to a single PES actor."""

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def resolve(
        self,
        *,
        platform: str,
        platform_id: str,
        display_name: str | None = None,
        is_bot: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> Actor:
        """
        Find or create the actor for a platform identity.

        The identity is the source of truth: display names can change without
        creating a second actor. A race on first sight is handled by rolling
        back and re-reading the identity.
        """

        platform = platform.strip() or "unknown"
        platform_id = str(platform_id).strip()
        if not platform_id:
            raise ValueError("platform_id is required")

        now = datetime.now(UTC)
        async with self._db.session_maker() as session:
            identity = await session.get(
                ActorIdentity, (platform, platform_id)
            )
            if identity is not None:
                actor = await session.get(Actor, identity.actor_id)
                if actor is not None:
                    identity.last_seen_at = now
                    actor.last_seen_at = now
                    if display_name:
                        identity.display_name = display_name
                    if metadata:
                        identity.metadata_json = {
                            **(identity.metadata_json or {}),
                            **metadata,
                        }
                    await session.commit()
                    await session.refresh(actor)
                    return actor

            actor_id = generate_id()
            slug = await self._unique_slug(
                session, _slug_base(display_name, f"{platform}-{platform_id}")
            )
            actor = Actor(
                id=actor_id,
                slug=slug,
                display_name=display_name or platform_id,
                first_seen_at=now,
                last_seen_at=now,
            )
            identity = ActorIdentity(
                platform=platform,
                platform_id=platform_id,
                actor_id=actor_id,
                display_name=display_name,
                metadata_json=metadata or {},
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add_all([actor, identity])
            try:
                await session.commit()
            except IntegrityError:
                # Another dispatch created the same identity concurrently.
                await session.rollback()
                identity = await session.get(
                    ActorIdentity, (platform, platform_id)
                )
                if identity is None:
                    raise
                actor = await session.get(Actor, identity.actor_id)
                if actor is None:
                    raise
                return actor

            await session.refresh(actor)
            return actor

    async def get(self, actor_id: str) -> Actor | None:
        async with self._db.session_maker() as session:
            return await session.get(
                Actor, actor_id, options=[selectinload(Actor.identities)]
            )

    async def get_by_slug(self, slug: str) -> Actor | None:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(Actor)
                .options(selectinload(Actor.identities))
                .where(Actor.slug == slug)
            )
            return result.scalar_one_or_none()

    async def list(self, *, limit: int = 100, offset: int = 0) -> list[Actor]:
        async with self._db.session_maker() as session:
            result = await session.execute(
                select(Actor)
                .options(selectinload(Actor.identities))
                .order_by(Actor.last_seen_at.desc())
                .limit(limit)
                .offset(offset)
            )
            return list(result.scalars().all())

    async def set_blocked(self, actor_id: str, blocked: bool) -> Actor | None:
        async with self._db.session_maker() as session:
            actor = await session.get(Actor, actor_id)
            if actor is None:
                return None
            actor.is_blocked = blocked
            await session.commit()
            await session.refresh(actor)
            return actor

    async def _unique_slug(self, session, base: str) -> str:
        candidate = base
        suffix = 2
        while True:
            exists = await session.scalar(
                select(Actor.id).where(Actor.slug == candidate)
            )
            if exists is None:
                return candidate
            candidate = f"{base}-{suffix}"
            suffix += 1
