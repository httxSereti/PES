from __future__ import annotations
from database.connection import Database

from database.models import TriggerRule
from utils import Logger


class EventRegistry:
    """
    Resolves event types to their configured TriggerRules.
    Queries the DB for enabled rules matching the event type.
    """

    def __init__(self, db: Database | None = None):
        from database.repositories.trigger_rule_repo import TriggerRuleRepo
        db = db or Database.get_instance()
        self._repo = TriggerRuleRepo(db)

    async def get_rules_for_event(self, event_type: str) -> list[TriggerRule]:
        """
        Get all enabled TriggerRules for an event type, ordered by priority DESC.
        """
        rules = await self._repo.get_enabled_rules(event_type)

        if not rules:
            Logger.debug(f"[EventRegistry] No enabled rules for event '{event_type}'")

        return rules
