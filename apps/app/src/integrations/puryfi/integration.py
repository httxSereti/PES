"""
PuryFi — external integration.

PuryFi's browser extension connects to PES over a WebSocket server (see
`protocol.py`); PES turns browser media scans and lock/state changes into
events, and exposes lock, power and whitelist/blacklist actions to rules.
"""

from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from typing import Any

import structlog

from events.enums import ActionType
from integrations.base import (
    ActionDef,
    EventDef,
    Integration,
    IntegrationContext,
    IntegrationKind,
    SettingDef,
    SettingType,
)

from . import labels
from .actions import (
    EmergencyUnlockHandler,
    EnterLockPasswordHandler,
    SetEnabledHandler,
    SetLockHandler,
    SetLockTimerHandler,
    UpdateWblistHandler,
)
from .protocol import DESIRED_INTENTS, PuryFiClient, PuryFiConnection, PuryFiError

logger = structlog.get_logger("pes")

_EVENTS = [
    # Detection
    EventDef(
        id="puryfi_genitals_detected",
        label="Genitals detected",
        description="Genitals detected in a scanned image",
        group="Detection",
    ),
    EventDef(
        id="puryfi_breasts_detected",
        label="Breasts detected",
        description="Breasts detected in a scanned image",
        group="Detection",
    ),
    EventDef(
        id="puryfi_buttocks_detected",
        label="Buttocks detected",
        description="Buttocks detected in a scanned image",
        group="Detection",
    ),
    EventDef(
        id="puryfi_anus_detected",
        label="Anus detected",
        description="Anus detected in a scanned image",
        group="Detection",
    ),
    EventDef(
        id="puryfi_nipples_detected",
        label="Nipples detected",
        description="Nipples detected in a scanned image",
        group="Detection",
    ),
    EventDef(
        id="puryfi_body_detected",
        label="Body detected",
        description="Body parts (tummy, armpit, foot, hand, silhouette) detected",
        group="Detection",
    ),
    EventDef(
        id="puryfi_face_detected",
        label="Face detected",
        description="Faces, eyes or mouths detected in a scanned image",
        group="Detection",
    ),
    # Lock
    EventDef(
        id="puryfi_lock_set",
        label="Lock set",
        description="A PuryFi lock was created",
        group="Lock",
    ),
    EventDef(
        id="puryfi_lock_removed",
        label="Lock removed",
        description="The PuryFi lock was removed",
        group="Lock",
    ),
    EventDef(
        id="puryfi_lock_changed",
        label="Lock changed",
        description="The PuryFi lock was updated (password or timer-plus settings)",
        group="Lock",
    ),
    EventDef(
        id="puryfi_lock_time_added",
        label="Lock time added",
        description="Time was added to the PuryFi lock timer",
        group="Lock",
    ),
    EventDef(
        id="puryfi_lock_time_removed",
        label="Lock time removed",
        description="Time was removed from the PuryFi lock timer",
        group="Lock",
    ),
    # State
    EventDef(
        id="puryfi_enabled",
        label="Blocker enabled",
        description="The PuryFi blocker was enabled",
        group="State",
    ),
    EventDef(
        id="puryfi_disabled",
        label="Blocker disabled",
        description="The PuryFi blocker was disabled",
        group="State",
    ),
    EventDef(
        id="puryfi_wblist_changed",
        label="Whitelist/blacklist changed",
        description="The whitelist/blacklist configuration changed",
        group="State",
    ),
    # Connection
    EventDef(
        id="puryfi_connected",
        label="Connected",
        description="PES connected to the PuryFi extension",
        group="Connection",
    ),
    EventDef(
        id="puryfi_disconnected",
        label="Disconnected",
        description="The PuryFi extension disconnected from PES",
        group="Connection",
    ),
]

_SETTINGS = [
    SettingDef(
        key="port",
        label="Plugin port",
        type=SettingType.INT,
        default=8088,
        description="WebSocket port PuryFi connects to (restart required)",
    ),
    SettingDef(
        key="min_score_pct",
        label="Min detection score (%)",
        type=SettingType.INT,
        default=50,
        description="Ignore detections below this confidence",
    ),
    SettingDef(
        key="min_objects",
        label="Min objects per category",
        type=SettingType.INT,
        default=1,
        description="Objects needed before an event fires",
    ),
    SettingDef(
        key="cooldown_seconds",
        label="Detection cooldown (s)",
        type=SettingType.INT,
        default=10,
        description="Minimum delay between two events of the same category",
    ),
    SettingDef(
        key="include_covered",
        label="Count covered labels",
        type=SettingType.BOOL,
        default=False,
        description="Also react to clothed body parts (e.g. swimwear)",
    ),
    SettingDef(
        key="lock_poll_seconds",
        label="Lock poll interval (s)",
        type=SettingType.INT,
        default=10,
        description="How often the lock configuration is checked",
    ),
    SettingDef(
        key="lock_password",
        label="Lock password",
        type=SettingType.SECRET,
        secret=True,
        default="",
        description="Used by the 'Unlock with password' action",
    ),
    SettingDef(
        key="emergency_token",
        label="Emergency server token",
        type=SettingType.SECRET,
        secret=True,
        default="",
        description="Used by the 'Emergency unlock' action",
    ),
]


class PuryFiIntegration(Integration):
    id = "puryfi"
    name = "PuryFi"
    kind = IntegrationKind.EXTERNAL
    description = "Porn-blocking browser extension: detections, lock control and whitelist/blacklist."

    def __init__(self):
        self._ctx: IntegrationContext | None = None
        self._client = PuryFiClient(self)
        self._last_detection: dict[str, float] = {}
        self._lock_task: asyncio.Task | None = None
        self._handshaked = False
        self._actions = [
            ActionDef(
                id=ActionType.PURYFI_SET_ENABLED.value,
                label="Enable/disable PuryFi",
                description="Turn the PuryFi blocker on or off.",
                group="State",
                payload_schema={"enabled": "boolean"},
                handler=SetEnabledHandler(self),
            ),
            ActionDef(
                id=ActionType.PURYFI_SET_LOCK.value,
                label="Set PuryFi lock",
                description=(
                    "Set or replace the PuryFi lock. Clears an existing lock "
                    "password unless a new one is provided."
                ),
                group="Lock",
                payload_schema={
                    "timer_minutes": "integer (0 = no timer)",
                    "password": "string (optional)",
                },
                handler=SetLockHandler(self),
            ),
            ActionDef(
                id=ActionType.PURYFI_SET_LOCK_TIMER.value,
                label="Update lock timer",
                description=(
                    "Add, remove or set time on the PuryFi lock timer "
                    "(e.g. 30, +10, -5, [5-25])."
                ),
                group="Lock",
                payload_schema={"value": "string (minutes: 30, +10, -5, [5-25])"},
                handler=SetLockTimerHandler(self),
            ),
            ActionDef(
                id=ActionType.PURYFI_ENTER_LOCK_PASSWORD.value,
                label="Unlock with password",
                description="Enter the lock password (from settings) to remove the lock.",
                group="Lock",
                payload_schema={},
                handler=EnterLockPasswordHandler(self),
            ),
            ActionDef(
                id=ActionType.PURYFI_EMERGENCY_UNLOCK.value,
                label="Emergency unlock",
                description="Enter the emergency server token (from settings) to remove the lock.",
                group="Lock",
                payload_schema={},
                handler=EmergencyUnlockHandler(self),
            ),
            ActionDef(
                id=ActionType.PURYFI_UPDATE_WBLIST.value,
                label="Update whitelist/blacklist",
                description="Add/remove entries or switch the PuryFi whitelist/blacklist mode.",
                group="Whitelist/Blacklist",
                payload_schema={
                    "operation": "add | remove | set_mode",
                    "list": "whitelist | blacklist (the mode for set_mode)",
                    "entry_mode": "text | regex (add/remove)",
                    "value": "string (add/remove)",
                },
                handler=UpdateWblistHandler(self),
            ),
        ]

    # ───────── Contribution surfaces ─────────

    def events(self) -> list[EventDef]:
        return list(_EVENTS)

    def actions(self) -> list[ActionDef]:
        return list(self._actions)

    def settings(self) -> list[SettingDef]:
        return list(_SETTINGS)

    # ───────── Runtime helpers ─────────

    @property
    def client(self) -> PuryFiClient:
        return self._client

    @property
    def connection(self) -> PuryFiConnection:
        return self._client.connection

    def endpoint(self) -> str:
        """The WebSocket URL to register in PuryFi's plugin options."""
        return f"ws://localhost:{max(1, self._int_setting('port', 8088))}"

    def settings_values(self) -> dict[str, Any]:
        if self._ctx is None:
            return {}
        return self._ctx.registry.settings_values(self.id)

    def _int_setting(self, key: str, default: int) -> int:
        try:
            return int(self.settings_values().get(key) or default)
        except (TypeError, ValueError):
            return default

    def _bool_setting(self, key: str, default: bool = False) -> bool:
        value = self.settings_values().get(key, default)
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    # ───────── Lifecycle ─────────

    async def start(self, ctx: IntegrationContext) -> None:
        self._ctx = ctx
        self._client = PuryFiClient(self, port=max(1, self._int_setting("port", 8088)))
        await self._client.start()

    async def stop(self) -> None:
        await self._cancel_lock_poll()
        await self._client.stop()
        self._ctx = None

    # ───────── PuryFi connection hooks ─────────

    async def puryfi_connected(self, connection: PuryFiConnection, info: dict) -> None:
        self._handshaked = True
        logger.info(
            "[PuryFi] Connected",
            version=info.get("version"),
            instance_id=info.get("instance_id"),
        )
        await self._dispatch("puryfi_connected", info, "puryfi:connect")

        try:
            await connection.request(
                "setPluginManifest",
                {
                    "manifest": {
                        "name": "PlunEStim",
                        "version": "1.0.0",
                        "description": "PlunEStim integration: events, lock and list control",
                        "author": "PluneCorp",
                        "website": None,
                    }
                },
            )
            response = await connection.request("getPluginIntents")
        except PuryFiError as err:
            logger.warning(f"[PuryFi] Handshake setup failed: {err}")
            return

        granted = [str(intent) for intent in response.get("intents") or []]
        connection.intents = granted
        missing = [intent for intent in DESIRED_INTENTS if intent not in granted]
        if missing:
            logger.info(
                "[PuryFi] Intents must be granted in the extension options",
                missing=missing,
            )
            try:
                await connection.request("requestPluginIntents", {"intents": missing})
            except PuryFiError as err:
                logger.warning(f"[PuryFi] Intent request failed: {err}")

        await self._setup_subscriptions(connection, granted)

    async def puryfi_intents(self, connection: PuryFiConnection, intents: list[str]) -> None:
        logger.info("[PuryFi] Intents granted", intents=intents)
        await self._setup_subscriptions(connection, intents)

    async def puryfi_disconnected(self) -> None:
        await self._cancel_lock_poll()
        if not self._handshaked:
            return
        self._handshaked = False
        logger.info("[PuryFi] Disconnected")
        await self._dispatch("puryfi_disconnected", {}, "puryfi:connect")

    async def puryfi_state_change(self, path: str, value: Any) -> None:
        if path == "enabled":
            event_type = "puryfi_enabled" if value else "puryfi_disabled"
            await self._dispatch(event_type, {"enabled": bool(value)}, "puryfi:state")
        elif path == "wblistConfiguration" or path.startswith("wblistConfiguration."):
            await self._dispatch("puryfi_wblist_changed", {"value": value}, "puryfi:state")

    async def puryfi_media_scan(self, objects: list[dict]) -> None:
        min_score = max(0, min(100, self._int_setting("min_score_pct", 50))) / 100
        min_objects = max(1, self._int_setting("min_objects", 1))
        cooldown = max(0, self._int_setting("cooldown_seconds", 10))
        include_covered = self._bool_setting("include_covered")
        now = time.monotonic()

        hits: dict[str, list[dict]] = {}
        for obj in objects:
            if not isinstance(obj, dict):
                continue
            try:
                label_id = int(obj.get("label", -1))
                score = float(obj.get("score", 0.0))
            except (TypeError, ValueError):
                continue

            category = labels.LABEL_TO_CATEGORY.get(label_id)
            if category is None:
                continue
            category_key, covered = category
            if covered and not include_covered:
                continue
            if score < min_score:
                continue

            hits.setdefault(category_key, []).append(
                {
                    "label": labels.label_name(label_id),
                    "label_id": label_id,
                    "score": round(score, 3),
                    "rect": obj.get("rect"),
                }
            )

        for category_key, found in hits.items():
            if len(found) < min_objects:
                continue
            if cooldown and now - self._last_detection.get(category_key, 0.0) < cooldown:
                continue
            self._last_detection[category_key] = now
            await self._dispatch(
                labels.CATEGORIES[category_key]["event"],
                {"objects": found, "count": len(found)},
                f"puryfi:scan:{category_key}",
            )

    async def _setup_subscriptions(
        self, connection: PuryFiConnection, granted: list[str]
    ) -> None:
        if "readEnabledState" in granted:
            await connection.subscribe("enabled")
        if "readWBlistConfigurationState" in granted:
            await connection.subscribe("wblistConfiguration")
        if "readLockConfigurationState" in granted:
            self._start_lock_poll(connection)
        if "readMediaProcesses" in granted:
            try:
                await connection.request("subscribeToStaticMediaScans")
                logger.info("[PuryFi] Subscribed to media scans")
            except PuryFiError as err:
                logger.warning(f"[PuryFi] Media scan subscription failed: {err}")

    # ───────── Lock polling ─────────

    def _start_lock_poll(self, connection: PuryFiConnection) -> None:
        if self._lock_task is not None and not self._lock_task.done():
            return
        self._lock_task = asyncio.create_task(self._lock_poll(connection))

    async def _cancel_lock_poll(self) -> None:
        task, self._lock_task = self._lock_task, None
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def _lock_poll(self, connection: PuryFiConnection) -> None:
        interval = max(2, self._int_setting("lock_poll_seconds", 10))
        previous: dict | None = None

        while connection.open:
            try:
                response = await connection.request(
                    "getState", {"path": "lockConfiguration"}
                )
                current = self._normalize_lock(response.get("value"))
            except PuryFiError as err:
                if "unavailablePath" in str(err):
                    current = self._normalize_lock(None)
                else:
                    logger.debug(f"[PuryFi] Lock poll failed: {err}")
                    current = None

            if current is not None:
                if previous is not None and current != previous:
                    await self._dispatch_lock_changes(previous, current)
                previous = current

            await asyncio.sleep(interval)

    @staticmethod
    def _normalize_lock(value: Any) -> dict:
        if not isinstance(value, dict):
            return {
                "has_lock": False,
                "password_set": False,
                "timer_end": None,
                "timer_plus": None,
            }
        timer = value.get("timer") if isinstance(value.get("timer"), dict) else None
        end_time = timer.get("endTime") if timer else None
        return {
            "has_lock": True,
            "password_set": value.get("password") is not None,
            "timer_end": int(end_time) if end_time else None,
            "timer_plus": value.get("timerPlus"),
        }

    async def _dispatch_lock_changes(self, previous: dict, current: dict) -> None:
        if current["has_lock"] and not previous["has_lock"]:
            await self._dispatch("puryfi_lock_set", {"lock": current}, "puryfi:lock")
            return
        if previous["has_lock"] and not current["has_lock"]:
            await self._dispatch("puryfi_lock_removed", {"lock": previous}, "puryfi:lock")
            return

        previous_end, current_end = previous["timer_end"], current["timer_end"]
        if previous_end != current_end:
            if current_end is None:
                await self._dispatch(
                    "puryfi_lock_time_removed",
                    {"end_time": None, "previous_end_time": previous_end},
                    "puryfi:lock",
                )
            elif previous_end is None:
                await self._dispatch(
                    "puryfi_lock_time_added",
                    {"end_time": current_end, "previous_end_time": None},
                    "puryfi:lock",
                )
            else:
                delta_ms = current_end - previous_end
                await self._dispatch(
                    "puryfi_lock_time_added" if delta_ms > 0 else "puryfi_lock_time_removed",
                    {
                        "minutes": round(abs(delta_ms) / 60_000, 1),
                        "end_time": current_end,
                        "previous_end_time": previous_end,
                    },
                    "puryfi:lock",
                )

        changed = [
            field
            for field in ("password_set", "timer_plus")
            if previous[field] != current[field]
        ]
        if changed:
            await self._dispatch(
                "puryfi_lock_changed", {"changed": changed, "lock": current}, "puryfi:lock"
            )

    # ───────── Dispatch ─────────

    async def _dispatch(self, event_type: str, event_data: dict, origin: str) -> None:
        if self._ctx is None:
            return
        await self._ctx.dispatcher.dispatch(event_type, event_data, origin=origin)
