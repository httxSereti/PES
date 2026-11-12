"""Trigger-rule action handlers for the Lovense integration."""

from __future__ import annotations

import random
from typing import Any

import structlog

from events.enums import ActionType
from events.models import QueueItem

from .hub import LovenseHub

logger = structlog.get_logger("pes")


def _targets(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("all"):
        return {"all": True}
    devices = payload.get("devices", payload.get("device_ids"))
    tags = payload.get("tags") or []
    node_ids = payload.get("node_ids") or []
    if isinstance(devices, str):
        if devices.strip().lower() == "all":
            return {"all": True}
        devices = [item.strip() for item in devices.split(",") if item.strip()]
    if not devices and not tags and not node_ids:
        return {"all": True}
    return {
        "device_ids": [str(device) for device in devices or [] if device],
        "tags": [str(tag) for tag in tags if tag],
        "node_ids": [str(node) for node in node_ids if node],
    }


class LovenseActionHandler:
    """Run LOVENSE_* actions through the hub (queue worker context)."""

    def __init__(self, hub: LovenseHub):
        self._hub = hub

    async def apply(self, item: QueueItem) -> dict | None:
        payload = item.payload if isinstance(item.payload, dict) else {}
        action = item.action_type
        try:
            if action == ActionType.LOVENSE_SET:
                return await self._set(item, payload)
            if action == ActionType.LOVENSE_PULSE:
                return await self._pulse(item, payload)
            if action == ActionType.LOVENSE_STOP:
                await self._hub.stop_outputs(_targets(payload), payload.get("output"))
                return None
            if action == ActionType.LOVENSE_PATTERN_PLAY:
                return await self._play(item, payload)
            if action == ActionType.LOVENSE_PATTERN_STOP:
                await self._hub.stop_patterns(
                    run_id=payload.get("run_id"),
                    pattern_id=payload.get("pattern_id"),
                    all_runs=bool(payload.get("all", not payload.get("run_id") and not payload.get("pattern_id"))),
                    reason="action",
                )
                return None
            if action == ActionType.LOVENSE_RANDOM_PATTERN:
                return await self._random(item, payload)
            if action == ActionType.LOVENSE_SCAN:
                node_id = str(payload.get("node_id") or "")
                seconds = min(55, max(1, int(payload.get("seconds") or 10)))
                await self._hub.scan(node_id, seconds)
                return None
            if action == ActionType.LOVENSE_SET_CAP:
                await self._hub.set_cap(
                    _targets(payload), int(payload.get("max_pct", 70))
                )
                return None
            if action == ActionType.LOVENSE_ASSIGN:
                new_tags = payload.get("new_tags")
                if isinstance(new_tags, str):
                    new_tags = [
                        tag.strip() for tag in new_tags.split(",") if tag.strip()
                    ]
                for device in self._hub.resolve_devices(_targets(payload)):
                    await self._hub.update_device(
                        str(device["id"]),
                        alias=payload.get("alias"),
                        tags=new_tags,
                    )
                return None
            if action == ActionType.LOVENSE_RECONNECT:
                await self._hub.reconnect_node(payload.get("node_id") or None)
                return None
        except ValueError as err:
            logger.warning(
                f"[Lovense] Action '{action.value}' skipped: {err}",
                origin=item.origin,
            )
        except Exception:
            logger.exception(
                f"[Lovense] Action '{action.value}' failed", origin=item.origin
            )
        return None

    async def reverse(self, item: QueueItem) -> None:
        snapshot = item.snapshot_data or {}
        run_id = snapshot.get("run_id")
        if run_id:
            await self._hub.stop_patterns(run_id=str(run_id), reason="reversed")
            return
        if snapshot.get("type") == "lovense_set":
            await self._hub.stop_outputs(
                snapshot.get("targets") or {"all": True},
                snapshot.get("output"),
            )

    # ───────── Actions ─────────

    async def _set(self, item: QueueItem, payload: dict) -> dict | None:
        output = str(payload.get("output") or "Vibrate")
        feature = payload.get("feature", "all")
        value = payload.get("value", 0)
        mode = str(payload.get("mode") or "expression")
        ramp_ms = int(payload.get("ramp_ms", 0) or 0)
        count = await self._hub.set_output(
            _targets(payload),
            output,
            feature,
            value,
            mode=mode,
            ramp_ms=ramp_ms,
            owner=f"action:{item.id}",
            priority=20,
        )
        logger.debug(
            "[Lovense] Set action",
            origin=item.origin,
            output=output,
            value=value,
            targets=count,
        )
        return {
            "type": "lovense_set",
            "targets": _targets(payload),
            "output": payload.get("output"),
        }

    async def _pulse(self, item: QueueItem, payload: dict) -> dict | None:
        await self._hub.pulse(
            _targets(payload),
            str(payload.get("output") or "Vibrate"),
            float(payload.get("value", 50)),
            attack_ms=int(payload.get("attack_ms", 200) or 0),
            hold_ms=int(payload.get("hold_ms", 800) or 0),
            release_ms=int(payload.get("release_ms", 300) or 0),
            owner=f"action:{item.id}",
        )
        return None

    async def _play(self, item: QueueItem, payload: dict) -> dict | None:
        options = {
            "duration": item.duration if item.duration != -1 else payload.get("duration", -1),
            "loop": bool(payload.get("loop", False)),
            "loop_count": int(payload.get("loop_count", 0) or 0),
            "scale_pct": int(payload.get("scale_pct", 100) or 100),
            "replace": bool(payload.get("replace", True)),
            "fade_in_ms": payload.get("fade_in_ms"),
            "fade_out_ms": payload.get("fade_out_ms"),
            "sync_offset_ms": int(payload.get("sync_offset_ms", 0) or 0),
        }
        run = await self._hub.play_pattern(
            pattern_id=payload.get("pattern_id"),
            pattern_name=payload.get("pattern_name"),
            targets=_targets(payload),
            options=options,
            origin=f"action:{item.origin}",
            created_by=item.origin or "system",
            queue_item_id=item.id,
        )
        return {"type": "lovense_pattern", "run_id": run["id"]}

    async def _random(self, item: QueueItem, payload: dict) -> dict | None:
        raw_tags = payload.get("pattern_tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [tag.strip() for tag in raw_tags.split(",") if tag.strip()]
        tags = {str(tag) for tag in raw_tags if tag}
        candidates = []
        for row in self._hub.pattern_rows():
            if tags and not tags.intersection(row.tags or []):
                continue
            candidates.append(row)
        if not candidates:
            raise ValueError("No pattern matches the requested tags")
        row = random.choice(candidates)
        target_payload = {
            key: value
            for key, value in payload.items()
            if key != "pattern_tags"
        }
        run = await self._hub.play_pattern(
            pattern_id=row.id,
            targets=_targets(target_payload),
            options={
                "duration": item.duration if item.duration != -1 else payload.get("duration", -1),
                "scale_pct": int(payload.get("scale_pct", 100) or 100),
                "replace": bool(payload.get("replace", True)),
            },
            origin=f"action:{item.origin}",
            created_by=item.origin or "system",
            queue_item_id=item.id,
        )
        logger.debug(
            "[Lovense] Random pattern", pattern=row.name, origin=item.origin
        )
        return {"type": "lovense_pattern", "run_id": run["id"]}
