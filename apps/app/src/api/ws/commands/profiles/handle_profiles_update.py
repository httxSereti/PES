import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesUpdateCommand
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


@command(ProfilesUpdateCommand, Permission.WRITE_PROFILES)
async def handle_profiles_update(
    msg: ProfilesUpdateCommand, ctx: CommandContext
) -> CommandResult:
    """Edit a profile: description, content, defaults and/or name."""
    p = msg.payload

    if (
        p.description is None
        and not p.from_current
        and not p.rename_to
        and p.threads_settings is None
        and not p.replace_defaults
    ):
        return CommandResult(status="error", message="Nothing to update")

    # Renaming would leave trigger-rule actions pointing at the old name,
    # so it is blocked while any rule still references this profile.
    if p.rename_to and p.rename_to != p.name:
        references = await TriggerRuleRepo().find_profile_references(p.name)
        if references:
            logger.warning(
                f"[WS|profiles:update] Blocked rename of '{p.name}': used by "
                f"{len(references)} trigger rule(s)"
            )
            return CommandResult(
                status="error",
                message=(
                    f"Profile '{p.name}' is used by {len(references)} trigger "
                    f"rule(s): {_describe_rules([rule.name for rule in references])}. "
                    "Update those rules before renaming."
                ),
            )

    try:
        summary = profiles_service.update_profile(
            p.name,
            description=p.description,
            rename_to=p.rename_to,
            from_current=p.from_current,
            include_ramps=p.include_ramps,
            threads_settings=p.threads_settings,
            defaults=(
                p.defaults.model_dump() if p.defaults is not None else None
            ),
            replace_defaults=p.replace_defaults,
            updated_by=ctx.user.display_name or ctx.user.id,
        )
    except profiles_service.ProfileError as err:
        logger.warning(f"[WS|profiles:update] Rejected: {err}")
        return CommandResult(status="error", message=str(err))

    # A rename removes the old entry and adds the new one
    if p.rename_to and p.rename_to != p.name:
        ctx.notifier.notify("profiles:deleted", {"name": p.name})
    ctx.notifier.notify("profiles:saved", {"profile": summary, "created": False})
    return CommandResult(status="ok")
