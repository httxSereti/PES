"""
Domain logic for the application session lifecycle: start/end a session,
apply its hardware selection, and broadcast state over WebSocket.

A session wraps a PES usage period: its settings (type, name, description,
active units/sensors) are persisted so they can be reused later, and future
features (events, logger, trigger rules) can filter by session id.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import structlog

from api.ws.websocket_notifier import ws_notifier
from constants import BT_UNITS
from database.models import AppSession, EdgingSession, TriggeredEvent
from database.repositories.edging_repo import EdgingRepo
from database.repositories.session_repo import SessionRepo
from database.repositories.triggered_event_repo import TriggeredEventRepo
from events.queue import ActionQueue
from services.training import serialize_session as serialize_edging_session
from store import Store
from typings import Permission, SessionStatus, SessionType, UnitDict
from utils import to_utc_iso

logger = structlog.get_logger("pes")

store = Store()

VALID_UNIT_IDS = set(BT_UNITS)
VALID_SENSOR_IDS = {"sound", "motion1", "motion2"}


# ───────── Serialization ─────────


def serialize_session(session: AppSession) -> dict:
    return {
        "id": session.id,
        "type": session.type,
        "name": session.name,
        "description": session.description,
        "unit_ids": list(session.unit_ids),
        "sensor_ids": list(session.sensor_ids),
        "status": session.status,
        "created_by": session.created_by,
        "created_at": to_utc_iso(session.created_at),
        "started_at": to_utc_iso(session.started_at),
        "ended_at": to_utc_iso(session.ended_at),
    }


def broadcast_session(session: dict) -> None:
    ws_notifier.notify("session:update", session)


async def get_live_snapshot(repo: Optional[SessionRepo] = None) -> dict:
    """Active session (or None) for the WS init sequence."""
    repo = repo or SessionRepo()
    session = await repo.get_active_session()
    return {"session": serialize_session(session) if session else None}


# ───────── Lifecycle ─────────


def _apply_hardware_selection(unit_ids: list[str], sensor_ids: list[str]) -> None:
    """Enable the selected devices and disable every other unit/sensor."""
    for unit_str in BT_UNITS:
        store.set_hardware_enabled(unit_str, unit_str in unit_ids)
    for sensor_name in sorted(store.get_all_sensors_settings().keys()):
        store.set_hardware_enabled(sensor_name, sensor_name in sensor_ids)


async def start_session(
    *,
    session_type: str,
    name: str,
    description: Optional[str],
    unit_ids: list[str],
    sensor_ids: list[str],
    created_by: str,
    repo: Optional[SessionRepo] = None,
) -> dict:
    repo = repo or SessionRepo()

    if await repo.get_active_session() is not None:
        raise ValueError("A session is already running")

    session_type = SessionType(session_type).value
    unit_ids = list(dict.fromkeys(unit_ids))
    sensor_ids = list(dict.fromkeys(sensor_ids))

    invalid_units = set(unit_ids) - VALID_UNIT_IDS
    if invalid_units:
        raise ValueError(f"Unknown units: {', '.join(sorted(invalid_units))}")
    invalid_sensors = set(sensor_ids) - VALID_SENSOR_IDS
    if invalid_sensors:
        raise ValueError(f"Unknown sensors: {', '.join(sorted(invalid_sensors))}")

    # Snapshot current hardware flags, then apply the session selection
    store.save_hardware_snapshot()
    _apply_hardware_selection(unit_ids, sensor_ids)

    session = await repo.create_session(
        session_type=session_type,
        name=name,
        description=description,
        unit_ids=unit_ids,
        sensor_ids=sensor_ids,
        created_by=created_by,
    )
    started = await repo.update_session(session.id, started_at=datetime.utcnow())
    if started is None:
        store.restore_hardware_snapshot()
        raise ValueError("Failed to start session")

    serialized = serialize_session(started)
    store.set_active_session(serialized)
    broadcast_session(serialized)

    logger.info(
        "[Session] Started", session_id=started.id, session_type=session_type
    )
    return serialized


async def end_session(repo: Optional[SessionRepo] = None) -> Optional[dict]:
    repo = repo or SessionRepo()

    session = await repo.get_active_session()
    if session is None:
        return None

    # Full stop: cancel the action queue and zero every channel
    await ActionQueue.get_instance().cancel_all()
    for unit_str in BT_UNITS:
        unit = UnitDict(unit_str)
        store.update_unit_dict(
            unit,
            {
                "updated": True,
                "ch_A": 0,
                "ch_B": 0,
            },
        )

    # Restore hardware enable flags to their pre-session state
    store.restore_hardware_snapshot()

    ended = await repo.update_session(
        session.id,
        status=SessionStatus.ENDED.value,
        ended_at=datetime.utcnow(),
    )
    store.set_active_session(None)

    if ended is not None:
        serialized = serialize_session(ended)
        broadcast_session(serialized)
        logger.info("[Session] Ended", session_id=ended.id)
        return serialized
    return None


# ───────── History ─────────


def _period(session: AppSession) -> tuple[datetime, datetime]:
    """[start, end] window of a session (open-ended while running)."""
    start = session.started_at or session.created_at
    end = session.ended_at or datetime.utcnow()
    return start, end


def _duration_seconds(session: AppSession) -> int | None:
    if session.started_at is None:
        return None
    start, end = _period(session)
    return max(0, int((end - start).total_seconds()))


def _edging_overlaps(
    session: EdgingSession, period_start: datetime, period_end: datetime
) -> bool:
    """True when an edging session ran (or was configured) inside the window."""
    start = session.started_at or session.created_at
    end = session.ended_at or datetime.utcnow()
    return start <= period_end and end >= period_start


def serialize_event(event: TriggeredEvent) -> dict:
    """Same wire shape as the WS events history/triggered payloads."""
    return {
        "id": event.id,
        "event_type": event.event_type,
        "origin": event.origin,
        "event_data": event.event_data,
        "triggered_at": to_utc_iso(event.triggered_at),
        "triggered_rules": event.triggered_rules,
    }


def serialize_history_item(
    session: AppSession, edging_session_count: int, event_count: int
) -> dict:
    item = serialize_session(session)
    item["duration_seconds"] = _duration_seconds(session)
    item["edging_session_count"] = edging_session_count
    item["event_count"] = event_count
    return item


async def send_personal(payload_type: str, payload, client_id: str) -> None:
    """Send a server message to a single client (command replies to history)."""
    await store.websocket.send_personal_message(
        {"type": payload_type, "payload": payload}, client_id=client_id
    )


async def get_history() -> list[dict]:
    """Every application session, newest first, with quick log counts."""
    sessions = await SessionRepo().list_sessions(limit=200)
    if not sessions:
        return []

    event_counts = await TriggeredEventRepo().count_by_sessions(
        [s.id for s in sessions]
    )
    edging_sessions = await EdgingRepo().list_sessions(limit=1000)

    result = []
    for session in sessions:
        start, end = _period(session)
        edging_count = sum(
            1 for es in edging_sessions if _edging_overlaps(es, start, end)
        )
        result.append(
            serialize_history_item(
                session, edging_count, event_counts.get(session.id, 0)
            )
        )
    return result


async def get_history_detail(session_id: str, user_id: str) -> dict:
    """One application session + the edging sessions and events logged in it."""
    session = await SessionRepo().get_session(session_id)
    if session is None:
        raise ValueError("Session not found")

    start, end = _period(session)

    if store.check_permission(user_id, Permission.TRAINING_EDGING_READ):
        all_edging = await EdgingRepo().list_sessions(limit=1000)
        matching = [es for es in all_edging if _edging_overlaps(es, start, end)]
        edging_sessions = [serialize_edging_session(es) for es in matching]
    else:
        matching = []
        edging_sessions = None

    if store.check_permission(user_id, Permission.READ_EVENTS):
        events = await TriggeredEventRepo().get_by_session(session_id)
        serialized_events = [serialize_event(ev) for ev in events]
        counts = await TriggeredEventRepo().count_by_sessions([session_id])
        event_count = counts.get(session_id, len(serialized_events))
    else:
        serialized_events = None
        event_count = 0

    return {
        "session": serialize_history_item(
            session, len(matching), event_count
        ),
        "edging_sessions": edging_sessions,
        "events": serialized_events,
    }
