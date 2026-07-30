"""
Base building blocks of the WS contract: envelope bases, codegen metadata,
and the `@server_message` decorator that registers a server message type
together with its audience (the Permission required to receive it).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from typings import Permission

WS_SCHEMA_VERSION = 2


class TsType(str):
    """
    Codegen metadata (`Annotated[X, TsType("...")]`): the TypeScript generator
    emits this type verbatim instead of mapping the annotated Python type.
    At runtime the annotation behaves like the plain underlying type.
    """


class WireModel(BaseModel):
    """Base for wire models: tolerate extra keys to avoid false contract failures."""

    model_config = ConfigDict(extra="allow")


class ClientMessage(BaseModel):
    """Base of every client → server message (commands + keepalive)."""

    id: str | None = None


class ServerMessage(BaseModel):
    """Base of every server → client message (events, loaders, keepalive)."""

    id: str | None = None


# ───────────────────── Server message registration ─────────────────────
#
# Server message models self-register via @server_message(audience=...):
# the decorator appends the model to SERVER_MESSAGE_MODELS and records its
# audience in MESSAGE_AUDIENCE. There is intentionally no separate registry
# dict to keep in sync — declaring the class IS declaring the contract.

SERVER_MESSAGE_MODELS: list[type[ServerMessage]] = []
MESSAGE_AUDIENCE: dict[str, Permission | None] = {}


def server_message(audience: Permission | None):
    """
    Register a ServerMessage model and its audience.

    `audience` is the Permission a connection must hold to receive the
    message (None = public, e.g. keepalive / handshake / command replies).
    """

    def decorator(cls: type[ServerMessage]) -> type[ServerMessage]:
        msg_type = cls.model_fields["type"].default
        if msg_type in MESSAGE_AUDIENCE:
            raise RuntimeError(f"Duplicate server message registration: {msg_type}")
        SERVER_MESSAGE_MODELS.append(cls)
        MESSAGE_AUDIENCE[msg_type] = audience
        return cls

    return decorator


__all__ = [
    "WS_SCHEMA_VERSION",
    "TsType",
    "WireModel",
    "ClientMessage",
    "ServerMessage",
    "SERVER_MESSAGE_MODELS",
    "MESSAGE_AUDIENCE",
    "server_message",
]
