"""
Domain logic for edging training sessions: serialization to the WS wire
shape, goal evaluation, stats (overview + per-session comparisons) and
WebSocket broadcasts.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Optional

import structlog
from sqlalchemy.exc import IntegrityError

from api.ws.websocket_notifier import ws_notifier
from database.models import EdgingEdge, EdgingProgram, EdgingSession, EdgingTemplate
from database.repositories.edging_repo import EdgingRepo
from database.repositories.training_repo import TrainingRepo
from events.enums import TriggerableEvent
from typings import EdgeDifficulty, EdgeOutcome, EdgingGoalType, Permission
from utils import to_utc_iso

logger = structlog.get_logger("pes")

SUCCESS_EDGE_OUTCOME = EdgeOutcome.SUCCESS.value

# Serialize state changes per session inside this process (all WS commands and
# the auto-stop tick run on the same asyncio loop). This keeps "record edge +
# decide whether the session ends" and the timer from interleaving.
_session_locks: dict[str, asyncio.Lock] = {}
_start_lock = asyncio.Lock()
# Session ids already announced as "goals reached" (avoid one event per edge).
_goal_announced: set[str] = set()


def _session_lock(session_id: str) -> asyncio.Lock:
    lock = _session_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _session_locks[session_id] = lock
    return lock


def can_access_session(
    session: EdgingSession, viewer_id: str | None, is_host: bool = False
) -> bool:
    """Creator, explicit participants and Hosts can see a training session."""
    if is_host or viewer_id is None:
        return True
    return session.created_by == viewer_id or viewer_id in (
        session.participant_ids or []
    )


def _require_session_access(
    session: EdgingSession, viewer_id: str | None, is_host: bool
) -> None:
    if not can_access_session(session, viewer_id, is_host):
        # Same message as a missing row: do not leak other users' session ids.
        raise ValueError("Session not found")


def _session_recipients(session: EdgingSession) -> set[str]:
    """Users that should receive live updates for this session."""
    from store import Store

    store = Store()
    recipients: set[str] = set()
    candidates = {session.created_by, *(session.participant_ids or [])}
    for user_id in candidates:
        user = store.get_user(user_id)
        if user is not None and (
            user.has_permission(Permission.HOST)
            or user.has_any_permission(
                Permission.TRAINING_EDGING_READ,
                Permission.TRAINING_EDGING_MANAGE,
            )
        ):
            recipients.add(user_id)

    for user in store.get_all_users().values():
        if user.has_permission(Permission.HOST):
            recipients.add(user.id)
    return recipients


def _capture_intensity_snapshot() -> dict:
    """Compact snapshot of the live units/profile for an edge record."""
    from store import Store

    store = Store()
    units: dict[str, dict] = {}
    keys = (
        "ch_A",
        "ch_B",
        "ch_A_multiplier",
        "ch_B_multiplier",
        "adj_1",
        "adj_2",
        "mode",
        "power_bias",
    )
    for unit_name, settings in store.get_all_units_settings().items():
        if not settings:
            continue
        units[unit_name] = {
            key: settings.get(key) for key in keys if key in settings
        }
    return {"profile": store.get_active_profile(), "units": units}


def _finalize_pause_fields(session: EdgingSession, now: datetime) -> dict:
    """Close an open pause before the session ends."""
    total = session.total_paused_seconds or 0
    if session.paused_at is not None:
        total += max(0, int((now - session.paused_at).total_seconds()))
    return {"paused_at": None, "total_paused_seconds": total}


def _training_event_data(session: EdgingSession, **extra) -> dict:
    """Privacy-safe event payload (no name, notes or participant ids)."""
    return {
        "session_id": session.id,
        "status": session.status,
        "edge_count": success_edge_count(session),
        "duration_seconds": session_elapsed_seconds(session),
        "goals_met": goals_met(session),
        "auto_stop_on_goal": session.auto_stop_on_goal,
        "mode": session.mode or "manual",
        **extra,
    }


async def _dispatch_training_event(
    event_type: str, session: EdgingSession, **extra
) -> None:
    """Send a training event through the normal trigger-rule pipeline."""
    try:
        from events.dispatcher import EventDispatcher

        dispatcher = EventDispatcher.get_instance()
    except RuntimeError:
        # Tests / early startup: no dispatcher yet.
        return

    try:
        await dispatcher.dispatch(
            event_type,
            event_data=_training_event_data(session, **extra),
            origin=f"training:{session.id}",
        )
    except Exception:
        logger.exception(
            "[Training] Failed to dispatch event",
            event_type=event_type,
            session_id=session.id,
        )


def _notify_training(
    session: EdgingSession,
    kind: str,
    message: str,
    *,
    actor_user_id: str | None = None,
    status: str | None = None,
) -> None:
    recipients = _session_recipients(session)
    if actor_user_id:
        recipients.discard(actor_user_id)
    if not recipients:
        return
    ws_notifier.notify_to_users(
        "training:notification",
        {
            "kind": kind,
            "session_id": session.id,
            "message": message,
            "actor_user_id": actor_user_id,
            "status": status,
        },
        recipients,
    )


def _ended_message(session: EdgingSession) -> str:
    labels = {
        "succeeded": "session succeeded",
        "failed": "session failed",
        "cancelled": "session cancelled",
        "interrupted": "session interrupted",
    }
    return f"{session.name}: {labels.get(session.status, session.status)}"


async def _announce_goal_reached(
    session: EdgingSession, actor_user_id: str | None = None
) -> None:
    if session.id in _goal_announced:
        return
    _goal_announced.add(session.id)
    _notify_training(
        session,
        "goal_reached",
        f"{session.name}: all goals reached",
        actor_user_id=actor_user_id,
        status=session.status,
    )
    await _dispatch_training_event(
        TriggerableEvent.TRAINING_GOAL_REACHED.value, session
    )


_ENDED_EVENT_TYPES = {
    "succeeded": TriggerableEvent.TRAINING_SESSION_SUCCEEDED.value,
    "failed": TriggerableEvent.TRAINING_SESSION_FAILED.value,
    "cancelled": TriggerableEvent.TRAINING_SESSION_CANCELLED.value,
}


async def _announce_session_ended(
    session: EdgingSession,
    actor_user_id: str | None = None,
    *,
    dispatch_event: bool = True,
) -> None:
    _notify_training(
        session,
        "ended",
        _ended_message(session),
        actor_user_id=actor_user_id,
        status=session.status,
    )
    event_type = _ENDED_EVENT_TYPES.get(session.status)
    if dispatch_event and event_type is not None:
        extra = {"outcome": "fail"} if session.status == "failed" else {}
        await _dispatch_training_event(event_type, session, **extra)
    _goal_announced.discard(session.id)


# ───────── Serialization ─────────


def session_elapsed_seconds(
    session: EdgingSession, now: Optional[datetime] = None
) -> int | None:
    """Active seconds in the session, excluding every pause."""
    if session.started_at is None:
        return None
    current = now or datetime.utcnow()
    end = session.ended_at or current
    elapsed = max(0.0, (end - session.started_at).total_seconds())
    paused = float(session.total_paused_seconds or 0)
    if session.paused_at is not None:
        pause_end = session.ended_at or current
        paused += max(0.0, (pause_end - session.paused_at).total_seconds())
    return max(0, int(elapsed - paused))


def success_edge_count(session: EdgingSession) -> int:
    return sum(1 for e in session.edges if e.outcome == SUCCESS_EDGE_OUTCOME)


def goals_met(session: EdgingSession, now: Optional[datetime] = None) -> bool:
    """True when *every* configured goal is reached."""
    if not session.goals:
        return False
    elapsed = session_elapsed_seconds(session, now)
    edges_done = success_edge_count(session)
    for goal in session.goals:
        goal_type = goal.get("type")
        value = goal.get("value", 0)
        if goal_type == EdgingGoalType.DURATION.value:
            if elapsed is None or elapsed < value:
                return False
        elif goal_type == EdgingGoalType.EDGES.value:
            if edges_done < value:
                return False
    return True


def serialize_edge(edge: EdgingEdge) -> dict:
    return {
        "id": edge.id,
        "session_id": edge.session_id,
        "difficulty": edge.difficulty,
        "outcome": edge.outcome,
        "recorded_by": edge.recorded_by,
        "source": edge.source or "host",
        "interval_seconds": edge.interval_seconds,
        "level_snapshot": edge.level_snapshot,
        "note": edge.note,
        "client_edge_id": edge.client_edge_id,
        "recorded_at": to_utc_iso(edge.recorded_at),
    }


def serialize_session_summary(
    session: EdgingSession, now: Optional[datetime] = None
) -> dict:
    """Broadcastable session state: no notes, user ids or other private data."""
    return {
        "id": session.id,
        "name": session.name,
        "goals": [dict(g) for g in session.goals],
        "auto_stop_on_goal": session.auto_stop_on_goal,
        "initiator": session.initiator,
        "status": session.status,
        "rating": session.rating,
        "app_session_id": session.app_session_id,
        "program_id": session.program_id,
        "program_step": session.program_step,
        "mode": session.mode or "manual",
        "paused_at": to_utc_iso(session.paused_at),
        "total_paused_seconds": session.total_paused_seconds or 0,
        "created_at": to_utc_iso(session.created_at),
        "started_at": to_utc_iso(session.started_at),
        "ended_at": to_utc_iso(session.ended_at),
        "edge_count": success_edge_count(session),
        "duration_seconds": session_elapsed_seconds(session, now),
        "goals_met": goals_met(session, now),
    }


def serialize_session(session: EdgingSession, now: Optional[datetime] = None) -> dict:
    """Full document for personal replies (includes Host-authored notes)."""
    payload = serialize_session_summary(session, now)
    payload.update(
        {
            "initiator_user_id": session.initiator_user_id,
            "created_by": session.created_by,
            "participant_ids": list(session.participant_ids or []),
            "notes": session.notes,
        }
    )
    return payload


# ───────── Stats ─────────

_ENDED_STATUSES = {"succeeded", "failed", "cancelled", "interrupted"}


def _session_pace(session: EdgingSession) -> Optional[float]:
    """Successful edges per minute."""
    duration = session_elapsed_seconds(session)
    if not duration:
        return None
    return round(success_edge_count(session) / (duration / 60), 2)


def compute_overview_stats(sessions: list[EdgingSession]) -> dict:
    """Aggregates across every session (see TrainingOverviewStats wire model)."""
    ended = [s for s in sessions if s.status in _ENDED_STATUSES]
    ended_with_time = [s for s in ended if session_elapsed_seconds(s) is not None]

    durations = [session_elapsed_seconds(s) or 0 for s in ended_with_time]
    success_edges = sum(success_edge_count(s) for s in ended)
    failed_edges = sum(
        sum(1 for e in s.edges if e.outcome != SUCCESS_EDGE_OUTCOME) for s in ended
    )
    ratings = [s.rating for s in sessions if s.rating is not None]

    difficulty_counts: dict[str, int] = {}
    for s in sessions:
        for e in s.edges:
            difficulty_counts[e.difficulty] = difficulty_counts.get(e.difficulty, 0) + 1

    return {
        "total_sessions": len(sessions),
        "ended_sessions": len(ended),
        "succeeded_sessions": sum(1 for s in ended if s.status == "succeeded"),
        "failed_sessions": sum(1 for s in ended if s.status == "failed"),
        "cancelled_sessions": sum(1 for s in ended if s.status == "cancelled"),
        "interrupted_sessions": sum(
            1 for s in ended if s.status == "interrupted"
        ),
        "total_edges": success_edges + failed_edges,
        "total_success_edges": success_edges,
        "total_failed_edges": failed_edges,
        "total_duration_seconds": sum(durations),
        "average_duration_seconds": round(sum(durations) / len(durations), 1) if durations else None,
        "average_edges_per_session": round(success_edges / len(ended), 1) if ended else None,
        "success_rate": round(
            sum(1 for s in ended if s.status == "succeeded") / len(ended), 2
        )
        if ended
        else None,
        "average_rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
        "difficulty_counts": difficulty_counts,
    }


def _previous_session(
    session: EdgingSession, others: list[EdgingSession]
) -> EdgingSession | None:
    """Most recent *other* ended session that started before this one."""
    session_start = session.started_at
    best: EdgingSession | None = None
    best_start: datetime | None = None
    for s in others:
        if s.started_at is None:
            continue
        if session_start is not None and s.started_at > session_start:
            continue
        if best_start is None or s.started_at > best_start:
            best = s
            best_start = s.started_at
    return best


def compute_session_stats(
    session: EdgingSession, all_sessions: list[EdgingSession]
) -> dict:
    """
    Per-session stats with comparisons against the previous session and the
    global averages of past sessions (see EdgingSessionStats wire model).
    """
    success = sum(1 for e in session.edges if e.outcome == SUCCESS_EDGE_OUTCOME)
    failed = len(session.edges) - success
    duration = session_elapsed_seconds(session)
    pace = _session_pace(session)

    others = [
        s
        for s in all_sessions
        if s.id != session.id
        and s.status in _ENDED_STATUSES
        and s.started_at is not None
    ]
    previous = _previous_session(session, others)
    # Averages over every past session (excluding this one)
    durations = [session_elapsed_seconds(s) or 0 for s in others]
    paces = [p for p in (_session_pace(s) for s in others) if p is not None]
    edges_counts = [success_edge_count(s) for s in others]

    difficulty_counts: dict[str, int] = {}
    for e in session.edges:
        difficulty_counts[e.difficulty] = difficulty_counts.get(e.difficulty, 0) + 1

    return {
        "duration_seconds": duration,
        "success_edges": success,
        "failed_edges": failed,
        "edges_per_minute": pace,
        "edges_per_minute_previous": _session_pace(previous) if previous else None,
        "edges_per_minute_average": round(sum(paces) / len(paces), 2) if paces else None,
        "duration_previous_seconds": session_elapsed_seconds(previous) if previous else None,
        "duration_average_seconds": round(sum(durations) / len(durations), 1) if durations else None,
        "edges_previous": success_edge_count(previous) if previous else None,
        "edges_average": round(sum(edges_counts) / len(edges_counts), 1) if edges_counts else None,
        "difficulty_counts": difficulty_counts,
    }


# ───────── Broadcasts ─────────


def broadcast_session(session: EdgingSession) -> None:
    ws_notifier.notify_to_users(
        "training:session",
        serialize_session_summary(session),
        _session_recipients(session),
    )


def broadcast_session_deleted(session: EdgingSession) -> None:
    ws_notifier.notify_to_users(
        "training:session_deleted",
        {"id": session.id},
        _session_recipients(session),
    )


def broadcast_edge(edge: EdgingEdge, session: EdgingSession) -> None:
    ws_notifier.notify_to_users(
        "training:edge",
        serialize_edge(edge),
        _session_recipients(session),
    )


def broadcast_edge_deleted(
    edge_id: str, session: EdgingSession
) -> None:
    ws_notifier.notify_to_users(
        "training:edge_deleted",
        {"id": edge_id, "session_id": session.id},
        _session_recipients(session),
    )


async def get_live_snapshot(
    repo: Optional[EdgingRepo] = None,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
) -> dict:
    """Current live session + its edges, for the WS init sequence."""
    repo = repo or EdgingRepo()
    session = await repo.get_running_session()
    if session is None or not can_access_session(session, viewer_id, is_host):
        return {"session": None, "edges": []}
    return {
        "session": serialize_session_summary(session),
        "edges": [serialize_edge(e) for e in session.edges],
    }


# ───────── Domain operations (moved from api/rest/training.py) ─────────
#
# These replace the former REST handlers; errors surface as `ValueError`
# with user-facing messages, translated into CommandResult errors by the
# WS command handlers.


def _validate_participants(
    participant_ids: list[str] | None, owner_id: str
) -> list[str]:
    """De-duplicate participants and keep the owner out of the explicit list."""
    return [
        participant
        for participant in dict.fromkeys(participant_ids or [])
        if participant and participant != owner_id
    ]


def _validate_goals(goals: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for goal in goals:
        if goal.get("type") not in {g.value for g in EdgingGoalType}:
            raise ValueError(f"Unknown goal type: {goal.get('type')}")
        normalized.append({"type": goal["type"], "value": goal["value"]})
    return normalized


def _require_ended(session_status: str) -> None:
    if session_status not in _ENDED_STATUSES:
        raise ValueError("Only allowed once the session ended")


async def get_overview(
    repo: Optional[EdgingRepo] = None,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
) -> dict:
    """Stats for the whole Training module (one stats card per submodule)."""
    repo = repo or EdgingRepo()
    sessions = [
        session
        for session in await repo.list_sessions(limit=1000)
        if can_access_session(session, viewer_id, is_host)
    ]
    return {
        "edging": compute_overview_stats(sessions),
        "recent_sessions": [serialize_session_summary(s) for s in sessions[:5]],
    }


async def list_edging_sessions(
    repo: Optional[EdgingRepo] = None,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
) -> list[dict]:
    repo = repo or EdgingRepo()
    sessions = await repo.list_sessions(limit=100)
    return [
        serialize_session_summary(session)
        for session in sessions
        if can_access_session(session, viewer_id, is_host)
    ]


async def get_session_detail(
    session_id: str,
    *,
    include_notes: bool = True,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """One session + its edges + per-session stats.

    ``include_notes`` is false for readers who are not allowed to manage
    training sessions; the rest of the detail stays readable.
    """
    repo = repo or EdgingRepo()
    session = await repo.get_session(session_id)
    if session is None:
        raise ValueError("Session not found")
    _require_session_access(session, viewer_id, is_host)

    all_sessions = [
        candidate
        for candidate in await repo.list_sessions(limit=1000)
        if can_access_session(candidate, viewer_id, is_host)
    ]
    serialized = serialize_session(session)
    if not include_notes:
        serialized["notes"] = None
    return {
        "session": serialized,
        "edges": [serialize_edge(e) for e in session.edges],
        "stats": compute_session_stats(session, all_sessions),
    }


async def create_edging_session(
    *,
    name: str,
    goals: list[dict],
    auto_stop_on_goal: bool,
    is_host: bool,
    created_by: str,
    app_session_id: str | None = None,
    participant_ids: list[str] | None = None,
    mode: str | None = None,
    program_id: str | None = None,
    program_step: int | None = None,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Create (configure) a session. Hosts create for themselves; members
    create a request the Host can start later."""
    repo = repo or EdgingRepo()
    if mode is not None and mode not in {"manual", "guided"}:
        raise ValueError("Mode must be 'manual' or 'guided'")
    session = await repo.create_session(
        name=name,
        goals=_validate_goals(goals),
        auto_stop_on_goal=auto_stop_on_goal,
        initiator="self" if is_host else "member",
        initiator_user_id=created_by,
        created_by=created_by,
        app_session_id=app_session_id,
        participant_ids=_validate_participants(participant_ids, created_by),
        mode=mode or "manual",
        program_id=program_id,
        program_step=program_step,
    )
    broadcast_session(session)
    return serialize_session(session)


async def update_edging_session(
    session_id: str,
    *,
    is_host: bool,
    viewer_id: str | None = None,
    name: Optional[str] = None,
    goals: Optional[list[dict]] = None,
    auto_stop_on_goal: Optional[bool] = None,
    participant_ids: Optional[list[str]] = None,
    mode: Optional[str] = None,
    notes: Optional[str] = None,
    rating: Optional[int] = None,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Update config fields (MANAGE) or notes/rating (HOST, ended sessions only)."""
    repo = repo or EdgingRepo()
    session = await repo.get_session(session_id)
    if session is None:
        raise ValueError("Session not found")
    _require_session_access(session, viewer_id, is_host)

    fields: dict = {}

    if (
        name is not None
        or goals is not None
        or auto_stop_on_goal is not None
        or participant_ids is not None
        or mode is not None
    ):
        if session.status != "configured":
            raise ValueError(
                "Goals and auto-stop can only be changed before the session starts"
            )
        if name is not None:
            fields["name"] = name
        if goals is not None:
            fields["goals"] = _validate_goals(goals)
        if auto_stop_on_goal is not None:
            fields["auto_stop_on_goal"] = auto_stop_on_goal
        if participant_ids is not None:
            fields["participant_ids"] = _validate_participants(
                participant_ids, session.created_by
            )
        if mode is not None:
            if mode not in {"manual", "guided"}:
                raise ValueError("Mode must be 'manual' or 'guided'")
            fields["mode"] = mode

    if notes is not None or rating is not None:
        if not is_host:
            raise ValueError("Host only: notes and rating")
        _require_ended(session.status)
        if notes is not None:
            fields["notes"] = notes
        if rating is not None:
            fields["rating"] = rating

    if not fields:
        return serialize_session(session)

    updated = await repo.update_session(session_id, **fields)
    if updated is None:
        raise ValueError("Session not found")
    broadcast_session(updated)
    return serialize_session(updated)


async def delete_edging_session(
    session_id: str,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> bool:
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)
        if session.status == "running":
            raise ValueError("Cannot delete a running session — end it first")
        if not await repo.delete_session(session_id):
            raise ValueError("Session not found")
        _goal_announced.discard(session_id)
        broadcast_session_deleted(session)
        return True


async def start_edging_session(
    session_id: str,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
    app_session_id: str | None = None,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    repo = repo or EdgingRepo()
    async with _start_lock:
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)
        if session.status != "configured":
            raise ValueError(f"Session is {session.status}, not configured")

        if await repo.get_running_session() is not None:
            raise ValueError("A session is already running")

        fields: dict = {
            "status": "running",
            "started_at": datetime.utcnow(),
        }
        if app_session_id is not None:
            fields["app_session_id"] = app_session_id

        updated = await repo.update_session_if_status(
            session_id, "configured", **fields
        )
        if updated is None:
            raise ValueError("Session is no longer configured")
        _goal_announced.discard(session_id)
        broadcast_session(updated)
        _notify_training(
            updated,
            "started",
            f"{updated.name}: session started",
            actor_user_id=viewer_id,
            status=updated.status,
        )
        await _dispatch_training_event(
            TriggerableEvent.TRAINING_SESSION_STARTED.value, updated
        )
        return serialize_session(updated)


async def record_edging_edge(
    session_id: str,
    *,
    difficulty: str,
    outcome: str,
    recorded_by: str,
    source: str = "host",
    client_edge_id: str | None = None,
    note: str | None = None,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Record an edge on the running session. A failed edge ends the session."""
    repo = repo or EdgingRepo()
    if difficulty not in {d.value for d in EdgeDifficulty}:
        raise ValueError(f"Unknown difficulty: {difficulty}")
    if outcome not in {o.value for o in EdgeOutcome}:
        raise ValueError(f"Unknown outcome: {outcome}")

    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)

        # Retries with the same client id are no-ops, even after the session
        # ended (the original edge was already committed).
        if client_edge_id is not None:
            existing = await repo.get_edge_by_client_id(
                session_id, client_edge_id
            )
            if existing is not None:
                return {
                    "edge": serialize_edge(existing),
                    "session": serialize_session(session),
                }

        if session.status != "running":
            raise ValueError("Session is not running")
        if session.paused_at is not None:
            raise ValueError("Session is paused — resume it before recording an edge")

        was_met = goals_met(session)
        now = datetime.utcnow()
        previous = session.edges[-1] if session.edges else None
        reference = previous.recorded_at if previous else session.started_at
        interval_seconds = (
            max(0, int((now - reference).total_seconds()))
            if reference is not None
            else None
        )
        try:
            level_snapshot = _capture_intensity_snapshot()
        except Exception:
            # Metadata must never block recording an edge.
            logger.warning("[Training] Intensity snapshot failed")
            level_snapshot = None

        try:
            edge = await repo.add_edge(
                session_id,
                difficulty=difficulty,
                outcome=outcome,
                recorded_by=recorded_by,
                source=source,
                interval_seconds=interval_seconds,
                level_snapshot=level_snapshot,
                note=note,
                client_edge_id=client_edge_id,
            )
        except IntegrityError:
            # Concurrent retry with the same idempotency key.
            existing = (
                await repo.get_edge_by_client_id(session_id, client_edge_id)
                if client_edge_id
                else None
            )
            if existing is None:
                raise
            return {
                "edge": serialize_edge(existing),
                "session": serialize_session(session),
            }
        if edge is None:
            raise ValueError("Session is not running")
        broadcast_edge(edge, session)

        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")

        updated = session
        pause_fields = _finalize_pause_fields(session, now)
        if outcome == EdgeOutcome.FAIL.value:
            updated = await repo.update_session_if_status(
                session_id,
                "running",
                status="failed",
                ended_at=now,
                **pause_fields,
            )
        elif goals_met(session, now) and session.auto_stop_on_goal:
            updated = await repo.update_session_if_status(
                session_id,
                "running",
                status="succeeded",
                ended_at=now,
                **pause_fields,
            )

        if updated is None:
            # Another coroutine ended the session first; report its final state.
            updated = await repo.get_session(session_id)
        if updated is None:
            raise ValueError("Session not found")

        broadcast_session(updated)
        await _dispatch_training_event(
            TriggerableEvent.TRAINING_EDGE_RECORDED.value,
            updated,
            difficulty=difficulty,
            outcome=outcome,
            interval_seconds=interval_seconds,
            source=source,
        )
        _notify_training(
            updated,
            "edge",
            f"{updated.name}: "
            + (
                "edge failed"
                if outcome == EdgeOutcome.FAIL.value
                else f"edge recorded ({difficulty})"
            ),
            actor_user_id=recorded_by,
            status=updated.status,
        )
        if (
            outcome != EdgeOutcome.FAIL.value
            and goals_met(updated)
            and not was_met
        ):
            await _announce_goal_reached(updated, recorded_by)
        if updated.status in _ENDED_STATUSES:
            await _announce_session_ended(updated, recorded_by)

        return {
            "edge": serialize_edge(edge),
            "session": serialize_session(updated),
        }


async def delete_edging_edge(
    session_id: str,
    *,
    edge_id: str,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Undo one edge while the session is still running."""
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)
        if session.status != "running":
            raise ValueError("Edges can only be undone while the session is running")
        if not await repo.delete_edge(session_id, edge_id):
            raise ValueError("Edge not found")

        broadcast_edge_deleted(edge_id, session)
        updated = await repo.get_session(session_id)
        if updated is None:
            raise ValueError("Session not found")
        if not goals_met(updated):
            _goal_announced.discard(session_id)
        broadcast_session(updated)
        return serialize_session(updated)


async def pause_edging_session(
    session_id: str,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Pause a running session; active duration stops advancing."""
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)
        if session.status != "running":
            raise ValueError("Session is not running")
        if session.paused_at is not None:
            return serialize_session(session)

        updated = await repo.update_session_if_status(
            session_id, "running", paused_at=datetime.utcnow()
        )
        if updated is None:
            raise ValueError("Session is not running")
        broadcast_session(updated)
        _notify_training(
            updated,
            "paused",
            f"{updated.name}: session paused",
            actor_user_id=viewer_id,
            status=updated.status,
        )
        await _dispatch_training_event(
            TriggerableEvent.TRAINING_SESSION_PAUSED.value, updated
        )
        return serialize_session(updated)


async def resume_edging_session(
    session_id: str,
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Resume a paused session, accumulating the paused duration."""
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)
        if session.status != "running":
            raise ValueError("Session is not running")
        if session.paused_at is None:
            return serialize_session(session)

        now = datetime.utcnow()
        paused_seconds = max(
            0, int((now - session.paused_at).total_seconds())
        )
        updated = await repo.update_session_if_status(
            session_id,
            "running",
            paused_at=None,
            total_paused_seconds=(session.total_paused_seconds or 0)
            + paused_seconds,
        )
        if updated is None:
            raise ValueError("Session is not running")
        broadcast_session(updated)
        _notify_training(
            updated,
            "resumed",
            f"{updated.name}: session resumed",
            actor_user_id=viewer_id,
            status=updated.status,
        )
        await _dispatch_training_event(
            TriggerableEvent.TRAINING_SESSION_RESUMED.value, updated
        )
        return serialize_session(updated)


async def end_edging_session(
    session_id: str,
    *,
    status: str,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Host ends a running session: succeeded (goals must be met) or cancelled."""
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        _require_session_access(session, viewer_id, is_host)
        if session.status != "running":
            raise ValueError("Session is not running")

        if status == "succeeded" and not goals_met(session):
            raise ValueError(
                "Goals are not all reached yet — end as cancelled or keep going"
            )

        now = datetime.utcnow()
        updated = await repo.update_session_if_status(
            session_id,
            "running",
            status=status,
            ended_at=now,
            **_finalize_pause_fields(session, now),
        )
        if updated is None:
            raise ValueError("Session is not running")
        broadcast_session(updated)
        if status == "succeeded":
            await _announce_goal_reached(updated, viewer_id)
        await _announce_session_ended(updated, viewer_id)
        return serialize_session(updated)


async def tick_running_sessions(repo: Optional[EdgingRepo] = None) -> None:
    """Auto-stop a running session once all its goals are reached.

    Called once per second by the API loop. Only sessions explicitly configured
    with ``auto_stop_on_goal`` are ended; otherwise the Host decides.
    """
    repo = repo or EdgingRepo()
    # Lightweight check first: most sessions do not auto-stop.
    session = await repo.get_running_session(load_edges=False)
    if session is None:
        return

    if not session.auto_stop_on_goal:
        # Still announce a duration-only goal once, even when the Host keeps
        # the session running manually.
        if (
            session.id in _goal_announced
            or session.paused_at is not None
            or not any(
                goal.get("type") == EdgingGoalType.DURATION.value
                for goal in session.goals
            )
        ):
            return
        full = await repo.get_session(session.id)
        if (
            full is not None
            and full.status == "running"
            and goals_met(full)
        ):
            await _announce_goal_reached(full)
        return

    async with _session_lock(session.id):
        # Re-read under the lock: the session may have ended while waiting.
        session = await repo.get_session(session.id)
        if (
            session is None
            or session.status != "running"
            or not session.auto_stop_on_goal
        ):
            return
        if not goals_met(session):
            return

        now = datetime.utcnow()
        updated = await repo.update_session_if_status(
            session.id,
            "running",
            status="succeeded",
            ended_at=now,
            **_finalize_pause_fields(session, now),
        )
        if updated is not None:
            broadcast_session(updated)
            await _announce_goal_reached(updated)
            await _announce_session_ended(updated)
            logger.info(
                "[Training] Auto-stopped session on goals",
                session_id=updated.id,
            )


async def recover_orphan_sessions(repo: Optional[EdgingRepo] = None) -> int:
    """Mark sessions left ``running`` by a crash/restart as interrupted.

    Called at startup and graceful shutdown. Without this a crashed session
    stays "live" forever and blocks every new session.
    """
    repo = repo or EdgingRepo()
    sessions = await repo.list_running_sessions()
    if not sessions:
        return 0

    now = datetime.utcnow()
    recovered = 0
    for session in sessions:
        updated = await repo.update_session_if_status(
            session.id,
            "running",
            status="interrupted",
            ended_at=now,
            **_finalize_pause_fields(session, now),
        )
        if updated is not None:
            _goal_announced.discard(session.id)
            broadcast_session(updated)
            recovered += 1

    if recovered:
        logger.warning(
            "[Training] Interrupted orphan session(s) at startup/shutdown",
            count=recovered,
        )
    return recovered


async def end_sessions_for_app_session(
    app_session_id: str, repo: Optional[EdgingRepo] = None
) -> int:
    """Cancel running training sessions linked to an application session."""
    repo = repo or EdgingRepo()
    sessions = await repo.list_running_sessions_for_app_session(app_session_id)
    ended = 0
    now = datetime.utcnow()
    for session in sessions:
        async with _session_lock(session.id):
            current = await repo.get_session(session.id)
            if current is None or current.status != "running":
                continue
            updated = await repo.update_session_if_status(
                session.id,
                "running",
                status="cancelled",
                ended_at=now,
                **_finalize_pause_fields(current, now),
            )
            if updated is not None:
                broadcast_session(updated)
                # Do not run trigger rules after the application session was
                # neutralized: an action must not re-energize hardware.
                await _announce_session_ended(updated, dispatch_event=False)
                ended += 1
    if ended:
        logger.info(
            "[Training] Cancelled sessions with the application session",
            app_session_id=app_session_id,
            count=ended,
        )
    return ended


# ───────── Templates, programs and analytics ─────────


def serialize_template(template: EdgingTemplate) -> dict:
    return {
        "id": template.id,
        "name": template.name,
        "goals": [dict(goal) for goal in template.goals or []],
        "auto_stop_on_goal": template.auto_stop_on_goal,
        "mode": template.mode or "manual",
        "created_by": template.created_by,
        "created_at": to_utc_iso(template.created_at),
    }


def _validate_program_steps(steps: list[dict]) -> list[dict]:
    if not steps:
        raise ValueError("A program needs at least one step")
    normalized: list[dict] = []
    for step in steps:
        name = str(step.get("name", "")).strip()
        if not name:
            raise ValueError("Every program step needs a name")
        goals = _validate_goals(list(step.get("goals") or []))
        if not goals:
            raise ValueError("Every program step needs at least one goal")
        normalized.append(
            {
                "name": name,
                "goals": goals,
                "auto_stop_on_goal": bool(step.get("auto_stop_on_goal", False)),
            }
        )
    return normalized


def serialize_program(
    program: EdgingProgram, sessions: list[EdgingSession]
) -> dict:
    steps = list(program.steps or [])
    completed = {
        session.program_step
        for session in sessions
        if session.program_id == program.id
        and session.program_step is not None
        and session.status == "succeeded"
    }
    next_step = next(
        (index for index in range(len(steps)) if index not in completed),
        None,
    )
    return {
        "id": program.id,
        "name": program.name,
        "description": program.description,
        "steps": [
            {
                "name": step.get("name", ""),
                "goals": [dict(goal) for goal in step.get("goals", [])],
                "auto_stop_on_goal": bool(step.get("auto_stop_on_goal", False)),
            }
            for step in steps
        ],
        "created_by": program.created_by,
        "created_at": to_utc_iso(program.created_at),
        "completed_steps": len(completed),
        "completed_step_indices": sorted(completed),
        "step_count": len(steps),
        "next_step": next_step,
    }


async def list_templates(
    training_repo: Optional[TrainingRepo] = None,
) -> list[dict]:
    repo = training_repo or TrainingRepo()
    return [serialize_template(template) for template in await repo.list_templates()]


async def save_template(
    *,
    template_id: str | None,
    name: str,
    goals: list[dict],
    auto_stop_on_goal: bool,
    created_by: str,
    mode: str | None = None,
    training_repo: Optional[TrainingRepo] = None,
) -> dict:
    repo = training_repo or TrainingRepo()
    normalized_goals = _validate_goals(goals)
    normalized_mode = mode or "manual"
    if normalized_mode not in {"manual", "guided"}:
        raise ValueError("Mode must be 'manual' or 'guided'")
    if template_id is None:
        template = await repo.create_template(
            name=name,
            goals=normalized_goals,
            auto_stop_on_goal=auto_stop_on_goal,
            created_by=created_by,
            mode=normalized_mode,
        )
    else:
        template = await repo.update_template(
            template_id,
            name=name,
            goals=normalized_goals,
            auto_stop_on_goal=auto_stop_on_goal,
            mode=normalized_mode,
        )
        if template is None:
            raise ValueError("Template not found")
    return serialize_template(template)


async def delete_template(
    template_id: str, training_repo: Optional[TrainingRepo] = None
) -> bool:
    repo = training_repo or TrainingRepo()
    if not await repo.delete_template(template_id):
        raise ValueError("Template not found")
    return True


async def list_programs(
    training_repo: Optional[TrainingRepo] = None,
    edging_repo: Optional[EdgingRepo] = None,
) -> list[dict]:
    repo = training_repo or TrainingRepo()
    sessions = await (edging_repo or EdgingRepo()).list_sessions(limit=1000)
    return [
        serialize_program(program, sessions)
        for program in await repo.list_programs()
    ]


async def save_program(
    *,
    program_id: str | None,
    name: str,
    description: str | None,
    steps: list[dict],
    created_by: str,
    training_repo: Optional[TrainingRepo] = None,
    edging_repo: Optional[EdgingRepo] = None,
) -> dict:
    repo = training_repo or TrainingRepo()
    normalized_steps = _validate_program_steps(steps)
    if program_id is None:
        program = await repo.create_program(
            name=name,
            description=description,
            steps=normalized_steps,
            created_by=created_by,
        )
    else:
        program = await repo.update_program(
            program_id,
            name=name,
            description=description,
            steps=normalized_steps,
        )
        if program is None:
            raise ValueError("Program not found")
    sessions = await (edging_repo or EdgingRepo()).list_sessions(limit=1000)
    return serialize_program(program, sessions)


async def delete_program(
    program_id: str, training_repo: Optional[TrainingRepo] = None
) -> bool:
    repo = training_repo or TrainingRepo()
    if not await repo.delete_program(program_id):
        raise ValueError("Program not found")
    return True


async def start_program(
    program_id: str,
    *,
    created_by: str,
    is_host: bool,
    app_session_id: str | None = None,
    training_repo: Optional[TrainingRepo] = None,
    edging_repo: Optional[EdgingRepo] = None,
) -> dict:
    repo = training_repo or TrainingRepo()
    edging = edging_repo or EdgingRepo()
    program = await repo.get_program(program_id)
    if program is None:
        raise ValueError("Program not found")

    sessions = await edging.list_sessions(limit=1000)
    completed = {
        session.program_step
        for session in sessions
        if session.program_id == program.id
        and session.program_step is not None
        and session.status == "succeeded"
    }
    step_index = next(
        (
            index
            for index in range(len(program.steps or []))
            if index not in completed
        ),
        None,
    )
    if step_index is None:
        raise ValueError("Program complete — every step is succeeded")
    step = program.steps[step_index]
    name = f"{program.name}: {step.get('name', f'Step {step_index + 1}')}"[:120]

    return await create_edging_session(
        name=name,
        goals=list(step.get("goals") or []),
        auto_stop_on_goal=bool(step.get("auto_stop_on_goal", False)),
        is_host=is_host,
        created_by=created_by,
        app_session_id=app_session_id,
        program_id=program.id,
        program_step=step_index,
        mode="manual",
        repo=edging,
    )


def _interval_bucket(seconds: int) -> str:
    if seconds < 30:
        return "<30s"
    if seconds < 60:
        return "30-60s"
    if seconds < 120:
        return "1-2m"
    if seconds < 300:
        return "2-5m"
    if seconds < 600:
        return "5-10m"
    return "10m+"


_INTERVAL_BUCKET_ORDER = ["<30s", "30-60s", "1-2m", "2-5m", "5-10m", "10m+"]


def _streak_stats(days: set[date]) -> tuple[int, int]:
    if not days:
        return 0, 0
    ordered = sorted(days)
    best = 1
    current = 1
    for previous, day in zip(ordered, ordered[1:]):
        if (day - previous).days == 1:
            current += 1
            best = max(best, current)
        else:
            current = 1

    anchor = datetime.utcnow().date()
    if anchor not in days:
        anchor -= timedelta(days=1)
    current_streak = 0
    while anchor in days:
        current_streak += 1
        anchor -= timedelta(days=1)
    return current_streak, best


async def get_analytics(
    *,
    viewer_id: str | None = None,
    is_host: bool = False,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    repo = repo or EdgingRepo()
    sessions = [
        session
        for session in await repo.list_sessions(limit=1000)
        if can_access_session(session, viewer_id, is_host)
    ]
    ended = [s for s in sessions if s.status in _ENDED_STATUSES]

    trend_sessions = sorted(
        ended,
        key=lambda s: s.ended_at or s.started_at or s.created_at,
    )[-50:]
    trend = [
        {
            "session_id": session.id,
            "name": session.name,
            "status": session.status,
            "ended_at": to_utc_iso(
                session.ended_at or session.started_at or session.created_at
            ),
            "duration_seconds": session_elapsed_seconds(session),
            "edges": success_edge_count(session),
            "edges_per_minute": _session_pace(session),
            "rating": session.rating,
        }
        for session in trend_sessions
    ]

    today = datetime.utcnow().date()
    daily_map: dict[date, dict] = {}
    for session in ended:
        moment = session.ended_at or session.started_at or session.created_at
        day = moment.date()
        if day < today - timedelta(days=29):
            continue
        entry = daily_map.setdefault(
            day, {"sessions": 0, "edges": 0, "duration_seconds": 0}
        )
        entry["sessions"] += 1
        entry["edges"] += success_edge_count(session)
        entry["duration_seconds"] += session_elapsed_seconds(session) or 0

    daily = []
    for offset in range(29, -1, -1):
        day = today - timedelta(days=offset)
        entry = daily_map.get(
            day, {"sessions": 0, "edges": 0, "duration_seconds": 0}
        )
        daily.append({"date": day.isoformat(), **entry})

    interval_counts: Counter[str] = Counter()
    for session in sessions:
        for edge in session.edges:
            if edge.interval_seconds is not None:
                interval_counts[_interval_bucket(edge.interval_seconds)] += 1
    interval_buckets = [
        {"label": label, "count": interval_counts.get(label, 0)}
        for label in _INTERVAL_BUCKET_ORDER
    ]

    durations = [
        duration
        for session in ended
        if (duration := session_elapsed_seconds(session)) is not None
    ]
    edge_counts = [success_edge_count(session) for session in ended]
    paces = [
        pace for session in ended if (pace := _session_pace(session)) is not None
    ]
    ratings = [session.rating for session in ended if session.rating is not None]
    days = {
        (session.ended_at or session.started_at or session.created_at).date()
        for session in ended
    }
    current_streak, best_streak = _streak_stats(days)

    return {
        "overview": compute_overview_stats(sessions),
        "trend": trend,
        "daily": daily,
        "interval_buckets": interval_buckets,
        "records": {
            "longest_duration_seconds": max(durations) if durations else None,
            "most_edges": max(edge_counts) if edge_counts else None,
            "best_edges_per_minute": max(paces) if paces else None,
            "best_rating": max(ratings) if ratings else None,
            "current_streak_days": current_streak,
            "best_streak_days": best_streak,
        },
    }
