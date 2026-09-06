"""
Domain logic for edging training sessions: serialization to the WS wire
shape, goal evaluation, stats (overview + per-session comparisons) and
WebSocket broadcasts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from api.ws.websocket_notifier import ws_notifier
from database.models import EdgingEdge, EdgingSession
from database.repositories.edging_repo import EdgingRepo
from typings import EdgeOutcome, EdgingGoalType
from utils import to_utc_iso

SUCCESS_EDGE_OUTCOME = EdgeOutcome.SUCCESS.value


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


def serialize_session(session: EdgingSession, now: Optional[datetime] = None) -> dict:
    return {
        "id": session.id,
        "name": session.name,
        "goals": [dict(g) for g in session.goals],
        "auto_stop_on_goal": session.auto_stop_on_goal,
        "initiator": session.initiator,
        "initiator_user_id": session.initiator_user_id,
        "created_by": session.created_by,
        "status": session.status,
        "rating": session.rating,
        "notes": session.notes,
        "created_at": to_utc_iso(session.created_at),
        "started_at": to_utc_iso(session.started_at),
        "ended_at": to_utc_iso(session.ended_at),
        "edge_count": success_edge_count(session),
        "duration_seconds": session_elapsed_seconds(session, now),
        "goals_met": goals_met(session, now),
    }


# ───────── Stats ─────────

_ENDED_STATUSES = {"succeeded", "failed", "cancelled"}


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
    ws_notifier.notify("training:session", serialize_session(session))


def broadcast_session_deleted(session_id: str) -> None:
    ws_notifier.notify("training:session_deleted", {"id": session_id})


def broadcast_edge(edge: EdgingEdge) -> None:
    ws_notifier.notify("training:edge", serialize_edge(edge))


async def get_live_snapshot(repo: Optional[EdgingRepo] = None) -> dict:
    """Current live session + its edges, for the WS init sequence."""
    repo = repo or EdgingRepo()
    session = await repo.get_running_session()
    if session is None:
        return {"session": None, "edges": []}
    return {
        "session": serialize_session(session),
        "edges": [serialize_edge(e) for e in session.edges],
    }
