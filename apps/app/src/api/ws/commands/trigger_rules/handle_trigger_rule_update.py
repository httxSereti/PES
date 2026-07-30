import structlog
from store import Store
from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TriggerRulesUpdateCommand
from database.connection import Database
from database.models import TriggerRule
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

    try:
        if not rule_id:
            return CommandResult(status="error", message="Missing rule id")

        async with Database.get_instance().session_maker() as session:
            rule = await session.get(TriggerRule, rule_id)

            if not rule:
                return CommandResult(status="error", message="Missing rule")

            name = msg.payload.name
            description = msg.payload.description
            event_type = msg.payload.event_type
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
            if event_type is not None:
                rule.event_type = event_type

            await session.commit()
            await session.refresh(rule)

        ctx.notifier.notify(
            "trigger_rules:update",
            {
                "status": "ok",
                "id": rule_id,
                "partial": True,
                "changes": {k: v for k, v in sent_fields.items() if k != "rule_id"},
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
