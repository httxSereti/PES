from __future__ import annotations
import json
import pathlib
import asyncio
from cuid2 import cuid_wrapper

from database.connection import Database
from database.models import TriggerRule, TriggerAction
from events.enums import ActionType
from utils import Logger

generate_id = cuid_wrapper()

async def seed_from_json(db: Database, json_path: str = "configurations/event_action.json"):
    """
    Migrates legacy event_action.json to SQLite using SQLAlchemy.
    Only seeds if the database is empty.
    """
    path = pathlib.Path(json_path)
    if not path.exists():
        Logger.warning(f"[Seed] Source file {json_path} not found. Skipping seed.")
        return

    async with db.session_maker() as session:
        # Check if already seeded
        from sqlalchemy import func, select
        result = await session.execute(select(func.count(TriggerRule.id)))
        count = result.scalar()
        if count > 0:
            Logger.info("[Seed] Database already has data. Skipping seed.")
            return

        Logger.info(f"[Seed] Migrating legacy data from {json_path}...")
        
        with open(path, "r") as f:
            data = json.load(f)

        for event_name, action_data in data.items():
            # Legacy format is a flat dict: "event_name": { "type": "...", ... }
            if not isinstance(action_data, dict):
                continue

            # Create a rule for each event
            rule = TriggerRule(
                id=generate_id(),
                event_type=event_name,
                name=f"Legacy {event_name}",
                description="Imported from event_action.json",
                enabled=True,
                priority=0
            )
            session.add(rule)
            
            # Map legacy fields to new Action types
            legacy_type = action_data.get("type")
            new_type: ActionType | None = None
            payload: dict = {}

            if legacy_type == "lvl":
                new_type = ActionType.LEVEL
                payload = {
                    "units": action_data.get("unit", ""),
                    "channels": action_data.get("dest", ""),
                    "value": str(action_data.get("level", "0"))
                }
            elif legacy_type == "pro":
                new_type = ActionType.PROFILE
                payload = {
                    "profile": action_data.get("profile", "A"),
                    "level_pct": action_data.get("level", 100)
                }
            elif legacy_type == "multi":
                new_type = ActionType.MULT
                payload = {
                    "target": action_data.get("target", "all"),
                    "pct": action_data.get("prct", 0),
                    "random": action_data.get("rnd", False)
                }

            if new_type:
                # Duration handling (string to int)
                raw_dur = action_data.get("duration", -1)
                try:
                    duration = int(raw_dur)
                except (ValueError, TypeError):
                    duration = -1

                action = TriggerAction(
                    id=generate_id(),
                    trigger_rule_id=rule.id,
                    action_type=new_type,
                    payload=payload,
                    duration=duration,
                    cumulative=False,
                    sort_order=0
                )
                session.add(action)

        await session.commit()
        Logger.info("[Seed] Migration complete.")

if __name__ == "__main__":
    db = Database()
    async def main():
        # First creation of tables for standalone run
        from database.base import Base
        async with db._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await seed_from_json(db)
    
    asyncio.run(main())
