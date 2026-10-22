"""
The IntegrationRegistry: one place that knows every integration, its
events/actions/settings, and its runtime lifecycle.

Consumers:
    - ActionExecutor  → get_action(id).handler   (integration actions)
    - REST/WS         → catalog() / events() / actions()
    - trigger rules   → get_event(id) validation
    - app lifespan    → start() / stop()
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

import structlog

from .base import (
    ActionDef,
    EventDef,
    Integration,
    IntegrationContext,
    IntegrationKind,
    SettingDef,
    SettingType,
)
from .settings_store import IntegrationSettingsStore

if TYPE_CHECKING:
    from fastapi import APIRouter

logger = structlog.get_logger("pes")


class IntegrationRegistry:
    _instance: IntegrationRegistry | None = None

    @classmethod
    def get_instance(cls) -> IntegrationRegistry:
        if cls._instance is None:
            raise RuntimeError("IntegrationRegistry not initialized")
        return cls._instance

    def __init__(self, settings_store: IntegrationSettingsStore | None = None):
        IntegrationRegistry._instance = self
        self._integrations: dict[str, Integration] = {}
        self._settings = settings_store or IntegrationSettingsStore()
        self._ctx: IntegrationContext | None = None
        # item id -> owning integration id (filled at registration)
        self._event_owner: dict[str, str] = {}
        self._action_owner: dict[str, str] = {}

    # ───────── Registration / lookup ─────────

    def register(self, integration: Integration) -> None:
        if not integration.id:
            raise ValueError("Integration must declare an id")
        if integration.id in self._integrations:
            raise ValueError(f"Duplicate integration id: {integration.id}")
        self._integrations[integration.id] = integration
        for event in integration.events():
            self._event_owner[event.id] = integration.id
        for action in integration.actions():
            self._action_owner[action.id] = integration.id
        logger.info(
            f"[Integrations] Registered '{integration.id}'",
            kind=integration.kind.value,
        )

    def get(self, integration_id: str) -> Integration | None:
        return self._integrations.get(integration_id)

    def all(self) -> list[Integration]:
        return list(self._integrations.values())

    def events(self) -> list[EventDef]:
        return [
            event for integration in self._integrations.values() for event in integration.events()
        ]

    def get_event(self, event_id: str) -> EventDef | None:
        for event in self.events():
            if event.id == event_id:
                return event
        return None

    def actions(self) -> list[ActionDef]:
        return [
            action for integration in self._integrations.values() for action in integration.actions()
        ]

    def get_action(self, action_id: str) -> ActionDef | None:
        for action in self.actions():
            if action.id == action_id:
                return action
        return None

    def is_known_event(self, event_type: str) -> bool:
        """
        True when the event is declared by a registered integration.

        `custom:*` pseudo events (dynamic WOF codes) never have a rule and
        are always allowed.
        """
        return event_type.startswith("custom:") or self.get_event(event_type) is not None

    def routers(self) -> list[APIRouter]:
        return [
            router
            for integration in self._integrations.values()
            if (router := integration.router()) is not None
        ]

    # ───────── Enable / settings ─────────

    def is_enabled(self, integration_id: str) -> bool:
        integration = self._integrations.get(integration_id)
        if integration is None:
            return False
        if integration.kind is IntegrationKind.CORE:
            return True
        return self._settings.is_enabled(integration_id)

    def set_enabled(self, integration_id: str, enabled: bool) -> None:
        integration = self._require(integration_id)
        if integration.kind is IntegrationKind.CORE:
            if enabled:
                return
            raise ValueError(f"'{integration_id}' is a core integration and cannot be disabled")
        self._settings.set_enabled(integration_id, enabled)

    def _is_item_toggled(self, integration_id: str, section: str, item_id: str) -> bool:
        values = self._settings.get(integration_id).get(section)
        if not isinstance(values, dict):
            return True
        return bool(values.get(item_id, True))

    def is_event_enabled(self, event_id: str) -> bool:
        """
        True when the event may trigger rules.

        Unknown ids (`custom:*` pseudo events) keep firing: they cannot be
        toggled and never have a rule of their own.
        """
        owner_id = self._event_owner.get(event_id)
        if owner_id is None:
            return True
        return self._is_item_toggled(owner_id, "events", event_id)

    def is_action_enabled(self, action_id: str) -> bool:
        """True when trigger rules may run this action type."""
        owner_id = self._action_owner.get(action_id)
        if owner_id is None:
            return True
        return self._is_item_toggled(owner_id, "actions", action_id)

    def set_event_enabled(self, integration_id: str, event_id: str, enabled: bool) -> None:
        integration = self._require(integration_id)
        if not any(event.id == event_id for event in integration.events()):
            raise ValueError(f"Unknown event '{event_id}' for '{integration_id}'")
        self._set_item_toggled(integration_id, "events", event_id, enabled)

    def set_action_enabled(self, integration_id: str, action_id: str, enabled: bool) -> None:
        integration = self._require(integration_id)
        if not any(action.id == action_id for action in integration.actions()):
            raise ValueError(f"Unknown action '{action_id}' for '{integration_id}'")
        self._set_item_toggled(integration_id, "actions", action_id, enabled)

    def _set_item_toggled(
        self, integration_id: str, section: str, item_id: str, enabled: bool
    ) -> None:
        values = self._settings.get(integration_id).get(section)
        if not isinstance(values, dict):
            values = {}
        self._settings.update(integration_id, {section: {**values, item_id: bool(enabled)}})

    def settings_values(self, integration_id: str) -> dict[str, Any]:
        """Current value of every declared setting (secrets masked)."""
        integration = self._require(integration_id)
        stored = self._settings.get(integration_id)
        values: dict[str, Any] = {}

        for definition in integration.settings():
            if definition.source == "env":
                raw = os.getenv(definition.env_var or definition.key)
                if raw is None:
                    values[definition.key] = None
                elif definition.secret or definition.type is SettingType.SECRET:
                    values[definition.key] = "••••••••" if raw else ""
                else:
                    values[definition.key] = raw
            else:
                values[definition.key] = stored.get(definition.key, definition.default)

        return values

    def set_settings(self, integration_id: str, values: dict[str, Any]) -> None:
        integration = self._require(integration_id)
        definitions = {definition.key: definition for definition in integration.settings()}
        updates: dict[str, Any] = {}

        for key, value in values.items():
            definition = definitions.get(key)
            if definition is None:
                raise ValueError(f"Unknown setting '{key}' for '{integration_id}'")
            if definition.source == "env":
                raise ValueError(f"Setting '{key}' is environment-backed and read-only")
            updates[key] = self._coerce_setting(definition, value)

        if updates:
            self._settings.update(integration_id, updates)

    @staticmethod
    def _coerce_setting(definition: SettingDef, value: Any) -> Any:
        """Coerce a value coming from the UI to the declared setting type."""
        if definition.type is SettingType.BOOL:
            if isinstance(value, bool):
                return value
            return str(value).strip().lower() in {"1", "true", "yes", "on"}
        if definition.type is SettingType.INT:
            try:
                return int(value)
            except (TypeError, ValueError):
                return definition.default
        if value is None:
            return definition.default if definition.default is not None else ""
        return str(value)

    def update(
        self,
        integration_id: str,
        *,
        enabled: bool | None = None,
        settings: dict[str, Any] | None = None,
        events: dict[str, bool] | None = None,
        actions: dict[str, bool] | None = None,
    ) -> dict[str, Any]:
        """Apply an update coming from the UI and return the fresh entry."""
        integration = self._require(integration_id)

        if enabled is not None:
            self.set_enabled(integration_id, enabled)
        if settings:
            self.set_settings(integration_id, settings)
        for event_id, value in (events or {}).items():
            self.set_event_enabled(integration_id, event_id, bool(value))
        for action_id, value in (actions or {}).items():
            self.set_action_enabled(integration_id, action_id, bool(value))

        return self.catalog_entry(integration)

    # ───────── Lifecycle ─────────

    async def start(self, ctx: IntegrationContext) -> None:
        self._ctx = ctx
        for integration in self._integrations.values():
            try:
                await integration.start(ctx)
            except Exception:
                logger.exception(f"[Integrations] Failed to start '{integration.id}'")

    async def stop(self) -> None:
        for integration in self._integrations.values():
            try:
                await integration.stop()
            except Exception:
                logger.exception(f"[Integrations] Failed to stop '{integration.id}'")
        self._ctx = None

    # ───────── Catalog ─────────

    def catalog(self, *, include_settings: bool = False) -> list[dict[str, Any]]:
        return [
            self.catalog_entry(integration, include_settings=include_settings)
            for integration in self._integrations.values()
        ]

    def catalog_entry(
        self, integration: Integration, *, include_settings: bool = False
    ) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "id": integration.id,
            "name": integration.name,
            "description": integration.description,
            "kind": integration.kind.value,
            "enabled": self.is_enabled(integration.id),
            "endpoint": integration.endpoint(),
            "events": [
                {
                    "id": event.id,
                    "label": event.label,
                    "description": event.description,
                    "group": event.group,
                    "enabled": self.is_event_enabled(event.id),
                    "data_schema": event.data_schema,
                    "image_url": event.image_url,
                }
                for event in integration.events()
            ],
            "actions": [
                {
                    "id": action.id,
                    "label": action.label,
                    "description": action.description,
                    "group": action.group,
                    "enabled": self.is_action_enabled(action.id),
                    "payload_schema": action.payload_schema,
                    "reversible": action.reversible,
                }
                for action in integration.actions()
            ],
            "settings": [
                {
                    "key": definition.key,
                    "label": definition.label,
                    "description": definition.description,
                    "type": definition.type.value,
                    "source": definition.source,
                    "secret": definition.secret,
                    "options": list(definition.options),
                }
                for definition in integration.settings()
            ],
        }
        if include_settings:
            entry["values"] = self.settings_values(integration.id)
        return entry

    def _require(self, integration_id: str) -> Integration:
        integration = self._integrations.get(integration_id)
        if integration is None:
            raise ValueError(f"Unknown integration: {integration_id}")
        return integration
