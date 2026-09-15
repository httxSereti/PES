import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, ProfilesUpdateCommand
from services import profiles as profiles_service
from typings import Permission

logger = structlog.get_logger("pes")


@command(ProfilesUpdateCommand, Permission.WRITE_PROFILES)
async def handle_profiles_update(
    msg: ProfilesUpdateCommand, ctx: CommandContext
) -> CommandResult:
    """Edit a profile: description, snapshot and/or name."""
    p = msg.payload

    if p.description is None and not p.from_current and not p.rename_to:
        return CommandResult(status="error", message="Nothing to update")

    try:
        summary = profiles_service.update_profile(
            p.name,
            description=p.description,
            rename_to=p.rename_to,
            from_current=p.from_current,
            include_ramps=p.include_ramps,
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
