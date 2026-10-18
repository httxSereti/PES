import structlog

from api.ws.context import CommandContext
from api.ws.registry import command
from api.ws.schema import CommandResult, IntegrationsUpdateCommand
from integrations import integration_registry
from typings import Permission

logger = structlog.get_logger("pes")


@command(IntegrationsUpdateCommand, Permission.ADMIN)
async def handle_integrations_update(
    msg: IntegrationsUpdateCommand, ctx: CommandContext
) -> CommandResult:
    """
    Enable/disable an integration or update its non-secret settings.
    """
    payload = msg.payload

    try:
        entry = integration_registry.update(
            payload.integration_id,
            enabled=payload.enabled,
            settings=payload.settings,
        )
    except ValueError as err:
        return CommandResult(status="error", message=str(err))

    # Broadcast so every client's catalog stays in sync
    ctx.notifier.notify("integrations:update", entry)

    logger.info(
        "[WS|integrations:update] Integration updated",
        integration_id=payload.integration_id,
        enabled=payload.enabled,
    )

    return CommandResult(status="ok")
