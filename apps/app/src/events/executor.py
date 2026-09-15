from __future__ import annotations

import os
import random
import re
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import aiohttp
import structlog

from constants import BT_UNITS
from hardware.ramp import RampMode, ramp_manager
from hardware.units import resolve_usage_limit
from services.profiles import ProfileError, load_profile
from store import Store
from utils import to_utc_iso

from .enums import ActionType
from .models import QueueItem

if TYPE_CHECKING:
    from api.ws.websocket_notifier import WebSocketNotifier

# Chaster API
_CHASTER_URL = os.getenv("CHASTER_URL", "")
_CHASTER_TOKEN = os.getenv("CHASTER_TOKEN", "")
_CHASTER_HEADERS = {
    "accept": "application/json",
    "Authorization": f"Bearer {_CHASTER_TOKEN}",
    "Content-Type": "application/json",
}

# Upper bound for the profile level multiplier. Enforced here (not just in
# the WS contract) so every path is capped: trigger rules, manual applies
# and Chaster WOF codes (which can encode levels above 200%).
_MAX_PROFILE_LEVEL_PCT = 150

# Fields used for profile backup/restore
_PROFILE_FIELDS = [
    "ch_A",
    "ch_B",
    "adj_1",
    "adj_2",
    "adj_3",
    "adj_4",
    "mode",
    "level_h",
    "level_d",
    "power_bias",
    "level_map",
]

logger = structlog.get_logger("pes")


class ActionExecutor:
    """
    Executes and reverses actions on hardware units and external APIs.
    Extracted from main.py apply_action() and reverse_action().
    """

    def __init__(self, store: Store, ws_notifier: WebSocketNotifier | None = None):
        self._store = store
        self._ws_notifier = ws_notifier

    async def apply(self, item: QueueItem) -> dict | None:
        """
        Apply an action and return snapshot data for future reversal.
        Returns None if no snapshot is needed.
        """
        logger.info(
            f"[Executor] Applying action '{item.action_type.value}' from '{item.origin}'",
            origin=item.origin,
        )

        action_type = item.action_type
        payload = item.payload

        if action_type == ActionType.LEVEL:
            return await self._apply_level(payload)
        elif action_type == ActionType.PROFILE:
            return await self._apply_profile(item)
        elif action_type == ActionType.MULT:
            self._apply_mult(payload)
            return None
        elif action_type == ActionType.CHASTER_TIME_UPDATE:
            await self._apply_chaster_time(payload)
            return None
        else:
            logger.info(
                f"[Executor] Unknown action type: {action_type}", origin=item.origin
            )
            return None

    async def reverse(self, item: QueueItem) -> None:
        """
        Reverse a previously applied action using its snapshot data.
        """
        if item.snapshot_data is None:
            return

        logger.info(
            f"[Executor] Reversing action '{item.action_type.value}' from '{item.origin}'",
            origin=item.origin,
        )

        if item.action_type == ActionType.LEVEL:
            self._reverse_level(item.snapshot_data)
        elif item.action_type == ActionType.PROFILE:
            self._reverse_profile(item)

    # ───────── LEVEL ─────────

    async def _apply_level(self, payload: dict) -> dict:
        """Apply level changes and return snapshot of previous values."""
        from typings import UnitDict

        snapshot = {"type": "level", "changes": []}
        units_str = payload.get("units", "")
        channels_str = payload.get("channels", "")
        value_str = payload.get("value", "0")

        for unit_num in self._decode_units(units_str):
            unit_name = f"UNIT{unit_num}"
            unit = UnitDict(unit_name)
            unit_data = self._store.get_unit_dict(unit)
            changes = {}

            for ch in self._decode_channels(channels_str):
                ch_name = f"ch_{ch}"
                old_val = unit_data.get(ch_name, 0)
                new_val = self._calc_new_val(value_str, unit_name, ch_name)

                changes[ch_name] = new_val
                snapshot["changes"].append(
                    {
                        "unit": unit_name,
                        "field": ch_name,
                        "diff": old_val - new_val,
                    }
                )

                logger.info(
                    f"[Executor] Action updated level on {unit_name}.{ch_name}: {old_val} -> {new_val}",
                    unit_name=unit_name,
                )

            if changes:
                changes["updated"] = True
                self._store.update_unit_dict(unit, changes)

        return snapshot

    def _reverse_level(self, snapshot: dict) -> None:
        """Reverse level changes from snapshot."""
        from typings import UnitDict

        for change in snapshot.get("changes", []):
            unit = UnitDict(change["unit"])
            unit_data = self._store.get_unit_dict(unit)
            field = change["field"]
            new_val = max(0, min(100, unit_data.get(field, 0) + change["diff"]))

            self._store.update_unit_dict(unit, {"updated": True, field: new_val})
            logger.info(
                f"[Executor] Reversed {change['unit']}.{field} to {new_val}",
                unit_name=change["unit"],
            )

    # ───────── PROFILE ─────────

    async def _apply_profile(self, item: QueueItem) -> dict:
        """
        Apply a profile and return a per-field snapshot for reversal.

        The snapshot tracks, for every field it touches, the value before
        the profile and the value the profile applied, so restoration can
        skip fields that changed since (user edits, other actions).
        """
        from typings import UnitDict

        payload = item.payload
        profile_name = payload.get("profile", "")
        try:
            level_pct = int(payload.get("level_pct", 100))
        except (TypeError, ValueError):
            level_pct = 100
        level_pct = min(_MAX_PROFILE_LEVEL_PCT, max(0, level_pct))

        # Random profile
        if profile_name == "X":
            profile_name = random.choice("ABCDEFGHIJ")

        try:
            profile_data = load_profile(profile_name)
        except ProfileError as err:
            logger.error(f"[Executor] {err}")
            return {
                "type": "profile",
                "profile": profile_name,
                "queue_item_id": item.id,
                "units": {},
            }

        owner = f"profile:{item.id}"
        snapshot = {
            "type": "profile",
            "profile": profile_name,
            "level_pct": level_pct,
            "queue_item_id": item.id,
            "units": {},
        }

        bck_settings = profile_data.get("threads_settings", {})

        for unit_name, unit_profile in bck_settings.items():
            unit = UnitDict(unit_name)
            current = self._store.get_unit_dict(unit)
            unit_snapshot: dict = {"usages": {}, "fields": {}}

            # Take back only the ramps this profile started; user ramps and
            # other profiles keep ownership of their fields.
            ramp_manager.stop_owned(unit, owner, restore=False)

            # Usages first: re-resolve the channel limits so the levels
            # below clamp against the new usage, not the old one.
            usage_changes: dict = {}
            for ch in ("A", "B"):
                use_field = f"ch_{ch}_use"
                usage = unit_profile.get(use_field)
                if usage is None or usage == current.get(use_field):
                    continue
                unit_snapshot["usages"][ch] = {
                    "before_use": current.get(use_field),
                    "applied_use": usage,
                    "before_limit": current.get(f"ch_{ch}_limit"),
                    "applied_limit": resolve_usage_limit(usage),
                }
                usage_changes[use_field] = usage
                usage_changes[f"ch_{ch}_limit"] = resolve_usage_limit(usage)
            if usage_changes:
                self._store.update_unit_dict(unit, usage_changes)

            changes: dict = {"sync": False, "updated": True}

            for field, value in unit_profile.items():
                if field not in _PROFILE_FIELDS:
                    continue
                if field in ("ch_A", "ch_B"):
                    new_val = round(int(value) * int(level_pct) / 100)
                    new_val = min(100, max(0, new_val))
                else:
                    new_val = value
                unit_snapshot["fields"][field] = {
                    "before": current.get(field),
                    "applied": new_val,
                    "ramped": False,
                }
                changes[field] = new_val

            self._store.update_unit_dict(unit, changes)

            # Record what actually landed in the store: channel values are
            # clamped to the usage limit, so the requested value may differ.
            applied_state = self._store.get_unit_dict(unit)
            for field, info in unit_snapshot["fields"].items():
                info["applied"] = applied_state.get(field)

            # Optional per-unit ramps block, e.g.
            #   "ramps": {"ch_A": {"timer": 1.2, "step": 2, "step_unit": "absolute",
            #                      "mode": "wave", "duration": 60, "max": 46,
            #                      "start": 10}}
            # `max` defaults to the just-applied (level_pct-scaled) level
            # and may be a "[25-35]" range string; ramps start at the
            # field's current value unless `start` is set. Invalid entries
            # are logged and skipped (profiles are hand-edited JSON).
            # Ramps are owned by this profile item (see stop_owned).
            for field, ramp_cfg in unit_profile.get("ramps", {}).items():
                try:
                    ramp_manager.start(
                        unit,
                        field,
                        timer=ramp_cfg["timer"],
                        step=ramp_cfg.get("step", 1),
                        step_unit=ramp_cfg.get("step_unit", "percent"),
                        mode=RampMode(ramp_cfg.get("mode", "reset")),
                        duration=ramp_cfg.get("duration", -1),
                        max_value=ramp_cfg.get("max"),
                        start_value=ramp_cfg.get("start"),
                        owner=owner,
                    )
                except (KeyError, TypeError, ValueError) as err:
                    logger.warning(
                        f"[Executor] Skipped invalid ramp '{unit_name}.{field}': {err}"
                    )
                    continue

                # Ramped fields are restored unconditionally on reverse
                # (the ramp owns them, so the "unchanged since apply" check
                # does not apply).
                field_snapshot = unit_snapshot["fields"].setdefault(
                    field,
                    {
                        "before": current.get(field),
                        "applied": current.get(field),
                    },
                )
                field_snapshot["ramped"] = True

            snapshot["units"][unit_name] = unit_snapshot

        now = datetime.now(UTC)
        active_profile = {
            "name": profile_name,
            "level_pct": int(level_pct),
            "queue_item_id": item.id,
            "started_at": to_utc_iso(now),
            "ends_at": to_utc_iso(now + timedelta(seconds=item.duration))
            if item.duration != -1
            else None,
        }
        self._store.set_active_profile(active_profile)
        self._notify_active_profile(active_profile)

        logger.info(f"[Executor] Profile '{profile_name}' applied at {level_pct}%")
        return snapshot

    def _reverse_profile(self, item: QueueItem) -> None:
        """
        Reverse a profile: restore only the fields it still owns.

        A field is restored when it is driven by one of the profile's ramps
        (stopped here) or when it still holds the value the profile applied.
        Fields modified since (manual edits, other actions) are left alone.
        """
        from typings import UnitDict

        snapshot = item.snapshot_data or {}
        owner = f"profile:{item.id}"
        units_data = snapshot.get("units", {})

        for unit_name, unit_data in units_data.items():
            unit = UnitDict(unit_name)

            # Stop only this profile's ramps; they would overwrite the
            # restored values on their next tick.
            ramp_manager.stop_owned(unit, owner, restore=False)

            # Restore usages/limits first: the level restore below must
            # clamp against the restored limits, not the profile's.
            usage_restore: dict = {}
            for ch, info in unit_data.get("usages", {}).items():
                if info.get("before_use") is None:
                    continue
                current_use = self._store.get_unit_setting(unit, f"ch_{ch}_use")
                if current_use != info.get("applied_use"):
                    continue
                usage_restore[f"ch_{ch}_use"] = info["before_use"]
                if info.get("before_limit") is not None:
                    usage_restore[f"ch_{ch}_limit"] = info["before_limit"]
            if usage_restore:
                self._store.update_unit_dict(unit, usage_restore)

            changes: dict = {"sync": False, "updated": True}
            for field, info in unit_data.get("fields", {}).items():
                before = info.get("before")
                if before is None:
                    continue
                if info.get("ramped") or self._same_value(
                    self._store.get_unit_setting(unit, field), info.get("applied")
                ):
                    changes[field] = before

            if len(changes) > 2:
                self._store.update_unit_dict(unit, changes)

        # Only clear the active profile when it is still this item's
        if self._store.clear_active_profile(queue_item_id=item.id):
            self._notify_active_profile(None)

        logger.info("[Executor] Profile reversed to previous state")

    @staticmethod
    def _same_value(current, applied) -> bool:
        """Exact comparison tolerant of int/float representations."""
        if isinstance(current, bool) or isinstance(applied, bool):
            return bool(current) == bool(applied)
        try:
            return float(current) == float(applied)
        except (TypeError, ValueError):
            return current == applied

    def _notify_active_profile(self, profile: dict | None) -> None:
        if self._ws_notifier is None:
            return
        try:
            self._ws_notifier.notify("profiles:active", profile)
        except RuntimeError as err:
            logger.warning(f"[Executor] Failed to broadcast active profile: {err}")

    # ───────── MULT ─────────

    def _apply_mult(self, payload: dict) -> None:
        """Apply multiplier changes (no snapshot, not reversible)."""
        from typings import UnitDict

        target = payload.get("target", "all").lower()
        pct = payload.get("pct", 0)
        is_random = payload.get("random", False)

        for unit_str in BT_UNITS:
            unit = UnitDict(unit_str)
            snapshot = self._store.get_unit_dict(unit)
            changes = {}

            for ch in ("A", "B"):
                if snapshot.get(f"ch_{ch}_use") == target or target == "all":
                    ch_name = f"ch_{ch}_multiplier"
                    add_val = (
                        random.randint(min(0, pct), max(0, pct)) if is_random else pct
                    )
                    changes[ch_name] = snapshot.get(ch_name, 100) + add_val

            if changes:
                changes["updated"] = True
                self._store.update_unit_dict(unit, changes)

        logger.info(f"[Executor] Multiplier applied: target={target}, pct={pct}")

    # ───────── CHASTER_TIME_ADD ─────────

    async def _apply_chaster_time(self, payload: dict) -> None:
        """Add time to Chaster lock."""
        duration_minutes = payload.get("duration_minutes", 0)
        only_max = payload.get("only_max", False)
        duration_secs = duration_minutes * 60

        if not _CHASTER_URL or not _CHASTER_TOKEN:
            logger.info("[Executor] Chaster not configured, skipping time add")
            return

        # Need lock ID — fetch from API
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{_CHASTER_URL}/locks?status=active", headers=_CHASTER_HEADERS
            ) as resp:
                locks = await resp.json()
                if not locks:
                    logger.info("[Executor] No active Chaster lock found")
                    return
                lock_id = locks[0]["_id"]

            # Update max limit date
            async with session.get(
                f"{_CHASTER_URL}/locks/{lock_id}", headers=_CHASTER_HEADERS
            ) as resp:
                lock_data = await resp.json()

            from datetime import datetime, timedelta

            max_date_str = lock_data.get("maxLimitDate") or lock_data.get("maxDate", "")
            if max_date_str:
                max_date = datetime.strptime(max_date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
                new_max = max_date + timedelta(seconds=duration_secs)
                async with session.post(
                    f"{_CHASTER_URL}/locks/{lock_id}/max-limit-date",
                    json={
                        "maxLimitDate": new_max.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                        "disableMaxLimitDate": False,
                    },
                    headers=_CHASTER_HEADERS,
                ) as resp:
                    logger.debug(f"[Executor] Max limit date updated: {resp.status}")

            # Also add to current time if not only_max
            if not only_max:
                async with session.post(
                    f"{_CHASTER_URL}/locks/{lock_id}/update-time",
                    json={"duration": duration_secs},
                    headers=_CHASTER_HEADERS,
                ) as resp:
                    logger.debug(f"[Executor] Current time updated: {resp.status}")

        logger.info(
            f"[Executor] Chaster time added: {duration_minutes}min (only_max={only_max})"
        )

    # ───────── Helpers ─────────

    @staticmethod
    def _decode_units(unit_arg: str) -> list[str]:
        """Decode unit argument including random options."""
        unit_arg = unit_arg.upper()
        if m := re.match(r"^([1-3]+)RO$", unit_arg):
            return [m.group(1)[random.randint(0, len(m.group(1)) - 1)]]
        if m := re.match(r"^([1-3]+)RM$", unit_arg):
            result = [u for u in m.group(1) if random.randint(0, 1) == 1]
            if not result:
                result = [m.group(1)[random.randint(0, len(m.group(1)) - 1)]]
            return result
        if re.match(r"^[1-3]+$", unit_arg):
            return list(unit_arg)
        return []

    @staticmethod
    def _decode_channels(ch_arg: str) -> list[str]:
        """Decode channel argument including random options."""
        ch_arg = ch_arg.upper()
        if m := re.match(r"^([A,B]+)RO$", ch_arg):
            return [m.group(1)[random.randint(0, len(m.group(1)) - 1)]]
        if m := re.match(r"^([A,B]+)RM$", ch_arg):
            result = [c for c in m.group(1) if random.randint(0, 1) == 1]
            if not result:
                result = [m.group(1)[random.randint(0, len(m.group(1)) - 1)]]
            return result
        if re.match(r"^[A,B]+$", ch_arg):
            return list(ch_arg)
        return []

    def _calc_new_val(self, newval: str, unit: str, field: str) -> int:
        """Decode level value (absolute, relative, percentage, or range)."""
        from typings import UnitDict
        from utils.calculate_magic_number import calculate_magic_number

        current = self._store.get_unit_setting(UnitDict(unit), field, default=0)
        return calculate_magic_number(current, newval)
