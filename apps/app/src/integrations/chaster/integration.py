"""Chaster — external integration (events, actions, settings, webhooks)."""

from __future__ import annotations

from events.enums import ActionType, TriggerableEvent
from integrations.base import (
    ActionDef,
    EventDef,
    Integration,
    IntegrationContext,
    IntegrationKind,
    SettingDef,
    SettingType,
)

from . import echo, webhooks
from .actions import ChasterTimeActionHandler

_EVENTS = [
    EventDef(
        id=TriggerableEvent.CHASTER_PILLORY_VOTE.value,
        label="Pillory vote",
        description="A vote was cast on an active pillory",
        group="Pillory",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_PILLORY_STARTED.value,
        label="Pillory started",
        description="A pillory sentence started",
        group="Pillory",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_PILLORY_ENDED.value,
        label="Pillory ended",
        description="A pillory sentence ended",
        group="Pillory",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_VOTE_ADD.value,
        label="Vote added",
        description="An upvote was received on a shared link",
        group="Votes",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_VOTE_SUB.value,
        label="Vote removed",
        description="A downvote was received on a shared link",
        group="Votes",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_TIME_ADD.value,
        label="Time added",
        description="Time was added to a lock",
        group="Time",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_TIME_SUB.value,
        label="Time removed",
        description="Time was removed from a lock",
        group="Time",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_WOF_TURNED.value,
        label="Wheel of Fortune turned",
        description="The Wheel of Fortune was turned",
        group="Wheel of Fortune",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_LOCK_FROZEN.value,
        label="Lock frozen",
        description="The lock was frozen",
        group="Lock",
    ),
    EventDef(
        id=TriggerableEvent.CHASTER_LOCK_UNFROZEN.value,
        label="Lock unfrozen",
        description="The lock was unfrozen",
        group="Lock",
    ),
]

_ACTIONS = [
    ActionDef(
        id=ActionType.CHASTER_TIME_UPDATE.value,
        label="Update lock time",
        description="Add or remove time on the active Chaster lock.",
        group="Lock",
        payload_schema={
            "duration_minutes": "integer (positive to add, negative to remove)",
            "only_max": "boolean (only update max, not current time)",
        },
        reversible=False,
        handler=ChasterTimeActionHandler(),
    ),
]

_SETTINGS = [
    SettingDef(
        key="CHASTER_URL",
        label="API URL",
        type=SettingType.STR,
        source="env",
        env_var="CHASTER_URL",
        description="Chaster API base URL (config.env)",
    ),
    SettingDef(
        key="CHASTER_TOKEN",
        label="API token",
        type=SettingType.SECRET,
        source="env",
        env_var="CHASTER_TOKEN",
        secret=True,
        description="Bearer token used for API calls (config.env)",
    ),
    SettingDef(
        key="CHASTER_WEBHOOK_USER",
        label="Webhook user",
        type=SettingType.STR,
        source="env",
        env_var="CHASTER_WEBHOOK_USER",
        description="Basic-auth username for incoming webhooks (config.env)",
    ),
    SettingDef(
        key="CHASTER_WEBHOOK_PWD",
        label="Webhook password",
        type=SettingType.SECRET,
        source="env",
        env_var="CHASTER_WEBHOOK_PWD",
        secret=True,
        description="Basic-auth password for incoming webhooks (config.env)",
    ),
]


class ChasterIntegration(Integration):
    id = "chaster"
    name = "Chaster"
    description = "Chaster locks: pillory, votes, Wheel of Fortune and lock time updates."
    kind = IntegrationKind.EXTERNAL

    def events(self) -> list[EventDef]:
        return list(_EVENTS)

    def actions(self) -> list[ActionDef]:
        return list(_ACTIONS)

    def settings(self) -> list[SettingDef]:
        return list(_SETTINGS)

    def router(self):
        return webhooks.router

    async def start(self, ctx: IntegrationContext) -> None:
        webhooks.setup(ctx)

    async def stop(self) -> None:
        webhooks.teardown()
        echo.clear()
