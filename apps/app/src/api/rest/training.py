from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.helpers import require_permission
from database.repositories.edging_repo import EdgingRepo
from services.training import (
    broadcast_edge,
    broadcast_session,
    broadcast_session_deleted,
    compute_overview_stats,
    compute_session_stats,
    goals_met,
    serialize_edge,
    serialize_session,
)
from typings import EdgeDifficulty, EdgeOutcome, EdgingGoalType, Permission

router = APIRouter(prefix="/api/training", tags=["training"])


def _repo() -> EdgingRepo:
    return EdgingRepo()


# ───────── Schemas ─────────


class GoalBody(BaseModel):
    type: str
    value: int = Field(gt=0)


class CreateSessionBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    goals: list[GoalBody] = Field(min_length=1, max_length=10)
    auto_stop_on_goal: bool = False


class UpdateSessionBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    goals: list[GoalBody] | None = None
    auto_stop_on_goal: bool | None = None
    notes: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)


class EdgeBody(BaseModel):
    difficulty: str
    outcome: str


class EndSessionBody(BaseModel):
    status: str = Field(pattern="^(succeeded|cancelled)$")


def _validate_goals(goals: list[GoalBody]) -> list[dict]:
    normalized: list[dict] = []
    for goal in goals:
        if goal.type not in {g.value for g in EdgingGoalType}:
            raise HTTPException(status_code=400, detail=f"Unknown goal type: {goal.type}")
        normalized.append({"type": goal.type, "value": goal.value})
    return normalized


def _require_ended(session_status: str) -> None:
    if session_status not in {"succeeded", "failed", "cancelled"}:
        raise HTTPException(
            status_code=409,
            detail="Only allowed once the session ended",
        )


def _store_has_permission(user_id: str, permission: Permission) -> bool:
    from store import Store

    return Store().check_permission(user_id, permission)


# ───────── Module index ─────────


@router.get("")
async def training_index(
    current_user: dict = Depends(require_permission(Permission.TRAINING_EDGING_READ)),
):
    """Stats for the whole Training module (one stats card per submodule)."""
    sessions = await _repo().list_sessions(limit=1000)
    return {
        "edging": compute_overview_stats(sessions),
        "recent_sessions": [serialize_session(s) for s in sessions[:5]],
    }


# ───────── Edging sessions ─────────


@router.get("/edging/sessions")
async def list_edging_sessions(
    current_user: dict = Depends(require_permission(Permission.TRAINING_EDGING_READ)),
):
    sessions = await _repo().list_sessions(limit=100)
    return [serialize_session(s) for s in sessions]


@router.post("/edging/sessions", status_code=201)
async def create_edging_session(
    body: CreateSessionBody,
    current_user: dict = Depends(
        require_permission(Permission.TRAINING_EDGING_MANAGE)
    ),
):
    """Create (configure) a session. Hosts create for themselves; members
    create a request the Host can start later."""
    is_host = _store_has_permission(current_user["id"], Permission.HOST)
    session = await _repo().create_session(
        name=body.name,
        goals=_validate_goals(body.goals),
        auto_stop_on_goal=body.auto_stop_on_goal,
        initiator="self" if is_host else "member",
        initiator_user_id=current_user["id"],
        created_by=current_user["id"],
    )
    broadcast_session(session)
    return serialize_session(session)


@router.get("/edging/sessions/{session_id}")
async def get_edging_session(
    session_id: str,
    current_user: dict = Depends(require_permission(Permission.TRAINING_EDGING_READ)),
):
    session = await _repo().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    all_sessions = await _repo().list_sessions(limit=1000)
    return {
        "session": serialize_session(session),
        "edges": [serialize_edge(e) for e in session.edges],
        "stats": compute_session_stats(session, all_sessions),
    }


@router.patch("/edging/sessions/{session_id}")
async def update_edging_session(
    session_id: str,
    body: UpdateSessionBody,
    current_user: dict = Depends(
        require_permission(Permission.TRAINING_EDGING_MANAGE)
    ),
):
    """Update config fields (MANAGE) or notes/rating (HOST, ended sessions only)."""
    session = await _repo().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    fields: dict = {}
    is_host = _store_has_permission(current_user["id"], Permission.HOST)

    if body.name is not None or body.goals is not None or body.auto_stop_on_goal is not None:
        if session.status != "configured":
            raise HTTPException(
                status_code=409,
                detail="Goals and auto-stop can only be changed before the session starts",
            )
        if body.name is not None:
            fields["name"] = body.name
        if body.goals is not None:
            fields["goals"] = _validate_goals(body.goals)
        if body.auto_stop_on_goal is not None:
            fields["auto_stop_on_goal"] = body.auto_stop_on_goal

    if body.notes is not None or body.rating is not None:
        if not is_host:
            raise HTTPException(status_code=403, detail="Host only: notes and rating")
        _require_ended(session.status)
        if body.notes is not None:
            fields["notes"] = body.notes
        if body.rating is not None:
            fields["rating"] = body.rating

    updated = await _repo().update_session(session_id, **fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    broadcast_session(updated)
    return serialize_session(updated)


@router.delete("/edging/sessions/{session_id}")
async def delete_edging_session(
    session_id: str,
    current_user: dict = Depends(require_permission(Permission.HOST)),
):
    if not await _repo().delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    broadcast_session_deleted(session_id)
    return {"status": "ok"}


@router.post("/edging/sessions/{session_id}/start")
async def start_edging_session(
    session_id: str,
    current_user: dict = Depends(require_permission(Permission.HOST)),
):
    session = await _repo().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "configured":
        raise HTTPException(status_code=409, detail=f"Session is {session.status}, not configured")

    if await _repo().get_running_session() is not None:
        raise HTTPException(status_code=409, detail="A session is already running")

    updated = await _repo().update_session(
        session_id, status="running", started_at=datetime.utcnow()
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    broadcast_session(updated)
    return serialize_session(updated)


@router.post("/edging/sessions/{session_id}/edges", status_code=201)
async def record_edging_edge(
    session_id: str,
    body: EdgeBody,
    current_user: dict = Depends(require_permission(Permission.HOST)),
):
    """Record an edge on the running session. A failed edge ends the session."""
    if body.difficulty not in {d.value for d in EdgeDifficulty}:
        raise HTTPException(status_code=400, detail=f"Unknown difficulty: {body.difficulty}")
    if body.outcome not in {o.value for o in EdgeOutcome}:
        raise HTTPException(status_code=400, detail=f"Unknown outcome: {body.outcome}")

    session = await _repo().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "running":
        raise HTTPException(status_code=409, detail="Session is not running")

    edge = await _repo().add_edge(
        session_id,
        difficulty=body.difficulty,
        outcome=body.outcome,
        recorded_by=current_user["id"],
    )
    if edge is None:
        raise HTTPException(status_code=404, detail="Session not found")
    broadcast_edge(edge)

    now = datetime.utcnow()
    session = await _repo().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.outcome == EdgeOutcome.FAIL.value:
        session = await _repo().update_session(session_id, status="failed", ended_at=now)
    elif goals_met(session, now) and session.auto_stop_on_goal:
        session = await _repo().update_session(session_id, status="succeeded", ended_at=now)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    broadcast_session(session)

    return {
        "edge": serialize_edge(edge),
        "session": serialize_session(session),
    }


@router.post("/edging/sessions/{session_id}/end")
async def end_edging_session(
    session_id: str,
    body: EndSessionBody,
    current_user: dict = Depends(require_permission(Permission.HOST)),
):
    """Host ends a running session: succeeded (goals must be met) or cancelled."""
    session = await _repo().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "running":
        raise HTTPException(status_code=409, detail="Session is not running")

    if body.status == "succeeded" and not goals_met(session):
        raise HTTPException(
            status_code=409,
            detail="Goals are not all reached yet — end as cancelled or keep going",
        )

    updated = await _repo().update_session(
        session_id, status=body.status, ended_at=datetime.utcnow()
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    broadcast_session(updated)
    return serialize_session(updated)


@router.get("/edging/live")
async def get_edging_live(
    current_user: dict = Depends(require_permission(Permission.TRAINING_EDGING_READ)),
):
    """The currently running session + its edges (null when none)."""
    session = await _repo().get_running_session()
    if session is None:
        return {"session": None, "edges": []}
    return {
        "session": serialize_session(session),
        "edges": [serialize_edge(e) for e in session.edges],
    }
