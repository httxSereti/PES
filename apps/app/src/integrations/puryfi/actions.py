"""PuryFi action handlers (rule-triggered changes inside the extension)."""

from __future__ import annotations

import random
import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from events.models import QueueItem

from .protocol import PuryFiError

if TYPE_CHECKING:
    from .integration import PuryFiIntegration

logger = structlog.get_logger("pes")

_MAX_TIMER_MINUTES = 7 * 24 * 60  # one week
_WBLIST_LISTS = ("whitelist", "blacklist")
_ENTRY_MODES = ("text", "regex")


def parse_minutes(current: int, expression: str) -> int:
    """
    Parse a minutes expression against the current value.

    Supports `30` (absolute), `+10` / `-5` (relative) and random ranges
    `[5-25]`, `+[5-25]`, `-[5-25]`.
    """
    expression = str(expression).strip()

    if match := re.match(r"^\[(\d+)-(\d+)\]$", expression):
        low, high = sorted((int(match.group(1)), int(match.group(2))))
        return random.randint(low, high)

    if match := re.match(r"^([+\-])\[(\d+)-(\d+)\]$", expression):
        sign, low, high = match.group(1), int(match.group(2)), int(match.group(3))
        delta = random.randint(min(low, high), max(low, high))
        return max(0, current + delta if sign == "+" else current - delta)

    if match := re.match(r"^([+\-]?)(\d+)$", expression):
        sign, value = match.group(1), int(match.group(2))
        if sign == "+":
            return current + value
        if sign == "-":
            return max(0, current - value)
        return value

    raise ValueError(f"invalid minutes expression {expression!r}")


def _now_ms() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


class PuryFiActionHandler:
    """Base handler: resolves errors into warnings and never reverses."""

    name = "PuryFi action"

    def __init__(self, integration: PuryFiIntegration):
        self._integration = integration

    async def apply(self, item: QueueItem) -> dict | None:
        # Mark the expected echo before the request: the extension can report
        # the state change while the request is still in flight.
        self._integration.expect_action_echo(item.action_type, item.causation_depth)
        try:
            await self.run(item.payload)
        except PuryFiError as err:
            logger.warning(f"[PuryFi] {self.name} skipped: {err}")
        except (TypeError, ValueError) as err:
            logger.warning(f"[PuryFi] {self.name} invalid payload: {err}")
        return None

    async def reverse(self, item: QueueItem) -> None:
        return None

    async def run(self, payload: dict) -> None:
        raise NotImplementedError


class SetEnabledHandler(PuryFiActionHandler):
    name = "Enable/disable PuryFi"

    async def run(self, payload: dict) -> None:
        enabled = bool(payload.get("enabled", True))
        await self._integration.connection.request(
            "setState", {"path": "enabled", "value": enabled}
        )
        logger.info(f"[PuryFi] Blocker {'enabled' if enabled else 'disabled'}")


class SetLockHandler(PuryFiActionHandler):
    name = "Set PuryFi lock"

    async def run(self, payload: dict) -> None:
        connection = self._integration.connection
        minutes = max(0, int(payload.get("timer_minutes") or 0))

        # The integration setting is the single source of truth: the same
        # secret is used to create the lock and to unlock it later. Rules
        # persisted before this change may still carry a password payload.
        password = str(self._integration.settings_values().get("lock_password") or "")
        legacy_password = str(payload.get("password") or "")
        if legacy_password and legacy_password != password:
            logger.warning(
                "[PuryFi] Ignoring per-rule lock password; using the "
                "'lock_password' integration setting"
            )

        # The password secret is write-only, so an existing password cannot be
        # preserved: replacing the lock clears it unless a new one is given.
        timer_plus: dict | None = None
        try:
            response = await connection.request("getState", {"path": "lockConfiguration"})
            current = response.get("value")
            if isinstance(current, dict):
                timer_plus = current.get("timerPlus")
        except PuryFiError:
            pass

        value = {
            "password": {"secret": password} if password else None,
            "timer": {"endTime": _now_ms() + minutes * 60_000} if minutes > 0 else None,
            "timerPlus": timer_plus,
        }
        await connection.request("setState", {"path": "lockConfiguration", "value": value})
        logger.info(f"[PuryFi] Lock set (timer={minutes}min, password={'yes' if password else 'no'})")


class SetLockTimerHandler(PuryFiActionHandler):
    name = "Update PuryFi lock timer"

    async def run(self, payload: dict) -> None:
        connection = self._integration.connection
        expression = str(payload.get("value") or "").strip()
        if not expression:
            raise ValueError("missing minutes expression")

        try:
            response = await connection.request("getState", {"path": "lockConfiguration"})
        except PuryFiError as err:
            if "unavailablePath" in str(err):
                logger.warning("[PuryFi] Cannot update the timer: no lock is set")
                return
            raise

        current = response.get("value")
        if not isinstance(current, dict):
            logger.warning("[PuryFi] Cannot update the timer: no lock is set")
            return

        now_ms = _now_ms()
        timer = current.get("timer") if isinstance(current.get("timer"), dict) else None
        current_end = timer.get("endTime") if timer else None
        current_minutes = (
            max(0, round((int(current_end) - now_ms) / 60_000)) if current_end else 0
        )
        minutes = min(parse_minutes(current_minutes, expression), _MAX_TIMER_MINUTES)

        if timer:
            # Leaf write: leaves the password and timerPlus untouched.
            await connection.request(
                "setState",
                {"path": "lockConfiguration.timer.endTime", "value": now_ms + minutes * 60_000},
            )
        else:
            # No timer yet: the whole lock configuration must be replaced.
            # PuryFi never exposes the existing password, so fall back to the
            # configured one to keep the lock unlockable from PES.
            password = str(self._integration.settings_values().get("lock_password") or "")
            await connection.request(
                "setState",
                {
                    "path": "lockConfiguration",
                    "value": {
                        "password": {"secret": password} if password else None,
                        "timer": {"endTime": now_ms + minutes * 60_000},
                        "timerPlus": current.get("timerPlus"),
                    },
                },
            )
            logger.info(
                "[PuryFi] Timer created "
                f"({'password from settings applied' if password else 'no password set'})"
            )

        logger.info(f"[PuryFi] Lock timer set to {minutes} min (from {current_minutes} min)")


class EnterLockPasswordHandler(PuryFiActionHandler):
    name = "Unlock with password"

    async def run(self, payload: dict) -> None:
        password = str(self._integration.settings_values().get("lock_password") or "")
        if not password:
            logger.warning("[PuryFi] Unlock skipped: no lock password configured")
            return
        await self._integration.connection.request("enterLockPassword", {"secret": password})
        logger.info("[PuryFi] Lock password entered")


class EmergencyUnlockHandler(PuryFiActionHandler):
    name = "Emergency unlock"

    async def run(self, payload: dict) -> None:
        token = str(self._integration.settings_values().get("emergency_token") or "")
        if not token:
            logger.warning("[PuryFi] Emergency unlock skipped: no server token configured")
            return
        await self._integration.connection.request(
            "enterLockEmergencyServerToken", {"emergencyServerToken": token}
        )
        logger.info("[PuryFi] Emergency server token entered")


class UpdateWblistHandler(PuryFiActionHandler):
    name = "Update whitelist/blacklist"

    async def run(self, payload: dict) -> None:
        connection = self._integration.connection
        operation = str(payload.get("operation") or "add").lower()
        target = str(payload.get("list") or "blacklist").lower()
        entry_mode = str(payload.get("entry_mode") or "text").lower()
        value = str(payload.get("value") or "").strip()

        if target not in _WBLIST_LISTS:
            raise ValueError(f"unknown list {target!r}")

        response = await connection.request("getState", {"path": "wblistConfiguration"})
        current = response.get("value")
        if not isinstance(current, dict):
            raise ValueError("unreadable whitelist/blacklist state")

        config = {
            "mode": current.get("mode", "blacklist"),
            "whitelist": list(current.get("whitelist") or []),
            "blacklist": list(current.get("blacklist") or []),
        }

        if operation == "set_mode":
            config["mode"] = target
        elif operation in ("add", "remove"):
            if entry_mode not in _ENTRY_MODES:
                raise ValueError(f"unknown entry mode {entry_mode!r}")
            if not value:
                raise ValueError("empty entry value")
            entries = [
                entry
                for entry in config[target]
                if not (entry.get("mode") == entry_mode and entry.get("value") == value)
            ]
            if operation == "add":
                entries.append({"mode": entry_mode, "value": value})
            config[target] = entries
        else:
            raise ValueError(f"unknown operation {operation!r}")

        await connection.request("setState", {"path": "wblistConfiguration", "value": config})
        logger.info(f"[PuryFi] Whitelist/blacklist updated ({operation} {target})")
