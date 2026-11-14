"""Generic webhook connector.

Any local script, Zapier/n8n flow, iOS Shortcut or companion can POST JSON
to feed the normal event pipeline, and rules can send JSON to an external
webhook URL with the `WEBHOOK_SEND` action.
"""

from __future__ import annotations

import os

from events.enums import ActionType
from integrations.base import (
    ActionDef,
    EventDef,
    Integration,
    IntegrationContext,
    IntegrationKind,
    SettingDef,
    SettingType,
)

from . import router as webhook_router
from .actions import WebhookSendHandler


class GenericWebhookIntegration(Integration):
    id = "webhook"
    name = "Generic webhook"
    description = "Receive JSON events from automations and send JSON to external webhooks."
    kind = IntegrationKind.EXTERNAL

    def events(self) -> list[EventDef]:
        return [
            EventDef(
                id="webhook.received",
                label="Webhook received",
                description="A JSON payload was posted to the generic webhook endpoint.",
                group="Webhooks",
                data_schema={
                    "event": "Optional event name supplied by the sender",
                    "source": "Optional source label",
                    "…": "Every other top-level key is available as payload.<key>",
                },
            )
        ]

    def actions(self) -> list[ActionDef]:
        return [
            ActionDef(
                id=ActionType.WEBHOOK_SEND.value,
                label="Send webhook",
                description="Send a JSON request to an external webhook URL.",
                group="Webhooks",
                payload_schema={
                    "url": "Destination URL (http/https)",
                    "method": "POST, PUT or PATCH",
                    "body": "JSON object/list sent as the request body",
                    "headers": "Optional JSON object of request headers",
                    "timeout_seconds": "1-15 seconds",
                },
                secret_fields=("url", "headers"),
                one_shot=True,
                handler=WebhookSendHandler(),
            )
        ]

    def settings(self) -> list[SettingDef]:
        return [
            SettingDef(
                key="token",
                label="Webhook token",
                type=SettingType.SECRET,
                source="env",
                env_var="GENERIC_WEBHOOK_TOKEN",
                secret=True,
                description="Required in the X-PES-Token header.",
            ),
            SettingDef(
                key="max_body_kb",
                label="Max body size (KB)",
                type=SettingType.INT,
                default=64,
                description="Requests larger than this are rejected.",
            ),
        ]

    def router(self):
        return webhook_router.router

    def health(self) -> dict:
        return {
            "status": "ok",
            "configured": bool(os.getenv("GENERIC_WEBHOOK_TOKEN", "")),
            **webhook_router.health(),
        }

    async def start(self, ctx: IntegrationContext) -> None:
        webhook_router.setup(ctx)

    async def stop(self) -> None:
        webhook_router.teardown()
