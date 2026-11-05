"""
Optional hardware automation for guided training sessions.

The guided mode used to be purely informational: the client displayed phase
prompts derived from the session goals. This module turns that prompt into an
opt-in hardware program:

* apply a profile when the session starts;
* raise the profile level at each phase (warm-up, build, edge control, final
  push), capped by a strict maximum;
* lower the level after every successful edge, then restore it after a
  configurable automation cooldown;
* apply a reward profile on success and a punishment profile (or neutralize
  everything) on failure;
* reverse every change when the session is cancelled, and leave the normal
  neutralization paths (app session end, shutdown, panic stop) in control.

Safety model
------------
- Everything is disabled by default: ``guided_config.enabled`` must be true and
  the session must be in guided mode.
- ``max_level_pct`` is capped at 100 (the regular PROFILE action allows 150),
  and every automation step is clamped to it before being applied.
- The automation profile is a single queue item applied through the normal
  ``ActionExecutor``. It is therefore visible in the queue and is reversed by
  ``units:stop``, ``neutralize_all()`` and any queue cancellation.
- The item id is stable for the whole session. Re-applying the profile at a new
  level stops the previous ramps (same owner) and merges the snapshots so a
  single reverse restores the pre-session state.
- If the queue item disappears (panic stop, per-unit stop, manual queue
  cancellation), the automation is marked aborted and never re-applies a
  profile.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

import structlog

from events.enums import ActionType
from events.models import QueueItem
from events.queue import ActionQueue
from services.profiles import profile_exists

if TYPE_CHECKING:
    from database.models import EdgingSession

logger = structlog.get_logger("pes")

# Phase bounds mirror the client-side prompt in guided-phase.tsx.
_PHASE_UNTIL = (0.15, 0.65, 0.9, 1.0, 1.01)
COOLDOWN_PHASE = 4

_MAX_LEVEL_PCT = 100
_MAX_PHASE_STEP_PCT = 30
_MAX_EDGE_DROP_PCT = 50
_MAX_AUTOMATION_COOLDOWN = 3600

# Only one guided session can run at a time. The terminal profile of the
# previous session (reward/punishment) is cancelled when a new guided session
# starts, so it cannot keep driving the units under the new one.
_terminal_item_id: str | None = None


@dataclass
class GuidedState:
    """In-memory state of one live guided automation."""

    session_id: str
    config: dict
    phase_index: int
    phase_level: int
    level_pct: int
    item: QueueItem
    snapshot: dict = field(default_factory=dict)
    adopted: bool = False
    edge_dropped: bool = False
    phase_pending: bool = False
    drop_started_at: datetime | None = None
    aborted: bool = False

    @property
    def item_id(self) -> str:
        return self.item.id


_states: dict[str, GuidedState] = {}


# ───────── Configuration ─────────


def _as_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(low, min(high, parsed))


def _as_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    return bool(value)


def _profile_name(value: Any, field_name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a profile name")
    name = value.strip()
    if not profile_exists(name):
        raise ValueError(f"Profile '{name}' not found")
    return name


def normalize_guided_config(config: dict | None) -> dict | None:
    """Validate and normalize a session/template guided automation config.

    Returns ``None`` when automation is disabled. Raises ``ValueError`` with a
    user-facing message for invalid values, so the WS command can report it.
    """
    if not isinstance(config, dict) or not _as_bool(config.get("enabled"), False):
        return None

    profile = _profile_name(config.get("profile"), "Guided automation profile")
    if profile is None:
        raise ValueError("Guided automation needs a profile")

    max_level = _as_int(config.get("max_level_pct"), _MAX_LEVEL_PCT, 0, _MAX_LEVEL_PCT)
    start_level = _as_int(config.get("start_level_pct"), max_level, 0, max_level)
    phase_step = _as_int(config.get("phase_step_pct"), 0, 0, _MAX_PHASE_STEP_PCT)
    edge_drop = _as_int(config.get("edge_drop_pct"), 0, 0, _MAX_EDGE_DROP_PCT)
    edge_cooldown = _as_int(
        config.get("edge_cooldown_seconds"), 0, 0, _MAX_AUTOMATION_COOLDOWN
    )
    reward_level = _as_int(config.get("reward_level_pct"), max_level, 0, max_level)
    fail_level = _as_int(config.get("fail_level_pct"), max_level, 0, max_level)

    return {
        "enabled": True,
        "profile": profile,
        "start_level_pct": start_level,
        "phase_step_pct": phase_step,
        "max_level_pct": max_level,
        "edge_drop_pct": edge_drop,
        "edge_cooldown_seconds": edge_cooldown,
        "restore_after_cooldown": _as_bool(config.get("restore_after_cooldown"), True),
        "reward_profile": _profile_name(config.get("reward_profile"), "Reward profile"),
        "reward_level_pct": reward_level,
        "fail_profile": _profile_name(config.get("fail_profile"), "Punishment profile"),
        "fail_level_pct": fail_level,
        "neutralize_on_fail": _as_bool(config.get("neutralize_on_fail"), True),
    }


def phase_target_level(config: dict, phase_index: int) -> int:
    """Profile level for one guided phase, always capped by max_level_pct."""
    max_level = int(config.get("max_level_pct", _MAX_LEVEL_PCT))
    start = int(config.get("start_level_pct", max_level))
    if phase_index >= COOLDOWN_PHASE:
        level = start
    else:
        level = start + int(config.get("phase_step_pct", 0)) * phase_index
    return max(0, min(max_level, level))


def guided_phase_index(session: EdgingSession) -> int:
    """Current guided phase, derived from the goals exactly like the client."""
    # Imported lazily: services.training imports this module.
    from services.training import session_elapsed_seconds, success_edge_count

    duration_target = max(
        (
            int(goal.get("value", 0))
            for goal in (session.goals or [])
            if goal.get("type") == "duration"
        ),
        default=0,
    )
    edges_target = max(
        (
            int(goal.get("value", 0))
            for goal in (session.goals or [])
            if goal.get("type") == "edges"
        ),
        default=0,
    )

    if duration_target > 0:
        progress = (session_elapsed_seconds(session) or 0) / duration_target
    elif edges_target > 0:
        progress = success_edge_count(session) / edges_target
    else:
        progress = 0.0

    clamped = max(0.0, min(1.0, progress))
    for index, until in enumerate(_PHASE_UNTIL):
        if clamped < until:
            return index
    return 0


# ───────── Queue helpers ─────────


def _queue() -> ActionQueue | None:
    try:
        return ActionQueue.get_instance()
    except RuntimeError:
        return None


def _queue_has(queue: ActionQueue, item_id: str) -> bool:
    return any(item.id == item_id for item in queue.get_items())


def _abort(state: GuidedState, reason: str) -> None:
    if state.aborted:
        return
    state.aborted = True
    logger.warning(
        "[Training] Guided automation stopped",
        session_id=state.session_id,
        reason=reason,
    )


def _merge_snapshots(previous: dict | None, fresh: dict) -> dict:
    """Merge two PROFILE snapshots, keeping the original ``before`` values.

    The automation profile is re-applied at each level on the same queue item
    id. Reversal must restore the state from *before the session*, not the
    state before the latest step, so every field/usage keeps the first
    snapshot's ``before`` value and the latest ``applied`` value.
    """
    if not previous or not previous.get("units"):
        return fresh
    if not fresh or not fresh.get("units"):
        return previous

    previous_units = previous.get("units", {})
    fresh_units = fresh.get("units", {})
    merged: dict = {
        "type": "profile",
        "profile": fresh.get("profile") or previous.get("profile"),
        "level_pct": fresh.get("level_pct"),
        "queue_item_id": fresh.get("queue_item_id"),
        "units": {},
    }

    for unit_name in set(previous_units) | set(fresh_units):
        old_unit = previous_units.get(unit_name, {})
        new_unit = fresh_units.get(unit_name, {})
        unit: dict = {"usages": {}, "fields": {}}

        for channel in set(old_unit.get("usages", {})) | set(
            new_unit.get("usages", {})
        ):
            old_usage = old_unit.get("usages", {}).get(channel)
            new_usage = new_unit.get("usages", {}).get(channel)
            if old_usage and new_usage:
                unit["usages"][channel] = {
                    **new_usage,
                    "before_use": old_usage.get("before_use"),
                    "before_limit": old_usage.get("before_limit"),
                }
            elif old_usage:
                unit["usages"][channel] = old_usage
            elif new_usage:
                unit["usages"][channel] = new_usage

        for name in set(old_unit.get("fields", {})) | set(new_unit.get("fields", {})):
            old_field = old_unit.get("fields", {}).get(name)
            new_field = new_unit.get("fields", {}).get(name)
            if old_field and new_field:
                unit["fields"][name] = {
                    **new_field,
                    "before": old_field.get("before"),
                    "ramped": bool(old_field.get("ramped") or new_field.get("ramped")),
                }
            elif old_field:
                unit["fields"][name] = old_field
            elif new_field:
                unit["fields"][name] = new_field

        merged["units"][unit_name] = unit

    return merged


async def _cancel_state(state: GuidedState) -> None:
    """Reverse the automation profile and drop the queue item."""
    queue = _queue()
    if queue is not None and state.adopted:
        await queue.cancel(state.item_id)
    state.adopted = False
    state.snapshot = {}
    state.edge_dropped = False
    state.phase_pending = False
    state.drop_started_at = None


async def _apply_level(state: GuidedState, level_pct: int) -> bool:
    """(Re-)apply the automation profile at ``level_pct`` on the same item."""
    queue = _queue()
    if queue is None:
        return False
    if state.aborted:
        return False
    if state.adopted and not _queue_has(queue, state.item_id):
        _abort(state, "queue item removed")
        return False

    level = max(
        0, min(int(state.config.get("max_level_pct", _MAX_LEVEL_PCT)), level_pct)
    )
    payload = {
        "profile": state.config["profile"],
        "level_pct": level,
    }
    # Keep the unit filter discovered on the first apply.
    if isinstance(state.item.payload.get("units"), list):
        payload["units"] = state.item.payload["units"]
    state.item.payload = payload

    try:
        fresh = await queue.executor.apply(state.item)
    except Exception:
        logger.exception(
            "[Training] Failed to apply guided automation profile",
            session_id=state.session_id,
            level_pct=level,
        )
        try:
            from services.neutralize import neutralize_all

            await neutralize_all(
                reason=f"training:guided_apply_failed:{state.session_id}"
            )
        except Exception:
            logger.exception(
                "[Training] Failed to neutralize after a guided apply error",
                session_id=state.session_id,
            )
        state.snapshot = {}
        state.adopted = False
        _abort(state, "profile apply failed")
        return False

    if not isinstance(fresh, dict) or not fresh.get("units"):
        logger.warning(
            "[Training] Guided automation profile has no applicable units",
            session_id=state.session_id,
            profile=state.config["profile"],
        )
        await _cancel_state(state)
        _abort(state, "profile has no applicable units")
        return False

    # Limit future per-unit stops to the units this profile actually drives.
    units = list(fresh.get("units", {}))
    if units:
        state.item.payload = {**state.item.payload, "units": units}

    state.snapshot = _merge_snapshots(state.snapshot, fresh)
    state.item.snapshot_data = state.snapshot
    if not state.adopted:
        queue.adopt(state.item, state.snapshot)
        state.adopted = True
    state.level_pct = level
    return True


def _queue_item(
    *,
    item_id: str,
    session_id: str,
    name: str,
    payload: dict,
    priority: int,
) -> QueueItem:
    return QueueItem(
        id=item_id,
        action_type=ActionType.PROFILE,
        payload=payload,
        duration=-1,
        cumulative=True,
        priority=priority,
        origin=f"training:{session_id}",
        display_name=name,
        created_at=datetime.now(),
    )


# ───────── Terminal profiles (reward / punishment) ─────────


async def _cancel_terminal_item() -> None:
    global _terminal_item_id
    item_id = _terminal_item_id
    _terminal_item_id = None
    if item_id is None:
        return
    queue = _queue()
    if queue is not None and _queue_has(queue, item_id):
        await queue.cancel(item_id)


async def _apply_terminal_profile(
    session: EdgingSession, profile: str, level_pct: int
) -> None:
    """Apply a reward/punishment profile that stays until something stops it."""
    global _terminal_item_id
    queue = _queue()
    if queue is None:
        return

    await _cancel_terminal_item()
    item = _queue_item(
        item_id=f"guided-final:{session.id}",
        session_id=session.id,
        name=f"Guided {session.status}: {profile}",
        payload={"profile": profile, "level_pct": level_pct},
        priority=900,
    )
    try:
        snapshot = await queue.executor.apply(item)
    except Exception:
        logger.exception(
            "[Training] Failed to apply the guided terminal profile",
            session_id=session.id,
            profile=profile,
        )
        try:
            from services.neutralize import neutralize_all

            await neutralize_all(reason=f"training:guided_terminal_failed:{session.id}")
        except Exception:
            logger.exception(
                "[Training] Failed to neutralize after a terminal profile error",
                session_id=session.id,
            )
        return
    if not isinstance(snapshot, dict) or not snapshot.get("units"):
        logger.warning(
            "[Training] Guided terminal profile has no applicable units",
            session_id=session.id,
            profile=profile,
        )
        return

    item.snapshot_data = snapshot
    queue.adopt(item, snapshot)
    _terminal_item_id = item.id
    logger.info(
        "[Training] Applied guided terminal profile",
        session_id=session.id,
        profile=profile,
        level_pct=level_pct,
        status=session.status,
    )


# ───────── Lifecycle ─────────


async def start_guided_automation(session: EdgingSession) -> None:
    """Apply the start profile and begin phase automation (best effort)."""
    config = session.guided_config
    if session.mode != "guided" or not config:
        return
    previous = _states.pop(session.id, None)
    if previous is not None:
        await _cancel_state(previous)
    await _cancel_terminal_item()

    phase_index = guided_phase_index(session)
    state = GuidedState(
        session_id=session.id,
        config=config,
        phase_index=phase_index,
        phase_level=phase_target_level(config, phase_index),
        level_pct=int(config.get("start_level_pct", 0)),
        item=_queue_item(
            item_id=f"guided:{session.id}",
            session_id=session.id,
            name=f"Guided automation: {session.name}"[:120],
            payload={
                "profile": config["profile"],
                "level_pct": int(config.get("start_level_pct", 0)),
            },
            priority=1000,
        ),
    )
    _states[session.id] = state

    if not await _apply_level(state, state.phase_level):
        _states.pop(session.id, None)
        return

    logger.info(
        "[Training] Guided automation started",
        session_id=session.id,
        profile=config["profile"],
        level_pct=state.level_pct,
        max_level_pct=config.get("max_level_pct"),
    )


async def on_guided_edge(session: EdgingSession) -> None:
    """Lower the intensity after a successful edge."""
    state = _states.get(session.id)
    if state is None or state.aborted:
        return
    config = state.config
    drop = int(config.get("edge_drop_pct", 0))
    if drop <= 0:
        return

    target = max(0, state.level_pct - drop)
    if target == state.level_pct:
        return
    if not await _apply_level(state, target):
        return

    state.edge_dropped = True
    state.phase_pending = False
    state.drop_started_at = datetime.utcnow()
    logger.info(
        "[Training] Guided automation lowered the level after an edge",
        session_id=session.id,
        level_pct=state.level_pct,
    )


async def tick_guided_automation(session: EdgingSession) -> None:
    """Advance phases and restore the level after an automation cooldown."""
    state = _states.get(session.id)
    if state is None or state.aborted:
        return
    if session.paused_at is not None:
        return

    queue = _queue()
    if queue is None or not _queue_has(queue, state.item_id):
        _abort(state, "queue item removed")
        return

    config = state.config
    phase_index = guided_phase_index(session)
    target = phase_target_level(config, phase_index)

    if phase_index != state.phase_index:
        state.phase_index = phase_index
        state.phase_level = target
        if state.edge_dropped and int(config.get("edge_cooldown_seconds", 0)) > 0:
            # Do not raise the level while the post-edge cooldown is active.
            state.phase_pending = True
        else:
            if await _apply_level(state, target):
                state.edge_dropped = False
                state.phase_pending = False
                state.drop_started_at = None
            logger.info(
                "[Training] Guided automation phase changed",
                session_id=session.id,
                phase_index=phase_index,
                level_pct=state.level_pct,
            )

    cooldown = int(config.get("edge_cooldown_seconds", 0))
    if (
        state.edge_dropped
        and cooldown > 0
        and state.drop_started_at is not None
        and (datetime.utcnow() - state.drop_started_at).total_seconds() >= cooldown
    ):
        if bool(config.get("restore_after_cooldown", True)) or state.phase_pending:
            await _apply_level(state, state.phase_level)
        state.edge_dropped = False
        state.phase_pending = False
        state.drop_started_at = None


async def finish_guided_automation(session: EdgingSession) -> None:
    """Close a guided session: reward, punish/neutralize or restore."""
    state = _states.pop(session.id, None)
    if state is None:
        return

    config = state.config

    if session.status == "failed" and bool(config.get("neutralize_on_fail", True)):
        from services.neutralize import neutralize_all

        await neutralize_all(reason=f"training:guided_fail:{session.id}")
        logger.info(
            "[Training] Guided failure neutralized every output",
            session_id=session.id,
        )
        return

    if state.aborted:
        # Whoever removed the queue item already reversed/stopped the output.
        return

    await _cancel_state(state)

    if session.status == "succeeded":
        reward_profile = config.get("reward_profile")
        if reward_profile:
            await _apply_terminal_profile(
                session,
                reward_profile,
                int(config.get("reward_level_pct", 0)),
            )
    elif session.status == "failed":
        fail_profile = config.get("fail_profile")
        if fail_profile:
            await _apply_terminal_profile(
                session,
                fail_profile,
                int(config.get("fail_level_pct", 0)),
            )


def discard_guided_automation(session_id: str) -> None:
    """Forget the state without touching hardware (already neutralized)."""
    _states.pop(session_id, None)
