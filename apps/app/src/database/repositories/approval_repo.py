"""Persistence for approval requests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Iterable

from cuid2 import cuid_wrapper
from sqlalchemy import select, update

from database.connection import Database
from database.models.approval import ApprovalRequest

generate_id = cuid_wrapper()


class ApprovalRepo:
    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    async def create(
        self,
        *,
        event_id: str,
        rule_id: str,
        rule_name: str,
        items: Iterable[dict],
        summary: dict,
        timeout_seconds: int = 300,
        now: datetime | None = None,
    ) -> ApprovalRequest:
        requested_at = now or datetime.now(UTC)
        request = ApprovalRequest(
            id=generate_id(),
            event_id=event_id,
            rule_id=rule_id,
            rule_name=rule_name,
            status="pending",
            items=list(items),
            summary=summary,
            requested_at=requested_at,
            expires_at=requested_at + timedelta(seconds=max(30, timeout_seconds)),
        )
        async with self._db.session_maker() as session:
            session.add(request)
            await session.commit()
            await session.refresh(request)
            return request

    async def get(self, request_id: str) -> ApprovalRequest | None:
        async with self._db.session_maker() as session:
            return await session.get(ApprovalRequest, request_id)

    async def list(
        self,
        *,
        status: str | None = "pending",
        limit: int = 50,
        offset: int = 0,
    ) -> list[ApprovalRequest]:
        async with self._db.session_maker() as session:
            stmt = select(ApprovalRequest).order_by(
                ApprovalRequest.requested_at.desc()
            )
            if status is not None:
                stmt = stmt.where(ApprovalRequest.status == status)
            stmt = stmt.limit(limit).offset(offset)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def expire_stale(self) -> int:
        """Mark pending requests past their deadline as expired."""
        async with self._db.session_maker() as session:
            result = await session.execute(
                update(ApprovalRequest)
                .where(
                    ApprovalRequest.status == "pending",
                    ApprovalRequest.expires_at < datetime.now(UTC),
                )
                .values(status="expired", resolved_at=datetime.now(UTC))
            )
            await session.commit()
            return int(result.rowcount or 0)

    async def resolve(
        self,
        request_id: str,
        *,
        status: str,
        resolved_by: str | None = None,
        reason: str | None = None,
    ) -> ApprovalRequest | None:
        async with self._db.session_maker() as session:
            request = await session.get(ApprovalRequest, request_id)
            if request is None:
                return None
            if request.status != "pending":
                return request
            request.status = status
            request.resolved_at = datetime.now(UTC)
            request.resolved_by = resolved_by
            request.reason = reason
            await session.commit()
            await session.refresh(request)
            return request
