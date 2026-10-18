import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesDeleteCommand
from database.repositories.trigger_rule_repo import TriggerRuleRepo
from services import profiles as profiles_service
from typings import Permission

logger = structlog.get_logger("pes")


def _describe_rules(names: list[str], limit: int = 5) -> str:
    """`RuleA, RuleB, +2 more` — keeps error messages short."""
    shown = ", ".join(names[:limit])
    if len(names) > limit:
        shown += f", +{len(names) - limit} more"
    return shown


@command(ProfilesDeleteCommand, Permission.MANAGE_PROFILES)
async def handle_profiles_delete(
    msg: ProfilesDeleteCommand, ctx: CommandContext
) -> CommandResult:
    """Delete a profile file; trigger-rule references require `force`."""
    name = msg.payload.name

    if not profiles_service.profile_exists(name):
        return CommandResult(status="error", message=f"Profile '{name}' not found")

    references = await TriggerRuleRepo().find_profile_references(name)
    if references and not msg.payload.force:
        logger.warning(
            f"[WS|profiles:delete] Blocked: '{name}' is used by "
            f"{len(references)} trigger rule(s)"
        )
        return CommandResult(
            status="error",
            message=(
                f"Profile '{name}' is used by {len(references)} trigger "
                f"rule(s): {_describe_rules([rule.name for rule in references])}. "
                "Delete anyway to remove it."
            ),
        )

    try:
        profiles_service.delete_profile(name)
    except profiles_service.ProfileError as err:
        logger.warning(f"[WS|profiles:delete] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    if references:
        logger.warning(
            f"[WS|profiles:delete] Force-deleted '{name}' used by "
            f"{len(references)} trigger rule(s)"
        )

    ctx.notifier.notify("profiles:deleted", {"name": name})
    return CommandResult(status="ok")
