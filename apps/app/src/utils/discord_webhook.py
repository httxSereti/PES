"""Send notifications to Discord webhooks."""

import os
from datetime import UTC, datetime

import aiohttp
import structlog

logger = structlog.get_logger("pes")

STARTUP_WEBHOOK_ENV = "DISCORD_STARTUP_WEBHOOKS"

# Discord green, used for the success embed
EMBED_COLOR = 0x57F287


async def send_discord_startup_message(profile_count: int = 0) -> None:
    """Notify the configured Discord webhook that PES started successfully."""
    webhook_url = os.getenv(STARTUP_WEBHOOK_ENV, "").strip()
    if not webhook_url:
        logger.info("[Discord] No startup webhook configured, skipping notification")
        return

    now = datetime.now(UTC)
    embed = {
        "title": "⚡ PlunEStim is online",
        "description": "PES started successfully and is ready to run your sessions. 😈",
        "color": EMBED_COLOR,
        "fields": [
            {"name": "📁 Profiles loaded", "value": str(profile_count), "inline": True},
            {"name": "🕒 Started at", "value": f"<t:{int(now.timestamp())}:F>", "inline": True},
            {"name": "🚀 Status", "value": "All systems operational ✅", "inline": False},
        ],
        "footer": {"text": "PlunEStim • pes-bot"},
        "timestamp": now.isoformat(),
    }
    payload = {"username": "PES", "embeds": [embed]}

    try:
        timeout = aiohttp.ClientTimeout(total=5)
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.post(webhook_url, json=payload) as resp,
        ):
            if resp.status >= 400:
                logger.warning(f"[Discord] Startup webhook returned status {resp.status}")
            else:
                logger.info("[Discord] Startup webhook sent")
    except Exception as exc:  # noqa: BLE001 - never block startup on notify failure
        logger.warning(f"[Discord] Failed to send startup webhook: {exc}")
