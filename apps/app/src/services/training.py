"""
Domain logic for edging training sessions: serialization to the WS wire
shape, goal evaluation, stats (overview + per-session comparisons) and
WebSocket broadcasts.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Optional

import structlog

from api.ws.websocket_notifier import ws_notifier
from database.models import EdgingEdge, EdgingSession
from database.repositories.edging_repo import EdgingRepo
from typings import EdgeDifficulty, EdgeOutcome, EdgingGoalType
from utils import to_utc_iso

logger = structlog.get_logger("pes")

SUCCESS_EDGE_OUTCOME = EdgeOutcome.SUCCESS.value

# Serialize state changes per session inside this process (all WS commands and
# the auto-stop tick run on the same asyncio loop). This keeps "record edge +
# decide whether the session ends" and the timer from interleaving.
_session_locks: dict[str, asyncio.Lock] = {}
_start_lock = asyncio.Lock()


def _session_lock(session_id: str) -> asyncio.Lock:
    lock = _session_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _session_locks[session_id] = lock
    return lock


# ───────── Serialization ─────────


def session_elapsed_seconds(session: EdgingSession, now: Optional[datetime] = None) -> int | None:
    """Seconds spent in the session: started -> ended (or now while running)."""
    if session.started_at is None:
        return None
    end = session.ended_at or now or datetime.utcnow()
    return max(0, int((end - session.started_at).total_seconds()))


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
    ws_notifier.notify("training:session", serialize_session_summary(session))


def broadcast_session_deleted(session_id: str) -> None:
    ws_notifier.notify("training:session_deleted", {"id": session_id})


def broadcast_edge(edge: EdgingEdge) -> None:
    ws_notifier.notify("training:edge", serialize_edge(edge))


def broadcast_edge_deleted(edge_id: str, session_id: str) -> None:
    ws_notifier.notify(
        "training:edge_deleted", {"id": edge_id, "session_id": session_id}
    )


async def get_live_snapshot(repo: Optional[EdgingRepo] = None) -> dict:
    """Current live session + its edges, for the WS init sequence."""
    repo = repo or EdgingRepo()
    session = await repo.get_running_session()
    if session is None:
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


async def get_overview(repo: Optional[EdgingRepo] = None) -> dict:
    """Stats for the whole Training module (one stats card per submodule)."""
    repo = repo or EdgingRepo()
    sessions = await repo.list_sessions(limit=1000)
    return {
        "edging": compute_overview_stats(sessions),
        "recent_sessions": [serialize_session_summary(s) for s in sessions[:5]],
    }


async def list_edging_sessions(repo: Optional[EdgingRepo] = None) -> list[dict]:
    repo = repo or EdgingRepo()
    sessions = await repo.list_sessions(limit=100)
    return [serialize_session_summary(s) for s in sessions]


async def get_session_detail(
    session_id: str,
    *,
    include_notes: bool = True,
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

    all_sessions = await repo.list_sessions(limit=1000)
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
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Create (configure) a session. Hosts create for themselves; members
    create a request the Host can start later."""
    repo = repo or EdgingRepo()
    session = await repo.create_session(
        name=name,
        goals=_validate_goals(goals),
        auto_stop_on_goal=auto_stop_on_goal,
        initiator="self" if is_host else "member",
        initiator_user_id=created_by,
        created_by=created_by,
    )
    broadcast_session(session)
    return serialize_session(session)


async def update_edging_session(
    session_id: str,
    *,
    is_host: bool,
    name: Optional[str] = None,
    goals: Optional[list[dict]] = None,
    auto_stop_on_goal: Optional[bool] = None,
    notes: Optional[str] = None,
    rating: Optional[int] = None,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Update config fields (MANAGE) or notes/rating (HOST, ended sessions only)."""
    repo = repo or EdgingRepo()
    session = await repo.get_session(session_id)
    if session is None:
        raise ValueError("Session not found")

    fields: dict = {}

    if name is not None or goals is not None or auto_stop_on_goal is not None:
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
    session_id: str, repo: Optional[EdgingRepo] = None
) -> bool:
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        if session.status == "running":
            raise ValueError("Cannot delete a running session — end it first")
        if not await repo.delete_session(session_id):
            raise ValueError("Session not found")
        broadcast_session_deleted(session_id)
        return True


async def start_edging_session(
    session_id: str, repo: Optional[EdgingRepo] = None
) -> dict:
    repo = repo or EdgingRepo()
    async with _start_lock:
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        if session.status != "configured":
            raise ValueError(f"Session is {session.status}, not configured")

        if await repo.get_running_session() is not None:
            raise ValueError("A session is already running")

        updated = await repo.update_session_if_status(
            session_id,
            "configured",
            status="running",
            started_at=datetime.utcnow(),
        )
        if updated is None:
            raise ValueError("Session is no longer configured")
        broadcast_session(updated)
        return serialize_session(updated)


async def record_edging_edge(
    session_id: str,
    *,
    difficulty: str,
    outcome: str,
    recorded_by: str,
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
        if session.status != "running":
            raise ValueError("Session is not running")

        edge = await repo.add_edge(
            session_id,
            difficulty=difficulty,
            outcome=outcome,
            recorded_by=recorded_by,
        )
        if edge is None:
            raise ValueError("Session is not running")
        broadcast_edge(edge)

        now = datetime.utcnow()
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")

        updated = session
        if outcome == EdgeOutcome.FAIL.value:
            updated = await repo.update_session_if_status(
                session_id, "running", status="failed", ended_at=now
            )
        elif goals_met(session, now) and session.auto_stop_on_goal:
            updated = await repo.update_session_if_status(
                session_id, "running", status="succeeded", ended_at=now
            )

        if updated is None:
            # Another coroutine ended the session first; report its final state.
            updated = await repo.get_session(session_id)
        if updated is None:
            raise ValueError("Session not found")

        broadcast_session(updated)

        return {
            "edge": serialize_edge(edge),
            "session": serialize_session(updated),
        }


async def delete_edging_edge(
    session_id: str,
    *,
    edge_id: str,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Undo one edge while the session is still running."""
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        if session.status != "running":
            raise ValueError("Edges can only be undone while the session is running")
        if not await repo.delete_edge(session_id, edge_id):
            raise ValueError("Edge not found")

        broadcast_edge_deleted(edge_id, session_id)
        updated = await repo.get_session(session_id)
        if updated is None:
            raise ValueError("Session not found")
        broadcast_session(updated)
        return serialize_session(updated)


async def end_edging_session(
    session_id: str,
    *,
    status: str,
    repo: Optional[EdgingRepo] = None,
) -> dict:
    """Host ends a running session: succeeded (goals must be met) or cancelled."""
    repo = repo or EdgingRepo()
    async with _session_lock(session_id):
        session = await repo.get_session(session_id)
        if session is None:
            raise ValueError("Session not found")
        if session.status != "running":
            raise ValueError("Session is not running")

        if status == "succeeded" and not goals_met(session):
            raise ValueError(
                "Goals are not all reached yet — end as cancelled or keep going"
            )

        updated = await repo.update_session_if_status(
            session_id,
            "running",
            status=status,
            ended_at=datetime.utcnow(),
        )
        if updated is None:
            raise ValueError("Session is not running")
        broadcast_session(updated)
        return serialize_session(updated)


async def tick_running_sessions(repo: Optional[EdgingRepo] = None) -> None:
    """Auto-stop a running session once all its goals are reached.

    Called once per second by the API loop. Only sessions explicitly configured
    with ``auto_stop_on_goal`` are ended; otherwise the Host decides.
    """
    repo = repo or EdgingRepo()
    # Lightweight check first: most sessions do not auto-stop.
    session = await repo.get_running_session(load_edges=False)
    if session is None or not session.auto_stop_on_goal:
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

        updated = await repo.update_session_if_status(
            session.id,
            "running",
            status="succeeded",
            ended_at=datetime.utcnow(),
        )
        if updated is not None:
            broadcast_session(updated)
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
        )
        if updated is not None:
            broadcast_session(updated)
            recovered += 1

    if recovered:
        logger.warning(
            "[Training] Interrupted orphan session(s) at startup/shutdown",
            count=recovered,
        )
    return recovered
