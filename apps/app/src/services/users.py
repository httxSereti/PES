from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

import structlog
from cuid2 import Cuid

from api.helpers.generate_magic_token import generate_magic_token, hash_magic_token
from database.connection import Database
from database.models.magic_token import MagicTokenModel
from database.models.user import UserModel
from database.repositories.magic_token_repo import MagicTokenRepo
from database.repositories.user_repo import UserRepo
from models import User
from store import Store
from typings import Permission, Role

logger = structlog.get_logger("pes")

CUID_GENERATOR: Cuid = Cuid(length=7)
MAGIC_TOKEN_TTL_DAYS = 7
GUEST_USER_ID = "guest"


class UserService:
    """
    Bridge between the SQLite-backed user records and the in-memory Store
    cache. All user mutations go through here: write-through to the DB, then
    update the cache and any live WS permission snapshot.
    """

    def __init__(self, db: Database | None = None):
        self._users = UserRepo(db)
        self._tokens = MagicTokenRepo(db)
        self._store = Store()

    # ── Cache ↔ record mapping ──

    @staticmethod
    def _to_domain(row: UserModel) -> User:
        return User(
            id=row.id,
            display_name=row.display_name,
            is_active=row.is_active,
            created_at=row.created_at or datetime.utcnow(),
            last_login_at=row.last_login_at,
            role=Role(row.role),
            custom_permissions={
                Permission(p) for p in (row.custom_permissions or [])
            },
        )

    async def load_from_db(self) -> int:
        """Populate the Store cache from the `users` table. Called at startup."""
        rows = await self._users.get_all()
        for row in rows:
            self._store.add_user(self._to_domain(row))
        logger.info(f"[Users] Loaded {len(rows)} user(s) from database")
        return len(rows)

    # ── Creation & bootstrap ──

    async def _issue_magic_token(self, user_id: str) -> str:
        """Persist a fresh magic token for a user; returns the raw token."""
        raw_token = generate_magic_token()
        now = datetime.utcnow()
        await self._tokens.create(
            MagicTokenModel(
                id=CUID_GENERATOR.generate(),
                token_hash=hash_magic_token(raw_token),
                user_id=user_id,
                created_at=now,
                expires_at=now + timedelta(days=MAGIC_TOKEN_TTL_DAYS),
            )
        )
        return raw_token

    async def create_user(
        self, role: Role, display_name: Optional[str]
    ) -> tuple[User, str]:
        """Persist a user + its magic token; returns (user, raw_token)."""
        now = datetime.utcnow()

        user = User(
            id=CUID_GENERATOR.generate(),
            display_name=display_name,
            role=role,
            created_at=now,
        )

        await self._users.create(
            UserModel(
                id=user.id,
                display_name=display_name,
                role=role.value,
                custom_permissions=[],
                is_active=True,
                created_at=now,
            )
        )
        raw_token = await self._issue_magic_token(user.id)

        self._store.add_user(user)
        logger.info("[Users] Created user", user_id=user.id, role=role.value)
        return user, raw_token

    async def generate_magic_link_for_user(self, user_id: str) -> Optional[str]:
        """Issue a fresh magic token for an existing user (previous unused
        tokens are revoked). Returns the raw token, or None if unknown."""
        if self._store.get_user(user_id) is None:
            record = await self._users.get_by_id(user_id)
            if record is None:
                return None
            self._store.add_user(self._to_domain(record))

        await self._tokens.revoke_for_user(user_id)
        raw_token = await self._issue_magic_token(user_id)
        logger.info("[Users] Magic link issued", user_id=user_id)
        return raw_token

    async def ensure_root_bootstrap(self) -> str:
        """
        Guarantee a usable ROOT login at every startup: create the ROOT user
        when none exists, then always issue a FRESH magic token (previous
        unused tokens are revoked) and print the link to the console.
        """
        record = await self._users.get_active_root()
        if record is None:
            user, _ = await self.create_user(Role.ROOT, "Sereti")
            logger.info("[Users] ROOT bootstrap created", user_id=user.id)
        else:
            user = self._store.get_user(record.id)
            if user is None:
                user = self._to_domain(record)
                self._store.add_user(user)

        await self._tokens.revoke_for_user(user.id)
        raw_token = await self._issue_magic_token(user.id)

        link = f"{os.getenv('FRONT_URL')}/auth?magic_token={raw_token}"
        print(f"root magic url {link}")
        logger.info("[Users] ROOT magic link rotated", user_id=user.id)
        return link

    def get_or_create_guest(self) -> User:
        """Ephemeral shared guest identity — never persisted."""
        user = self._store.get_user(GUEST_USER_ID)
        if user is None:
            user = User(
                id=GUEST_USER_ID,
                display_name="Guest",
                role=Role.GUEST,
            )
            self._store.add_user(user)
        return user

    # ── Authentication ──

    async def authenticate_magic_token(self, raw_token: str) -> Optional[User]:
        """
        Exchange a raw magic token for its user. Enforces expiry, revocation
        and single-use; marks the token used and touches last_login_at.
        """
        row = await self._tokens.get_by_hash(hash_magic_token(raw_token))
        if row is None or row.revoked or row.used_at is not None:
            return None
        if row.expires_at < datetime.utcnow():
            return None

        user = self._store.get_user(row.user_id)
        if user is None:
            record = await self._users.get_by_id(row.user_id)
            if record is None:
                return None
            user = self._to_domain(record)
            self._store.add_user(user)

        if not user.is_active:
            return None

        await self._tokens.mark_used(row.id)
        await self._users.touch_last_login(user.id)
        user.last_login_at = datetime.utcnow()
        return user

    # ── Role / permission mutations ──

    async def set_user_role(self, user_id: str, role: Role) -> bool:
        """
        Write-through role change: DB, cache, live WS permission snapshot,
        then nudge the user's clients to re-fetch their profile.
        """
        if self._store.get_user(user_id) is None:
            return False

        await self._users.update_role(user_id, role.value)
        self._store.set_user_role(user_id, role)

        user = self._store.get_user(user_id)
        self._store.websocket.update_permissions(user_id, user.get_permissions())
        await self._store.websocket.send_personal_message(
            {"type": "auth:refresh"}, user_id
        )
        logger.info("[Users] Role updated", user_id=user_id, role=role.value)
        return True

    async def set_user_permissions(
        self,
        user_id: str,
        grant: Optional[set] = None,
        revoke: Optional[set] = None,
    ) -> bool:
        """
        Write-through custom-permission change: DB, cache, live WS permission
        snapshot, then nudge the user's clients to re-fetch their profile.
        `grant`/`revoke` are sets of Permission applied to the custom set only
        (role bundles are untouched).
        """
        user = self._store.get_user(user_id)
        if user is None:
            return False

        current = set(user.custom_permissions)
        target = (current | (grant or set())) - (revoke or set())

        for p in target - current:
            self._store.add_user_permission(user_id, p)
        for p in current - target:
            self._store.remove_user_permission(user_id, p)

        await self._users.update_permissions(
            user_id, [p.value for p in sorted(target, key=lambda x: x.value)]
        )

        updated = self._store.get_user(user_id)
        if updated is None:
            return False
        self._store.websocket.update_permissions(
            user_id, updated.get_permissions()
        )
        await self._store.websocket.send_personal_message(
            {"type": "auth:refresh"}, user_id
        )
        logger.info(
            "[Users] Custom permissions updated",
            user_id=user_id,
            granted=sorted(p.value for p in (target - current)),
            revoked=sorted(p.value for p in (current - target)),
        )
        return True


user_service = UserService()
