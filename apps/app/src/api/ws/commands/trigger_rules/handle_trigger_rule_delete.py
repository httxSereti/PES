import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, TriggerRulesDeleteCommand
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from typings import Permission

logger = structlog.get_logger("pes")


@command(TriggerRulesDeleteCommand, Permission.ADMIN)
async def handle_trigger_rule_delete(
    msg: TriggerRulesDeleteCommand, ctx: CommandContext
) -> CommandResult:
    """
    Delete a TriggerRule (and its actions, via cascade).

    Expected payload: { "rule_id": str }
    """
    rule_id = msg.payload.rule_id

    if not rule_id:
        return CommandResult(status="error", message="Missing rule_id")

    deleted = await TriggerRuleRepo().delete_rule(rule_id)

    if not deleted:
        return CommandResult(status="error", message="Rule not found")

    # Broadcast so every client drops it from their list
    ctx.notifier.notify("trigger_rules:delete", {"id": rule_id})

    logger.info(
        "[WS|trigger_rules:delete] Deleted TriggerRule",
        trigger_rule_id=rule_id,
    )

    return CommandResult(status="ok")
