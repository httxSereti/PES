from __future__ import annotations

import json
import os
import pathlib
import random
import re
from typing import TYPE_CHECKING

import aiohttp

from .enums import ActionType
from .models import QueueItem
from store import Store
from utils import Logger
from constants import BT_UNITS, MODE_2B

if TYPE_CHECKING:
    from api.ws.websocket_notifier import WebSocketNotifier

# Directories from env
_DIR_PROFILE = pathlib.Path(os.getenv("DIR_PROFILE", "profiles"))
_DIR_TMP = pathlib.Path(os.getenv("DIR_TMP", "tmp"))

# Chaster API
_CHASTER_URL = os.getenv("CHASTER_URL", "")
_CHASTER_TOKEN = os.getenv("CHASTER_TOKEN", "")
_CHASTER_HEADERS = {
    "accept": "application/json",
    "Authorization": f"Bearer {_CHASTER_TOKEN}",
    "Content-Type": "application/json",
}

# Fields used for profile backup/restore
_PROFILE_FIELDS = [
    "ch_A", "ch_B", "adj_1", "adj_2",
    "adj_3", "adj_4", "mode", "level_h", "level_d",
    "power_bias", "level_map",
    "ch_A_ramp_phase", "ch_A_ramp_prct",
    "ch_B_ramp_phase", "ch_B_ramp_prct",
    "adj_1_ramp_phase", "adj_1_ramp_prct",
    "adj_2_ramp_phase", "adj_2_ramp_prct",
    "ramp_time", "ramp_wave",
]




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
        Logger.info(f"[Executor] Applying action '{item.action_type.value}' from '{item.origin}'")

        action_type = item.action_type
        payload = item.payload

        if action_type == ActionType.LEVEL:
            return await self._apply_level(payload)
        elif action_type == ActionType.PROFILE:
            return await self._apply_profile(payload)
        elif action_type == ActionType.MULT:
            self._apply_mult(payload)
            return None
        elif action_type == ActionType.CHASTER_TIME_ADD:
            await self._apply_chaster_time(payload)
            return None

        Logger.info(f"[Executor] Unknown action type: {action_type}")
        return None

    async def reverse(self, item: QueueItem) -> None:
        """
        Reverse a previously applied action using its snapshot data.
        """
        if item.snapshot_data is None:
            return

        Logger.info(f"[Executor] Reversing action '{item.action_type.value}' from '{item.origin}'")

        if item.action_type == ActionType.LEVEL:
            self._reverse_level(item.snapshot_data)
        elif item.action_type == ActionType.PROFILE:
            self._reverse_profile(item.snapshot_data)

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
                snapshot["changes"].append({
                    "unit": unit_name,
                    "field": ch_name,
                    "diff": old_val - new_val,
                })

                Logger.info(f"[Executor] Level {unit_name}.{ch_name}: {old_val} -> {new_val}")

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
            Logger.info(f"[Executor] Reversed {change['unit']}.{field} to {new_val}")

    # ───────── PROFILE ─────────

    async def _apply_profile(self, payload: dict) -> dict:
        """Apply a profile and return snapshot of all unit settings."""
        from typings import UnitDict

        profile_name = payload.get("profile", "")
        level_pct = payload.get("level_pct", 100)

        # Random profile
        if profile_name == "X":
            profile_name = random.choice("ABCDEFGHIJ")

        filename = profile_name + ".json"
        profile_path = _DIR_PROFILE / filename

        if not profile_path.is_file():
            Logger.info(f"[Executor] Profile file {profile_path} not found")
            return {"type": "profile", "units": {}}

        # Snapshot current state
        snapshot = {"type": "profile", "units": self._store.get_all_units_settings()}

        # Load and apply profile
        with open(profile_path, "r") as f:
            profile_data = json.load(f)

        bck_settings = profile_data.get("threads_settings", {})

        for unit_name, unit_profile in bck_settings.items():
            unit = UnitDict(unit_name)
            changes = {"sync": False, "updated": True, "ramp_progress": 0}

            for field, value in unit_profile.items():
                if field not in _PROFILE_FIELDS:
                    continue
                if field in ("ch_A", "ch_B"):
                    new_val = round(int(value) * int(level_pct) / 100)
                    changes[field] = min(100, max(0, new_val))
                else:
                    changes[field] = value

            self._store.update_unit_dict(unit, changes)

        Logger.info(f"[Executor] Profile '{profile_name}' applied at {level_pct}%")
        return snapshot

    def _reverse_profile(self, snapshot: dict) -> None:
        """Reverse profile by restoring all unit settings from snapshot."""
        from typings import UnitDict

        units_data = snapshot.get("units", {})
        for unit_name, unit_data in units_data.items():
            unit = UnitDict(unit_name)
            changes = {
                field: value
                for field, value in unit_data.items()
                if field in _PROFILE_FIELDS
            }
            if changes:
                changes.update({"sync": False, "updated": True})
                self._store.update_unit_dict(unit, changes)

        Logger.info("[Executor] Profile reversed to previous state")

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
                    add_val = random.randint(min(0, pct), max(0, pct)) if is_random else pct
                    changes[ch_name] = snapshot.get(ch_name, 100) + add_val

            if changes:
                changes["updated"] = True
                self._store.update_unit_dict(unit, changes)

        Logger.info(f"[Executor] Multiplier applied: target={target}, pct={pct}")

    # ───────── CHASTER_TIME_ADD ─────────

    async def _apply_chaster_time(self, payload: dict) -> None:
        """Add time to Chaster lock."""
        duration_minutes = payload.get("duration_minutes", 0)
        only_max = payload.get("only_max", False)
        duration_secs = duration_minutes * 60

        if not _CHASTER_URL or not _CHASTER_TOKEN:
            Logger.info("[Executor] Chaster not configured, skipping time add")
            return

        # Need lock ID — fetch from API
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{_CHASTER_URL}/locks?status=active", headers=_CHASTER_HEADERS
            ) as resp:
                locks = await resp.json()
                if not locks:
                    Logger.info("[Executor] No active Chaster lock found")
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
                    Logger.debug(f"[Executor] Max limit date updated: {resp.status}")

            # Also add to current time if not only_max
            if not only_max:
                async with session.post(
                    f"{_CHASTER_URL}/locks/{lock_id}/update-time",
                    json={"duration": duration_secs},
                    headers=_CHASTER_HEADERS,
                ) as resp:
                    Logger.debug(f"[Executor] Current time updated: {resp.status}")

        Logger.info(f"[Executor] Chaster time added: {duration_minutes}min (only_max={only_max})")

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
