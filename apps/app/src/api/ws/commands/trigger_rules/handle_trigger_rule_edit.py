import structlog

from api.ws.context import CommandContext
from api.ws.loaders.trigger_rules_loader import _serialize_rule
from api.ws.registry import command
from api.ws.schema import CommandResult, TriggerRulesEditCommand
from database.repositories.trigger_rule_repo import (
    TriggerActionSpec,
    TriggerRuleRepo,
    unique_event_types,
)
from events.enums import ActionType
from events.conditions import ConditionSpec
from events.modifiers import validate_modifier
from integrations import integration_registry
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
    event_types = unique_event_types(
        msg.payload.event_types
        or ([msg.payload.event_type] if msg.payload.event_type else [])
    )
    actions = msg.payload.actions
    labels = msg.payload.labels

    if not rule_id:
        return CommandResult(status="error", message="Missing rule_id")
    if not name or not event_types:
        return CommandResult(status="error", message="Missing name or event_types")

    unknown = [
        event_type
        for event_type in event_types
        if not integration_registry.is_known_event(event_type)
    ]
    if unknown:
        return CommandResult(
            status="error", message=f"Unknown event_types: {unknown}"
        )

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
        if len(msg.payload.conditions) > 50:
            raise ValueError("A rule can have at most 50 conditions")
        for condition in msg.payload.conditions:
            ConditionSpec.model_validate(condition)
        for action in actions:
            if len(action.modifiers) > 20:
                raise ValueError("An action can have at most 20 modifiers")
            for modifier in action.modifiers:
                validate_modifier(modifier)
    except Exception as exc:
        return CommandResult(
            status="error", message=f"Invalid conditions/modifiers: {exc}"
        )

    action_specs = [
        TriggerActionSpec(
            action_type=action.action_type,
            payload=action.payload,
            duration=action.duration,
            cumulative=action.cumulative,
            modifiers=action.modifiers,
            # old dict fallback: an omitted sort_order meant "use the index"
            sort_order=(
                action.sort_order
                if "sort_order" in action.model_fields_set
                else index
            ),
        )
        for index, action in enumerate(actions)
    ]

    try:
        # Rule, actions and labels are replaced in one transaction, so a
        # failure cannot leave the rule with missing or partial actions.
        rule, created_labels = await TriggerRuleRepo().replace_rule_with_actions(
            rule_id=rule_id,
            event_types=event_types,
            name=name,
            description=msg.payload.description,
            enabled=msg.payload.enabled,
            priority=msg.payload.priority,
            actions=action_specs,
            labels=labels,
            conditions=msg.payload.conditions,
            condition_mode=msg.payload.condition_mode,
            cooldown_seconds=msg.payload.cooldown_seconds,
            window_count=msg.payload.window_count,
            window_seconds=msg.payload.window_seconds,
            budget_count=msg.payload.budget_count,
            budget_window_seconds=msg.payload.budget_window_seconds,
            budget_per_actor=msg.payload.budget_per_actor,
            requires_approval=msg.payload.requires_approval,
            approval_timeout_seconds=msg.payload.approval_timeout_seconds,
            notify_on_fire=msg.payload.notify_on_fire,
        )
        if rule is None:
            return CommandResult(status="error", message="Rule not found")

        # The repository returns the fully loaded rule for serialization.
        serialized = _serialize_rule(rule)

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
