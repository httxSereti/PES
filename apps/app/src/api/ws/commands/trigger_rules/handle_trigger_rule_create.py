import structlog

from api.ws.context import CommandContext
from api.ws.loaders.trigger_rules_loader import _serialize_rule
from api.ws.registry import command
from api.ws.schema import CommandResult, TriggerRulesCreateCommand
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from events.enums import ActionType
from typings import Permission

logger = structlog.get_logger("pes")


@command(TriggerRulesCreateCommand, Permission.ADMIN)
async def handle_trigger_rule_create(
    msg: TriggerRulesCreateCommand, ctx: CommandContext
) -> CommandResult:
    """
    Create a new TriggerRule together with its actions.

    Payload shape: see TriggerRuleDraft in api.ws.schema (labels are label
    names — existing reused / new created).
    """
    name = msg.payload.name
    event_type = msg.payload.event_type
    actions = msg.payload.actions
    labels = msg.payload.labels

    if not name or not event_type:
        return CommandResult(status="error", message="Missing name or event_type")

    # Validate action types up front so we don't create a half-built rule
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

        rule = await repo.create_rule(
            event_type=event_type,
            name=name,
            description=msg.payload.description,
            enabled=msg.payload.enabled,
            priority=msg.payload.priority,
        )

        for index, action in enumerate(actions):
            await repo.create_action(
                trigger_rule_id=rule.id,
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
        created_labels = await repo.set_labels_for_rule(rule.id, labels)

        # Re-fetch with actions + labels eagerly loaded for serialization
        full_rule = await repo.get_rule(rule.id)
        serialized = _serialize_rule(full_rule)

    except KeyError:
        logger.exception(
            "[WS|trigger_rules:create] Failed to create TriggerRule",
            name=name,
            event_type=event_type,
        )
        return CommandResult(
            status="error", message="Can't create TriggerRule! (KeyError)"
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

    # Broadcast to every client so their lists stay in sync
    ctx.notifier.notify("trigger_rules:create", {"rule": serialized})

    logger.info(
        "[WS|trigger_rules:create] Created TriggerRule",
        trigger_rule_id=rule.id,
        actions=len(actions),
    )

    return CommandResult(status="ok", rule=serialized)
