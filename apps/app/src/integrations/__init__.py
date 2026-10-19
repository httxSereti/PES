"""
Integrations module: one registry of everything that contributes events,
actions and settings — core hardware (units, sensors) and external services
(Chaster, later X/Reddit/Fetlife...).

The default registry is built at import time so `IntegrationRegistry.get_instance()`
works from REST/WS handlers; `api/app.py` owns its lifecycle (start/stop in the
FastAPI lifespan).
"""

from .base import (
    ActionDef,
    ActionHandler,
    EventDef,
    Integration,
    IntegrationContext,
    IntegrationKind,
    SettingDef,
    SettingType,
)
from .chaster import ChasterIntegration
from .core.sensors import SensorsIntegration
from .core.units import UnitsIntegration
from .puryfi import PuryFiIntegration
from .registry import IntegrationRegistry
from .settings_store import IntegrationSettingsStore


def build_default_registry() -> IntegrationRegistry:
    """Register every integration the app ships with."""
    registry = IntegrationRegistry(IntegrationSettingsStore())
    registry.register(UnitsIntegration())
    registry.register(SensorsIntegration())
    registry.register(ChasterIntegration())
    registry.register(PuryFiIntegration())
    return registry


integration_registry = build_default_registry()

__all__ = [
    "ActionDef",
    "ActionHandler",
    "EventDef",
    "Integration",
    "IntegrationContext",
    "IntegrationKind",
    "IntegrationRegistry",
    "IntegrationSettingsStore",
    "SettingDef",
    "SettingType",
    "build_default_registry",
    "integration_registry",
]
