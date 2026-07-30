"""
WS command registry: decorator-based registration + auto-discovery.

Handlers self-register with @command — no central list to maintain:

    # api/ws/commands/units/handle_update_level.py
    @command(UnitsUpdateLevelCommand, Permission.WRITE_UNITS)
    async def handle_update_level(
        msg: UnitsUpdateLevelCommand, ctx: CommandContext
    ) -> CommandResult:
        ...

`load_commands()` imports every module under `api.ws.commands`, which runs
the decorators and fills COMMAND_SPECS_BY_TYPE. Dropping a new handler file
into the package is all it takes to register a command.
"""

from __future__ import annotations

import importlib
import pkgutil
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from api.ws.context import CommandContext
from api.ws.schema import (
    CLIENT_MESSAGE_MODELS,
    ClientMessage,
    CommandResult,
    PingCommand,
)
from typings import Permission

HandlerFn = Callable[[Any, CommandContext], Awaitable[CommandResult]]


@dataclass
class CommandSpec:
    model: type[ClientMessage]
    handler: HandlerFn
    permission: Permission


COMMAND_SPECS_BY_TYPE: dict[str, CommandSpec] = {}


def command(model: type[ClientMessage], permission: Permission):
    """
    Register a WS command handler for a client message model.

    `permission` is checked against the user's effective permissions before
    the handler runs; the message is already validated against `model`.
    """

    def decorator(fn: HandlerFn) -> HandlerFn:
        msg_type = model.model_fields["type"].default
        if msg_type in COMMAND_SPECS_BY_TYPE:
            raise RuntimeError(f"Duplicate command registration: {msg_type}")
        COMMAND_SPECS_BY_TYPE[msg_type] = CommandSpec(model, fn, permission)
        return fn

    return decorator


def load_commands() -> None:
    """
    Import every module under api.ws.commands so @command decorators run,
    then assert the registry matches the contract exactly (idempotent).
    """
    import api.ws.commands as commands_pkg

    for module_info in pkgutil.walk_packages(
        commands_pkg.__path__, prefix=f"{commands_pkg.__name__}."
    ):
        if not module_info.ispkg:
            importlib.import_module(module_info.name)

    # Every declared command model must have a handler (PingCommand is
    # answered inline by the endpoint's keepalive), and nothing more.
    declared = {
        model.model_fields["type"].default
        for model in CLIENT_MESSAGE_MODELS
        if model is not PingCommand
    }
    registered = set(COMMAND_SPECS_BY_TYPE)
    missing = declared - registered
    unknown = registered - declared
    if missing or unknown:
        raise RuntimeError(
            "Command registry mismatch — "
            f"no handler for: {sorted(missing) or '∅'}, "
            f"not in contract: {sorted(unknown) or '∅'}"
        )
