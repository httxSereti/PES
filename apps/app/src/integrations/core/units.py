"""
2B Units — core integration (metadata facade).

The hardware itself lives in hardware/units.py and the action math in
events/executor.py; this facade registers the actions the units provide so
they appear in the same catalog as external integrations. It is `core`:
always enabled and it cannot be disabled from the UI.
"""

from __future__ import annotations

from integrations.base import ActionDef, Integration, IntegrationKind

_ACTIONS = [
    ActionDef(
        id="PROFILE",
        label="Apply profile",
        description="Apply a saved profile to one or more units (reversible).",
        payload_schema={
            "profile": "string (A-J or X for random)",
            "level_pct": "integer (percentage 0-150, default 100)",
            "units": "list of unit ids (optional; defaults to every unit in the profile)",
        },
        reversible=True,
    ),
    ActionDef(
        id="LEVEL",
        label="Update level",
        description="Absolute, relative or percentage level change on units/channels.",
        payload_schema={
            "units": "string (e.g. '123', '12RM', '23RO')",
            "channels": "string (e.g. 'AB', 'ABRM')",
            "operation": "string (prefix: '', '+', '-', '%+', '%-')",
            "value": "string (level value, e.g. '30', '+10')",
        },
    ),
    ActionDef(
        id="MULT",
        label="Update multiplier",
        description="Add/subtract a percentage to the channel multipliers.",
        payload_schema={
            "target": "string (usage name or 'all')",
            "pct": "integer (percentage to add/subtract)",
            "random": "boolean (randomize between 0 and pct)",
        },
    ),
]


class UnitsIntegration(Integration):
    id = "units"
    name = "2B Units"
    description = "EStim boards driven over Bluetooth: levels, profiles and multipliers."
    kind = IntegrationKind.CORE

    def actions(self) -> list[ActionDef]:
        return list(_ACTIONS)
