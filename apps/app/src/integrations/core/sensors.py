"""
BT Sensors — core integration (metadata facade).

The hardware threads and alarm checks live in hardware/sensors.py and the
per-sensor settings in the Store; this facade registers the events the
sensors emit so they appear in the same catalog as external integrations.
It is `core`: always enabled and it cannot be disabled from the UI.
"""

from __future__ import annotations

from integrations.base import EventDef, Integration, IntegrationKind


class SensorsIntegration(Integration):
    id = "sensors"
    name = "Sensors"
    description = "Bluetooth motion and sound sensors reporting alarms to the event pipeline."
    kind = IntegrationKind.CORE

    def events(self) -> list[EventDef]:
        return [
            EventDef(
                id="sensor_sound_alarm",
                label="Sound alarm",
                description="Noise crossed the alarm threshold",
            ),
            EventDef(
                id="sensor_position_alarm",
                label="Position alarm",
                description="Position/orientation alarm fired",
            ),
            EventDef(
                id="sensor_move_alarm",
                label="Move alarm",
                description="Movement was detected",
            ),
        ]
