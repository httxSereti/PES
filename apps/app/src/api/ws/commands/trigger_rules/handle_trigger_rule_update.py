import structlog
from sqlalchemy.orm import selectinload

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TriggerRulesUpdateCommand
from database.connection import Database
from database.models import TriggerRule, TriggerRuleEvent
from database.repositories.trigger_rule_repo import unique_event_types
from integrations import integration_registry
from store import Store
from typings import Permission


store = Store()
logger = structlog.get_logger("pes")


@command(TriggerRulesUpdateCommand, Permission.ADMIN)
async def handle_trigger_rule_update(
    msg: TriggerRulesUpdateCommand, ctx: CommandContext
) -> CommandResult:
    """
    Handle TriggerRule update
    """
    rule_id = msg.payload.rule_id
    # fields the client actually set (None-default fields dropped), like the
    # raw payload dict the old handler received
    sent_fields = msg.payload.model_dump(exclude_none=True)

    if not rule_id:
        return CommandResult(status="error", message="Missing rule id")

    raw_event_types = msg.payload.event_types
    if raw_event_types is None and msg.payload.event_type is not None:
        raw_event_types = [msg.payload.event_type]
    event_types = (
        unique_event_types(raw_event_types) if raw_event_types is not None else None
    )
    if event_types is not None:
        if not event_types:
            return CommandResult(
                status="error", message="A rule needs at least one event"
            )
        unknown = [
            event_type
            for event_type in event_types
            if not integration_registry.is_known_event(event_type)
        ]
        if unknown:
            return CommandResult(
                status="error", message=f"Unknown event_types: {unknown}"
            )

    try:
        async with Database.get_instance().session_maker() as session:
            rule = await session.get(
                TriggerRule,
                rule_id,
                options=[selectinload(TriggerRule.event_links)],
            )

            if not rule:
                return CommandResult(status="error", message="Missing rule")

            name = msg.payload.name
            description = msg.payload.description
            enabled = msg.payload.enabled
            priority = msg.payload.priority

            if name is not None:
                rule.name = name
            if description is not None:
                rule.description = description
            if enabled is not None:
                rule.enabled = enabled
            if priority is not None:
                rule.priority = priority
            if event_types is not None:
                rule.event_type = event_types[0]
                rule.event_links = [
                    TriggerRuleEvent(event_type=event_type, sort_order=index)
                    for index, event_type in enumerate(event_types)
                ]

            await session.commit()
            await session.refresh(rule)

        changes = {k: v for k, v in sent_fields.items() if k != "rule_id"}
        if event_types is not None:
            changes["event_type"] = event_types[0]
            changes["event_types"] = event_types

        ctx.notifier.notify(
            "trigger_rules:update",
            {
                "status": "ok",
                "id": rule_id,
                "partial": True,
                "changes": changes,
            },
        )

    except KeyError:
        logger.exception(
            "[WS|trigger_rules:update] Failed to update TriggerRule",
            trigger_rule_id=rule_id,
            changes=sent_fields.keys(),
        )

        return CommandResult(
            status="error", message="Can't update TriggerRule! (KeyError)"
        )

    logger.info(
        "[WS|trigger_rules:update] Updated TriggerRule",
        trigger_rule_id=rule_id,
        changes=sent_fields.keys(),
    )

    return CommandResult(status="ok")
