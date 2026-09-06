import structlog

from api.ws.context import CommandContext
from api.ws.loaders.trigger_rules_loader import _serialize_rule
from api.ws.registry import command
from api.ws.schema import CommandResult, TriggerRulesEditCommand
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from events.enums import ActionType
from typings import Permission

logger = structlog.get_logger("pes")


@command(TriggerRulesEditCommand, Permission.ADMIN)
async def handle_trigger_rule_edit(
    msg: TriggerRulesEditCommand, ctx: CommandContext
) -> CommandResult:
    """
    Edit an existing TriggerRule: update its fields and fully replace its
    actions and labels.

    Payload shape: see TriggerRuleEditDraft in api.ws.schema (same as create,
    plus rule_id).
    """
    rule_id = msg.payload.rule_id
    name = msg.payload.name
    event_type = msg.payload.event_type
    actions = msg.payload.actions
    labels = msg.payload.labels

    if not rule_id:
        return CommandResult(status="error", message="Missing rule_id")
    if not name or not event_type:
        return CommandResult(status="error", message="Missing name or event_type")

    # Validate action types up front so we don't half-rewrite the rule
    for action in actions:
        try:
            ActionType(action.action_type)
        except ValueError:
            return CommandResult(
                status="error",
                message=f"Invalid action_type. Must be one of: {[t.value for t in ActionType]}",
            )

    try:
        repo = TriggerRuleRepo()

        rule = await repo.update_rule(
            rule_id=rule_id,
            event_type=event_type,
            name=name,
            description=msg.payload.description,
            enabled=msg.payload.enabled,
            priority=msg.payload.priority,
        )
        if not rule:
            return CommandResult(status="error", message="Rule not found")

        # Full replace of actions
        await repo.delete_actions_for_rule(rule_id)
        for index, action in enumerate(actions):
            await repo.create_action(
                trigger_rule_id=rule_id,
                action_type=action.action_type,
                payload=action.payload,
                duration=action.duration,
                cumulative=action.cumulative,
                # old dict fallback: an omitted sort_order meant "use the index"
                sort_order=(
                    action.sort_order
                    if "sort_order" in action.model_fields_set
                    else index
                ),
            )

        # Resolve labels by name (reuse existing, create missing) and attach
        created_labels = await repo.set_labels_for_rule(rule_id, labels)

        # Re-fetch with actions + labels eagerly loaded for serialization
        full_rule = await repo.get_rule(rule_id)
        serialized = _serialize_rule(full_rule)

    except KeyError:
        logger.exception(
            "[WS|trigger_rules:edit] Failed to edit TriggerRule",
            trigger_rule_id=rule_id,
        )
        return CommandResult(
            status="error", message="Can't edit TriggerRule! (KeyError)"
        )

    # Broadcast newly created labels so every client's label picker stays in sync
    for label in created_labels:
        ctx.notifier.notify(
            "trigger_rules:create_label",
            {
                "id": label.id,
                "name": label.name,
                "description": label.description,
            },
        )

    # Broadcast the full updated rule so every client's list stays in sync
    ctx.notifier.notify(
        "trigger_rules:update",
        {"id": rule_id, "changes": {k: v for k, v in serialized.items() if k != "id"}},
    )

    logger.info(
        "[WS|trigger_rules:edit] Edited TriggerRule",
        trigger_rule_id=rule_id,
        actions=len(actions),
    )

    return CommandResult(status="ok", rule=serialized)
