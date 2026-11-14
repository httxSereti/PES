"""REST endpoint for the generic webhook connector."""

from __future__ import annotations

import os
import secrets
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Body, Header, HTTPException, Request, status

from integrations.base import IntegrationContext

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = structlog.get_logger("pes")

_ctx: IntegrationContext | None = None
_last_received_at: datetime | None = None
_received_count = 0
_rejected_count = 0


def health() -> dict:
    return {
        "last_received_at": (
            _last_received_at.isoformat() if _last_received_at is not None else None
        ),
        "received_count": _received_count,
        "rejected_count": _rejected_count,
    }


def setup(ctx: IntegrationContext) -> None:
    global _ctx
    _ctx = ctx


def teardown() -> None:
    global _ctx
    _ctx = None


def _ctx_or_503() -> IntegrationContext:
    if _ctx is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook connector not initialized",
        )
    return _ctx


@router.post("/generic")
async def receive_generic_webhook(
    request: Request,
    payload: dict = Body(...),
    token: str | None = Header(default=None, alias="X-PES-Token"),
):
    """
    Normalize an arbitrary JSON payload into `webhook.received`.

    The body is flattened into `event_data`, so rules can use
    `payload.<key>` directly. `event`, `source` and `dedupe_key` are optional
    sender-controlled metadata.
    """

    global _last_received_at, _received_count, _rejected_count

    expected = os.getenv("GENERIC_WEBHOOK_TOKEN", "")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GENERIC_WEBHOOK_TOKEN is not configured",
        )
    if not token or not secrets.compare_digest(token, expected):
        _rejected_count += 1
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook token",
        )

    max_kb = 64
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_kb * 1024:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Payload exceeds {max_kb} KB",
                )
        except ValueError:
            pass

    event_data = dict(payload)
    event_data.setdefault("event", "generic")
    event_data.setdefault("source", "webhook")
    dedupe_key = event_data.get("dedupe_key")
    if not isinstance(dedupe_key, str):
        dedupe_key = None

    ctx = _ctx_or_503()
    await ctx.dispatcher.dispatch(
        "webhook.received",
        event_data,
        origin=f"webhook:{event_data.get('source', 'generic')}",
        dedupe_key=dedupe_key,
    )
    logger.info(
        "[Webhook] Received generic event",
        source=event_data.get("source"),
        event_name=event_data.get("event"),
    )
    _last_received_at = datetime.now(UTC)
    _received_count += 1
    return {"status": "ok", "event_type": "webhook.received"}


@router.get("/generic/health")
async def generic_webhook_health():
    """Public health snapshot for the generic webhook connector."""
    return {
        "configured": bool(os.getenv("GENERIC_WEBHOOK_TOKEN", "")),
        **health(),
    }
