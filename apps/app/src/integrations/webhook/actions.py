"""Outbound action for the generic webhook connector.

Sends a JSON request to a user-supplied URL. Network access is guarded:

- only http/https;
- no credentials embedded in the URL;
- private/loopback/link-local addresses are rejected unless
  `WEBHOOK_ALLOW_PRIVATE=true`.
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
from urllib.parse import urlsplit

import aiohttp
import structlog

from events.models import QueueItem

logger = structlog.get_logger("pes")

_ALLOWED_METHODS = {"POST", "PUT", "PATCH"}


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class WebhookSendHandler:
    """Send a JSON payload to an external webhook."""

    async def apply(self, item: QueueItem) -> dict | None:
        payload = item.payload or {}
        url = str(payload.get("url") or "").strip()
        method = str(payload.get("method") or "POST").upper()
        body = payload.get("body")
        headers = payload.get("headers") or {}

        if not url:
            logger.warning("[Webhook] Outbound action skipped: missing url")
            return None
        if method not in _ALLOWED_METHODS:
            logger.warning(
                "[Webhook] Outbound action skipped: unsupported method",
                method=method,
            )
            return None
        if not isinstance(headers, dict):
            headers = {}
        safe_headers = {
            str(key): str(value)
            for key, value in headers.items()
            if str(key).lower() not in {"host", "content-length"}
        }
        if not isinstance(body, (dict, list)):
            body = {"value": body}

        try:
            await self._validate_url(url)
        except ValueError as exc:
            logger.warning(f"[Webhook] Outbound action blocked: {exc}", url=url)
            return None

        try:
            timeout_seconds = int(payload.get("timeout_seconds", 10) or 10)
        except (TypeError, ValueError):
            timeout_seconds = 10
        timeout = aiohttp.ClientTimeout(total=min(max(timeout_seconds, 1), 15))

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.request(
                    method,
                    url,
                    json=body,
                    headers=safe_headers,
                    allow_redirects=False,
                ) as response:
                    if response.status >= 400:
                        logger.warning(
                            "[Webhook] Outbound request failed",
                            status=response.status,
                            url=url,
                        )
                    else:
                        logger.info(
                            "[Webhook] Outbound request sent",
                            status=response.status,
                            url=url,
                        )
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            logger.warning(
                f"[Webhook] Outbound request error: {exc}",
                url=url,
            )
        return None

    async def reverse(self, item: QueueItem) -> None:
        return None

    async def _validate_url(self, url: str) -> None:
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"}:
            raise ValueError("only http/https URLs are allowed")
        if parts.username or parts.password:
            raise ValueError("credentials in URLs are not allowed")
        if not parts.hostname:
            raise ValueError("missing hostname")
        try:
            port = parts.port or (443 if parts.scheme == "https" else 80)
        except ValueError as exc:
            raise ValueError("invalid port") from exc

        if _env_bool("WEBHOOK_ALLOW_PRIVATE", False):
            return

        loop = asyncio.get_running_loop()
        try:
            infos = await loop.getaddrinfo(
                parts.hostname, port, type=socket.SOCK_STREAM
            )
        except socket.gaierror as exc:
            raise ValueError(f"hostname cannot be resolved: {exc}") from exc

        for info in infos:
            address = info[4][0]
            try:
                ip = ipaddress.ip_address(address)
            except ValueError:
                continue
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
                or ip.is_unspecified
            ):
                raise ValueError(
                    "private/loopback addresses are blocked "
                    "(set WEBHOOK_ALLOW_PRIVATE=true to allow them)"
                )
