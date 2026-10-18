"""
Chaster action handlers: lock time updates on the active lock.

Executed by the action queue through the ActionDef handler; env vars are
read at call time so config.env values are always current.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

import aiohttp
import structlog

from events.models import QueueItem

logger = structlog.get_logger("pes")


class ChasterTimeActionHandler:
    """Apply a CHASTER_TIME_UPDATE action (not reversible)."""

    async def apply(self, item: QueueItem) -> dict | None:
        payload = item.payload
        duration_minutes = payload.get("duration_minutes", 0)
        only_max = payload.get("only_max", False)
        duration_secs = duration_minutes * 60

        url = os.getenv("CHASTER_URL", "")
        token = os.getenv("CHASTER_TOKEN", "")
        if not url or not token:
            logger.info("[Chaster] Not configured, skipping time add")
            return None

        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # Need lock ID — fetch from API
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{url}/locks?status=active", headers=headers
            ) as resp:
                locks = await resp.json()
                if not locks:
                    logger.info("[Chaster] No active lock found")
                    return None
                lock_id = locks[0]["_id"]

            # Update max limit date
            async with session.get(
                f"{url}/locks/{lock_id}", headers=headers
            ) as resp:
                lock_data = await resp.json()

            max_date_str = lock_data.get("maxLimitDate") or lock_data.get("maxDate", "")
            if max_date_str:
                max_date = datetime.strptime(max_date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
                new_max = max_date + timedelta(seconds=duration_secs)
                async with session.post(
                    f"{url}/locks/{lock_id}/max-limit-date",
                    json={
                        "maxLimitDate": new_max.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                        "disableMaxLimitDate": False,
                    },
                    headers=headers,
                ) as resp:
                    logger.debug(f"[Chaster] Max limit date updated: {resp.status}")

            # Also add to current time if not only_max
            if not only_max:
                async with session.post(
                    f"{url}/locks/{lock_id}/update-time",
                    json={"duration": duration_secs},
                    headers=headers,
                ) as resp:
                    logger.debug(f"[Chaster] Current time updated: {resp.status}")

        logger.info(
            f"[Chaster] Time added: {duration_minutes}min (only_max={only_max})"
        )
        return None

    async def reverse(self, item: QueueItem) -> None:
        """Chaster time updates are not reversible."""
        return
