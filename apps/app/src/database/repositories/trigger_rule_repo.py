from __future__ import annotations
import json
from typing import List, Optional
from cuid2 import cuid_wrapper
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from database.connection import Database
from database.models import TriggerRule, TriggerAction
from events.enums import ActionType

generate_id = cuid_wrapper()

class TriggerRuleRepo:
    """
    Repository for TriggerRule and TriggerAction CRUD operations using SQLAlchemy.
    """

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    # ───────── TriggerRule CRUD ─────────

    async def get_all_rules(self, event_type: Optional[str] = None) -> List[TriggerRule]:
        """Get all rules, optionally filtered by event_type."""
        async with self._db.session_maker() as session:
            stmt = select(TriggerRule).options(selectinload(TriggerRule.actions))
            if event_type:
                stmt = stmt.where(TriggerRule.event_type == event_type).order_by(TriggerRule.priority.desc())
            else:
                stmt = stmt.order_by(TriggerRule.event_type, TriggerRule.priority.desc())
            
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_enabled_rules(self, event_type: str) -> List[TriggerRule]:
        """Get only enabled rules for an event type, with their actions."""
        async with self._db.session_maker() as session:
            stmt = (
                select(TriggerRule)
                .options(selectinload(TriggerRule.actions))
                .where(TriggerRule.event_type == event_type)
                .where(TriggerRule.enabled == True)
                .order_by(TriggerRule.priority.desc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_rule(self, rule_id: str) -> Optional[TriggerRule]:
        """Get a single rule by ID with its actions."""
        async with self._db.session_maker() as session:
            stmt = select(TriggerRule).options(selectinload(TriggerRule.actions)).where(TriggerRule.id == rule_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def create_rule(
        self,
        event_type: str,
        name: str,
        description: Optional[str] = None,
        enabled: bool = True,
        priority: int = 0,
    ) -> TriggerRule:
        """Create a new trigger rule."""
        rule = TriggerRule(
            id=generate_id(),
            event_type=event_type,
            name=name,
            description=description,
            enabled=enabled,
            priority=priority,
        )
        async with self._db.session_maker() as session:
            session.add(rule)
            await session.commit()
            await session.refresh(rule)
            return rule

    async def update_rule(
        self,
        rule_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        enabled: Optional[bool] = None,
        priority: Optional[int] = None,
        event_type: Optional[str] = None,
    ) -> Optional[TriggerRule]:
        """Update a trigger rule. Only provided fields are updated."""
        async with self._db.session_maker() as session:
            rule = await session.get(TriggerRule, rule_id)
            if not rule:
                return None
            
            if name is not None: rule.name = name
            if description is not None: rule.description = description
            if enabled is not None: rule.enabled = enabled
            if priority is not None: rule.priority = priority
            if event_type is not None: rule.event_type = event_type
            
            await session.commit()
            await session.refresh(rule)
            # Fetch with actions for consistency
            return await self.get_rule(rule_id)

    async def toggle_rule(self, rule_id: str, enabled: bool) -> Optional[TriggerRule]:
        """Toggle enabled state of a rule."""
        return await self.update_rule(rule_id, enabled=enabled)

    async def delete_rule(self, rule_id: str) -> bool:
        """Delete a rule and its actions (CASCADE due to models config)."""
        async with self._db.session_maker() as session:
            stmt = delete(TriggerRule).where(TriggerRule.id == rule_id)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount > 0

    # ───────── TriggerAction CRUD ─────────

    async def get_actions_for_rule(self, rule_id: str) -> List[TriggerAction]:
        """Get all actions for a rule, sorted by sort_order."""
        async with self._db.session_maker() as session:
            stmt = (
                select(TriggerAction)
                .where(TriggerAction.trigger_rule_id == rule_id)
                .order_by(TriggerAction.sort_order.asc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def create_action(
        self,
        trigger_rule_id: str,
        action_type: str,
        payload: dict,
        duration: int = -1,
        cumulative: bool = False,
        sort_order: int = 0,
    ) -> TriggerAction:
        """Create a new action in a rule."""
        action = TriggerAction(
            id=generate_id(),
            trigger_rule_id=trigger_rule_id,
            action_type=ActionType(action_type),
            payload=payload,
            duration=duration,
            cumulative=cumulative,
            sort_order=sort_order,
        )
        async with self._db.session_maker() as session:
            session.add(action)
            await session.commit()
            await session.refresh(action)
            return action

    async def update_action(
        self,
        action_id: str,
        action_type: Optional[str] = None,
        payload: Optional[dict] = None,
        duration: Optional[int] = None,
        cumulative: Optional[bool] = None,
        sort_order: Optional[int] = None,
    ) -> Optional[TriggerAction]:
        """Update a trigger action."""
        async with self._db.session_maker() as session:
            action = await session.get(TriggerAction, action_id)
            if not action:
                return None
            
            if action_type is not None: action.action_type = ActionType(action_type)
            if payload is not None: action.payload = payload
            if duration is not None: action.duration = duration
            if cumulative is not None: action.cumulative = cumulative
            if sort_order is not None: action.sort_order = sort_order
            
            await session.commit()
            await session.refresh(action)
            return action

    async def delete_action(self, action_id: str) -> bool:
        """Delete a single action."""
        async with self._db.session_maker() as session:
            stmt = delete(TriggerAction).where(TriggerAction.id == action_id)
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount > 0
