"""
Trigger-rule action handlers for the Training integration.

These handlers let a rule drive the edging module (start/pause/resume/end,
advance a program, record an edge or stop-and-neutralize). They run inside the
action queue, so they act as the ``system`` actor and target the running
session unless the payload names one explicitly.

Every training event emitted while a handler runs is tagged as an echo of the
training integration (see ``services.training.training_action_event_context``),
so the dispatcher skips re-entrant training actions instead of looping on
``training_session_started`` / ``training_edge_recorded``.
"""

from __future__ import annotations

import structlog

from database.models import EdgingSession
from database.repositories.edging_repo import EdgingRepo
from database.repositories.training_repo import TrainingRepo
from events.enums import ActionType
from events.models import QueueItem
from typings import EdgeDifficulty, EdgeOutcome

logger = structlog.get_logger("pes")

_SYSTEM_ACTOR = "system"
_END_STATUSES = {"succeeded", "cancelled", "failed"}


class TrainingActionHandler:
    """Run the TRAINING_* actions through the normal training service."""

    async def apply(self, item: QueueItem) -> dict | None:
        # Imported lazily: the integrations package is built before the
        # training services (and their API/store dependencies) are ready.
        from services.training import training_action_event_context

        payload = item.payload if isinstance(item.payload, dict) else {}
        try:
            with training_action_event_context(item.causation_depth):
                await self._dispatch(item, payload)
        except ValueError as err:
            # Bad payload / session state is a rule configuration issue, not
            # a queue failure: log it and keep the rest of the chain running.
            logger.warning(
                f"[Training] Action '{item.action_type.value}' skipped: {err}",
                action_type=item.action_type.value,
                origin=item.origin,
            )
        return None

    async def reverse(self, item: QueueItem) -> None:
        """Training actions are one-shot state transitions (not reversible)."""
        return

    async def _dispatch(self, item: QueueItem, payload: dict) -> None:
        action = item.action_type
        if action == ActionType.TRAINING_START:
            await self._start(payload)
        elif action == ActionType.TRAINING_PAUSE:
            await self._pause(payload)
        elif action == ActionType.TRAINING_RESUME:
            await self._resume(payload)
        elif action == ActionType.TRAINING_END:
            await self._end(payload)
        elif action == ActionType.TRAINING_NEXT_PROGRAM_STEP:
            await self._next_program_step(payload)
        elif action == ActionType.TRAINING_RECORD_EDGE:
            await self._record_edge(item, payload)
        elif action == ActionType.TRAINING_STOP_AND_NEUTRALIZE:
            await self._stop_and_neutralize(payload)
        else:
            logger.warning(
                f"[Training] Unknown action '{action.value}'",
                origin=item.origin,
            )

    # ───────── Actions ─────────

    async def _start(self, payload: dict) -> None:
        """Create and immediately start a session from a template or program."""
        from services.training import create_edging_session, start_program

        template_id = str(payload.get("template_id") or "").strip()
        program_id = str(payload.get("program_id") or "").strip()
        if bool(template_id) == bool(program_id):
            raise ValueError(
                "TRAINING_START needs exactly one of template_id or program_id"
            )
        await self._ensure_no_running_session()

        app_session_id = self._active_app_session_id()
        if program_id:
            created = await start_program(
                program_id,
                created_by=_SYSTEM_ACTOR,
                is_host=True,
                app_session_id=app_session_id,
            )
        else:
            template = await TrainingRepo().get_template(template_id)
            if template is None:
                raise ValueError("Training template not found")
            created = await create_edging_session(
                name=str(template.name)[:120],
                goals=list(template.goals or []),
                auto_stop_on_goal=bool(template.auto_stop_on_goal),
                is_host=True,
                created_by=_SYSTEM_ACTOR,
                app_session_id=app_session_id,
                mode=template.mode or "manual",
            )

        await self._start_created_session(created)
        logger.info(
            "[Training] Action started a session",
            session_id=created["id"],
            template_id=template_id or None,
            program_id=program_id or None,
        )

    async def _pause(self, payload: dict) -> None:
        from services.training import pause_edging_session

        session = await self._require_running_session(payload)
        await pause_edging_session(session.id, is_host=True)

    async def _resume(self, payload: dict) -> None:
        from services.training import resume_edging_session

        session = await self._require_running_session(payload)
        await resume_edging_session(session.id, is_host=True)

    async def _end(self, payload: dict) -> None:
        from services.training import end_edging_session

        status = str(payload.get("status") or "cancelled").strip().lower()
        if status not in _END_STATUSES:
            raise ValueError(
                f"TRAINING_END status must be one of {sorted(_END_STATUSES)}"
            )
        session = await self._require_running_session(payload)
        await end_edging_session(session.id, status=status, is_host=True)

    async def _next_program_step(self, payload: dict) -> None:
        """Create and start the next uncompleted step of a program."""
        from services.training import start_program

        program_id = str(payload.get("program_id") or "").strip()
        if not program_id:
            raise ValueError("TRAINING_NEXT_PROGRAM_STEP needs a program_id")
        await self._ensure_no_running_session()

        app_session_id = self._active_app_session_id()
        created = await start_program(
            program_id,
            created_by=_SYSTEM_ACTOR,
            is_host=True,
            app_session_id=app_session_id,
        )
        await self._start_created_session(created)
        logger.info(
            "[Training] Action started the next program step",
            session_id=created["id"],
            program_id=program_id,
        )

    async def _record_edge(self, item: QueueItem, payload: dict) -> None:
        """Record a system edge on the running session.

        Reserved for system automation: the action is deliberately ignored
        when the triggering event already comes from the training module
        (manual edge, goal, pause, ...), which is the shortest feedback loop.
        """
        from services.training import record_edging_edge

        if item.origin.startswith("training:"):
            logger.warning(
                "[Training] TRAINING_RECORD_EDGE ignored on a training event",
                origin=item.origin,
            )
            return

        session = await self._require_running_session(payload)
        difficulty = str(payload.get("difficulty") or EdgeDifficulty.NORMAL.value)
        outcome = str(payload.get("outcome") or EdgeOutcome.SUCCESS.value)
        note = str(payload.get("note") or "").strip() or None
        await record_edging_edge(
            session.id,
            difficulty=difficulty,
            outcome=outcome,
            recorded_by=_SYSTEM_ACTOR,
            source="system",
            note=note,
            is_host=True,
        )
        logger.info(
            "[Training] Action recorded a system edge",
            session_id=session.id,
            difficulty=difficulty,
            outcome=outcome,
        )

    async def _stop_and_neutralize(self, payload: dict) -> None:
        """Fail the running session (if any), then neutralize every output."""
        from services.neutralize import neutralize_all
        from services.training import end_edging_session

        session: EdgingSession | None = None
        try:
            session = await self._find_running_session(payload)
        except ValueError as err:
            # A stale/ended session id must never prevent the safety stop.
            logger.warning(
                "[Training] No session to fail before neutralize",
                error=str(err),
            )

        if session is not None:
            try:
                await end_edging_session(session.id, status="failed", is_host=True)
            except ValueError as err:
                # The session may have ended between the lookup and the update.
                logger.warning(
                    "[Training] Could not fail the session before neutralize",
                    session_id=session.id,
                    error=str(err),
                )

        await neutralize_all(
            reason=f"training:stop_and_neutralize:{session.id if session else 'none'}"
        )
        logger.info(
            "[Training] Action stopped the session and neutralized the hardware",
            session_id=session.id if session else None,
        )

    # ───────── Helpers ─────────

    async def _start_created_session(self, created: dict) -> None:
        """Start a freshly configured session, cleaning up if it cannot run.

        Starting is only allowed when no other session is live. The check is
        repeated by ``start_edging_session`` under its start lock; if that
        race is lost, the configured session we just created is deleted
        instead of being left orphaned in the history.
        """
        from services.training import delete_edging_session, start_edging_session

        try:
            await self._ensure_no_running_session()
            await start_edging_session(
                created["id"],
                is_host=True,
                app_session_id=self._active_app_session_id(),
            )
        except ValueError:
            try:
                await delete_edging_session(created["id"], is_host=True)
            except ValueError:
                pass
            raise

    @staticmethod
    async def _ensure_no_running_session() -> None:
        if await EdgingRepo().get_running_session(load_edges=False) is not None:
            raise ValueError("A training session is already running")

    @staticmethod
    def _active_app_session_id() -> str | None:
        from store import Store

        session = Store().get_active_session()
        return session["id"] if session else None

    async def _require_running_session(self, payload: dict) -> EdgingSession:
        session = await self._find_running_session(payload)
        if session is None:
            raise ValueError("No running training session")
        return session

    async def _find_running_session(self, payload: dict) -> EdgingSession | None:
        repo = EdgingRepo()
        session_id = str(payload.get("session_id") or "").strip()
        if session_id:
            session = await repo.get_session(session_id)
            if session is None:
                raise ValueError("Training session not found")
            if session.status != "running":
                raise ValueError(f"Session is {session.status}, not running")
            return session
        return await repo.get_running_session()
