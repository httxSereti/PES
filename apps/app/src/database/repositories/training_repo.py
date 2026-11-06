from __future__ import annotations

from typing import List, Optional

from cuid2 import cuid_wrapper
from sqlalchemy import delete, select

from database.connection import Database
from database.models import EdgingProgram, EdgingTemplate

generate_id = cuid_wrapper()


class TrainingRepo:
    """Repository for reusable templates and multi-session programs."""

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    # ───────── Templates ─────────

    async def create_template(
        self,
        *,
        name: str,
        goals: list[dict],
        auto_stop_on_goal: bool,
        created_by: str,
        mode: str = "manual",
        guided_config: dict | None = None,
        visibility: str = "private",
        participant_ids: list[str] | None = None,
        min_edge_interval_seconds: int = 0,
        notification_level: str = "all",
        allow_partner_edges: bool = False,
    ) -> EdgingTemplate:
        template = EdgingTemplate(
            id=generate_id(),
            name=name,
            goals=goals,
            auto_stop_on_goal=auto_stop_on_goal,
            mode=mode,
            guided_config=guided_config,
            visibility=visibility,
            participant_ids=participant_ids or [],
            min_edge_interval_seconds=min_edge_interval_seconds,
            notification_level=notification_level,
            allow_partner_edges=allow_partner_edges,
            created_by=created_by,
        )
        async with self._db.session_maker() as db_session:
            db_session.add(template)
            await db_session.commit()
            await db_session.refresh(template)
            return template

    async def get_template(self, template_id: str) -> Optional[EdgingTemplate]:
        async with self._db.session_maker() as db_session:
            return await db_session.get(EdgingTemplate, template_id)

    async def list_templates(self) -> List[EdgingTemplate]:
        async with self._db.session_maker() as db_session:
            result = await db_session.execute(
                select(EdgingTemplate).order_by(EdgingTemplate.created_at.desc())
            )
            return list(result.scalars().all())

    async def update_template(
        self, template_id: str, **fields
    ) -> Optional[EdgingTemplate]:
        async with self._db.session_maker() as db_session:
            template = await db_session.get(EdgingTemplate, template_id)
            if template is None:
                return None
            for key, value in fields.items():
                setattr(template, key, value)
            await db_session.commit()
            await db_session.refresh(template)
            return template

    async def delete_template(self, template_id: str) -> bool:
        async with self._db.session_maker() as db_session:
            result = await db_session.execute(
                delete(EdgingTemplate).where(EdgingTemplate.id == template_id)
            )
            await db_session.commit()
            return result.rowcount > 0

    # ───────── Programs ─────────

    async def create_program(
        self,
        *,
        name: str,
        description: str | None,
        steps: list[dict],
        created_by: str,
        goals: list[dict] | None = None,
        reward_profile: str | None = None,
        reward_level_pct: int = 80,
    ) -> EdgingProgram:
        program = EdgingProgram(
            id=generate_id(),
            name=name,
            description=description,
            steps=steps,
            goals=goals or [],
            reward_profile=reward_profile,
            reward_level_pct=reward_level_pct,
            created_by=created_by,
        )
        async with self._db.session_maker() as db_session:
            db_session.add(program)
            await db_session.commit()
            await db_session.refresh(program)
            return program

    async def get_program(self, program_id: str) -> Optional[EdgingProgram]:
        async with self._db.session_maker() as db_session:
            return await db_session.get(EdgingProgram, program_id)

    async def list_programs(self) -> List[EdgingProgram]:
        async with self._db.session_maker() as db_session:
            result = await db_session.execute(
                select(EdgingProgram).order_by(EdgingProgram.created_at.desc())
            )
            return list(result.scalars().all())

    async def update_program(
        self, program_id: str, **fields
    ) -> Optional[EdgingProgram]:
        async with self._db.session_maker() as db_session:
            program = await db_session.get(EdgingProgram, program_id)
            if program is None:
                return None
            for key, value in fields.items():
                setattr(program, key, value)
            await db_session.commit()
            await db_session.refresh(program)
            return program

    async def delete_program(self, program_id: str) -> bool:
        async with self._db.session_maker() as db_session:
            result = await db_session.execute(
                delete(EdgingProgram).where(EdgingProgram.id == program_id)
            )
            await db_session.commit()
            return result.rowcount > 0
