"""
Single "neutralize everything" path for the emergency stop flows.

Session end, application shutdown and the panic stop command (`core:stop`)
all go through :func:`neutralize_all`, so they clear the same state in the
same order:

1. stop every software ramp without applying its end action;
2. cancel the action queue (running items are reversed by the queue);
3. reset both channel multipliers and zero both channels on every unit;
4. clear the active profile.

The order matters for hardware safety: ramps are stopped before the levels
are zeroed so a surviving ramp cannot write its peak back on the next tick,
and the channels are zeroed after the queue reversal so a reversed LEVEL or
PROFILE action cannot leave a non-zero level behind.
"""

from __future__ import annotations

import structlog

from api.ws.websocket_notifier import ws_notifier
from constants import BT_UNITS
from events.queue import ActionQueue
from hardware.ramp import ramp_manager
from store import Store
from typings import UnitDict

logger = structlog.get_logger("pes")

store = Store()

# Neutral multiplier: the 2B applies levels at 100% (see hardware/units.py)
DEFAULT_MULTIPLIER = 100


def _reset_unit(unit: UnitDict) -> dict:
    """Zero a unit's channels, reset its multipliers, return the changes."""
    changes = {
        "ch_A": 0,
        "ch_B": 0,
        "ch_A_multiplier": DEFAULT_MULTIPLIER,
        "ch_B_multiplier": DEFAULT_MULTIPLIER,
    }
    store.update_unit_dict(unit, {**changes, "updated": True})
    return changes


async def neutralize_all(reason: str) -> None:
    """
    Cancel everything that can still drive a unit, then leave it at zero.

    Used by session end, shutdown and the panic stop command. Runs on the
    API loop (queue cancellation is async).
    """
    # 1. Ramps first: stop without their end action so they cannot overwrite
    #    the levels zeroed below on their next tick.
    ramp_manager.stop_all(restore=False)

    # 2. Queue: cancel_all reverses RUNNING items, which may restore levels;
    #    step 3 runs after it on purpose.
    try:
        queue = ActionQueue.get_instance()
    except RuntimeError:
        queue = None
    if queue is not None:
        await queue.cancel_all()

    # 3. Outputs: zero both channels and reset the multipliers on every unit.
    for unit_str in BT_UNITS:
        unit = UnitDict(unit_str)
        changes = _reset_unit(unit)
        ws_notifier.notify("units:update", {"id": unit.value, "changes": changes})

    # 4. Active profile: nothing is driving the units anymore.
    if store.clear_active_profile():
        ws_notifier.notify("profiles:active", None)

    logger.info(
        "[Neutralize] Cleared queue, ramps, multipliers, levels and profile",
        reason=reason,
    )
