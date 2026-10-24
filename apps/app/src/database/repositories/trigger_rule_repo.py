from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from cuid2 import cuid_wrapper
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database.connection import Database
from database.models import (
    TriggerAction,
    TriggerRule,
    TriggerRuleEvent,
    TriggerRuleLabel,
)
from events.enums import ActionType

generate_id = cuid_wrapper()


@dataclass(frozen=True)
class TriggerActionSpec:
    """Validated action fields for an atomic rule create/replace."""

    action_type: ActionType
    payload: dict
    duration: int = -1
    cumulative: bool = False
    sort_order: int = 0


def _build_event_links(event_types: List[str]) -> List[TriggerRuleEvent]:
    return [
        TriggerRuleEvent(event_type=event_type, sort_order=index)
        for index, event_type in enumerate(event_types)
    ]


def _build_actions(
    rule_id: str, specs: List[TriggerActionSpec]
) -> List[TriggerAction]:
    return [
        TriggerAction(
            id=generate_id(),
            trigger_rule_id=rule_id,
            action_type=spec.action_type,
            payload=spec.payload,
            duration=spec.duration,
            cumulative=spec.cumulative,
            sort_order=spec.sort_order,
        )
        for spec in specs
    ]


def unique_event_types(event_types: List[str]) -> List[str]:
    """Trim, drop blanks and de-duplicate while preserving selection order."""
    seen: set[str] = set()
    ordered: List[str] = []
    for raw in event_types:
        event_type = raw.strip()
        if event_type and event_type not in seen:
            seen.add(event_type)
            ordered.append(event_type)
    return ordered


def rule_event_types(rule: TriggerRule) -> List[str]:
    """Event types of a rule, with a fallback for pre-multi-event rows."""
    linked = sorted(rule.event_links, key=lambda link: link.sort_order)
    types = [link.event_type for link in linked]
    return types or ([rule.event_type] if rule.event_type else [])


def _matches_event(event_type: str):
    """A rule matches through its links, or its legacy column when unlinked."""
    return or_(
        TriggerRule.event_links.any(TriggerRuleEvent.event_type == event_type),
        and_(
            ~TriggerRule.event_links.any(),
            TriggerRule.event_type == event_type,
        ),
    )


class TriggerRuleRepo:
    """
    Repository for TriggerRule and TriggerAction CRUD operations using SQLAlchemy.
    """

    def __init__(self, db: Database | None = None):
        self._db = db or Database.get_instance()

    # ───────── TriggerRule CRUD ─────────

    async def get_all_rules(
        self, event_type: Optional[str] = None
    ) -> List[TriggerRule]:
        """Get all rules, optionally filtered by event_type."""
        async with self._db.session_maker() as session:
            stmt = select(TriggerRule).options(
                selectinload(TriggerRule.actions),
                selectinload(TriggerRule.labels),
                selectinload(TriggerRule.event_links),
            )
            if event_type:
                stmt = stmt.where(_matches_event(event_type)).order_by(
                    TriggerRule.priority.desc()
                )
            else:
                stmt = stmt.order_by(
                    TriggerRule.event_type, TriggerRule.priority.desc()
                )

            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_enabled_rules(self, event_type: str) -> List[TriggerRule]:
        """Get only enabled rules for an event type, with their actions."""
        async with self._db.session_maker() as session:
            stmt = (
                select(TriggerRule)
                .options(
                    selectinload(TriggerRule.actions),
                    selectinload(TriggerRule.labels),
                    selectinload(TriggerRule.event_links),
                )
                .where(_matches_event(event_type))
                .where(TriggerRule.enabled)
                .order_by(TriggerRule.priority.desc())
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_rule(self, rule_id: str) -> Optional[TriggerRule]:
        """Get a single rule by ID with its actions."""
        async with self._db.session_maker() as session:
            stmt = (
                select(TriggerRule)
                .options(
                    selectinload(TriggerRule.actions),
                    selectinload(TriggerRule.labels),
                    selectinload(TriggerRule.event_links),
                )
                .where(TriggerRule.id == rule_id)
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def find_profile_references(
        self, profile_name: str
    ) -> List[TriggerRule]:
        """
        Rules holding a PROFILE action targeting `profile_name`.

        Guards profile renames/deletes so trigger rules don't end up
        pointing at a profile that no longer exists.
        """
        rules = await self.get_all_rules()
        return [
            rule
            for rule in rules
            if any(
                action.action_type == ActionType.PROFILE
                and isinstance(action.payload, dict)
                and action.payload.get("profile") == profile_name
                for action in rule.actions
            )
        ]

    async def create_rule(
        self,
        event_types: List[str],
        name: str,
        description: Optional[str] = None,
        enabled: bool = True,
        priority: int = 0,
    ) -> TriggerRule:
        """Create a new trigger rule bound to one or more event types."""
        types = unique_event_types(event_types)
        if not types:
            raise ValueError("A trigger rule needs at least one event type")

        rule = TriggerRule(
            id=generate_id(),
            event_type=types[0],
            name=name,
            description=description,
            enabled=enabled,
            priority=priority,
            event_links=[
                TriggerRuleEvent(event_type=event_type, sort_order=index)
                for index, event_type in enumerate(types)
            ],
        )
        async with self._db.session_maker() as session:
            session.add(rule)
            await session.commit()
            await session.refresh(rule)
            return rule

    async def create_rule_with_actions(
        self,
        *,
        event_types: List[str],
        name: str,
        description: Optional[str],
        enabled: bool,
        priority: int,
        actions: List[TriggerActionSpec],
        labels: List[str],
    ) -> tuple[TriggerRule, List[TriggerRuleLabel]]:
        """
        Create a rule, its actions and its labels in one transaction.

        Either every row is written or none is, so a failed action or label
        write can no longer leave a half-built rule behind.
        """
        types = unique_event_types(event_types)
        if not types:
            raise ValueError("A trigger rule needs at least one event type")

        rule_id = generate_id()
        async with self._db.session_maker() as session:
            rule = TriggerRule(
                id=rule_id,
                event_type=types[0],
                name=name,
                description=description,
                enabled=enabled,
                priority=priority,
                event_links=_build_event_links(types),
                actions=_build_actions(rule_id, actions),
            )
            resolved_labels, created_labels = await self._resolve_labels(
                session, labels
            )
            rule.labels = resolved_labels
            session.add(rule)
            await session.commit()

        full_rule = await self.get_rule(rule_id)
        if full_rule is None:
            raise RuntimeError(f"TriggerRule '{rule_id}' not found after create")
        return full_rule, created_labels

    async def update_rule(
        self,
        rule_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        enabled: Optional[bool] = None,
        priority: Optional[int] = None,
        event_types: Optional[List[str]] = None,
    ) -> Optional[TriggerRule]:
        """Update a trigger rule. Only provided fields are updated."""
        types = unique_event_types(event_types) if event_types is not None else None
        if types is not None and not types:
            raise ValueError("A trigger rule needs at least one event type")

        async with self._db.session_maker() as session:
            rule = await session.get(
                TriggerRule,
                rule_id,
                options=[selectinload(TriggerRule.event_links)],
            )
            if not rule:
                return None

            if name is not None:
                rule.name = name
            if description is not None:
                rule.description = description
            if enabled is not None:
                rule.enabled = enabled
            if priority is not None:
                rule.priority = priority
            if types is not None:
                rule.event_type = types[0]
                # Delete the old links before inserting the new ones: their
                # primary key is (trigger_rule_id, event_type), so re-selecting
                # the same event type would otherwise collide mid-flush.
                rule.event_links.clear()
                await session.flush()
                rule.event_links = _build_event_links(types)

            await session.commit()
            await session.refresh(rule)
            # Fetch with actions for consistency
            return await self.get_rule(rule_id)

    async def replace_rule_with_actions(
        self,
        *,
        rule_id: str,
        event_types: List[str],
        name: str,
        description: Optional[str],
        enabled: bool,
        priority: int,
        actions: List[TriggerActionSpec],
        labels: List[str],
    ) -> tuple[Optional[TriggerRule], List[TriggerRuleLabel]]:
        """
        Update a rule and fully replace its actions/labels in one transaction.

        Existing actions and event links are flushed as deleted before the new
        rows are inserted, so re-selecting an event type cannot collide on the
        composite primary key. Returns ``(None, [])`` when the rule is missing.
        """
        types = unique_event_types(event_types)
        if not types:
            raise ValueError("A trigger rule needs at least one event type")

        async with self._db.session_maker() as session:
            rule = await session.get(
                TriggerRule,
                rule_id,
                options=[
                    selectinload(TriggerRule.actions),
                    selectinload(TriggerRule.event_links),
                    selectinload(TriggerRule.labels),
                ],
            )
            if not rule:
                return None, []

            rule.name = name
            rule.description = description
            rule.enabled = enabled
            rule.priority = priority
            rule.event_type = types[0]

            # Flush the deletes first so the inserts below cannot race the
            # old rows (event links share their primary key with the new ones).
            rule.actions.clear()
            rule.event_links.clear()
            await session.flush()

            rule.event_links = _build_event_links(types)
            rule.actions = _build_actions(rule_id, actions)

            resolved_labels, created_labels = await self._resolve_labels(
                session, labels
            )
            rule.labels = resolved_labels

            await session.commit()

        full_rule = await self.get_rule(rule_id)
        return full_rule, created_labels

    async def toggle_rule(self, rule_id: str, enabled: bool) -> Optional[TriggerRule]:
        """Toggle enabled state of a rule."""
        return await self.update_rule(rule_id, enabled=enabled)

    async def delete_rule(self, rule_id: str) -> bool:
        """Delete a rule and its actions/labels/event links."""
        async with self._db.session_maker() as session:
            rule = await session.get(TriggerRule, rule_id)
            if not rule:
                return False
            await session.delete(rule)
            await session.commit()
            return True

    # ───────── TriggerAction CRUD ─────────

    async def get_actions_for_rule(self, rule_id: str) -> List[TriggerAction]:
        """Get all actions for a rule, sorted by sort_order."""
        async with self._db.session_maker() as session:
            stmt = (
                select(TriggerAction)
                .where(TriggerAction.trigger_rule_id == rule_id)
                .order_by(
                    TriggerAction.sort_order.asc(),
                    TriggerAction.created_at.asc(),
                    TriggerAction.id.asc(),
                )
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

            if action_type is not None:
                action.action_type = ActionType(action_type)
            if payload is not None:
                action.payload = payload
            if duration is not None:
                action.duration = duration
            if cumulative is not None:
                action.cumulative = cumulative
            if sort_order is not None:
                action.sort_order = sort_order

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

    async def delete_actions_for_rule(self, rule_id: str) -> int:
        """Delete every action belonging to a rule. Returns the number removed."""
        async with self._db.session_maker() as session:
            stmt = delete(TriggerAction).where(
                TriggerAction.trigger_rule_id == rule_id
            )
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount

    async def get_all_labels(self) -> List[TriggerRuleLabel]:
        """Get all labels"""
        async with self._db.session_maker() as session:
            stmt = select(TriggerRuleLabel)
            stmt = stmt.order_by(TriggerRuleLabel.name)

            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def _resolve_labels(
        self, session: AsyncSession, label_names: List[str]
    ) -> tuple[List[TriggerRuleLabel], List[TriggerRuleLabel]]:
        """Resolve label names to rows, creating missing labels in `session`."""
        labels: List[TriggerRuleLabel] = []
        created: List[TriggerRuleLabel] = []
        seen: set[str] = set()

        for raw in label_names:
            name = raw.strip()
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())

            result = await session.execute(
                select(TriggerRuleLabel).where(TriggerRuleLabel.name == name)
            )
            label = result.scalar_one_or_none()

            if label is None:
                label = TriggerRuleLabel(id=generate_id(), name=name)
                session.add(label)
                created.append(label)

            labels.append(label)

        return labels, created

    async def set_labels_for_rule(
        self, rule_id: str, label_names: List[str]
    ) -> List[TriggerRuleLabel]:
        """
        Attach labels (by name) to a rule, creating any that don't exist yet.

        Replaces the rule's current label set with the resolved labels.
        Returns the labels that were newly created.
        """
        async with self._db.session_maker() as session:
            rule = await session.get(
                TriggerRule,
                rule_id,
                options=[selectinload(TriggerRule.labels)],
            )
            if not rule:
                return []

            labels, created = await self._resolve_labels(session, label_names)

            rule.labels = labels
            await session.commit()

            for label in created:
                await session.refresh(label)

            return created
