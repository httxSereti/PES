"""
Versioned WebSocket contract — aggregation point.

The contract is split by domain to stay maintainable:
    base.py    envelope bases, TsType, @server_message(audience) decorator
    models.py  shared payloads (units, sensors, trigger rules, CommandResult)
    client.py  client → server command models (bound to handlers via @command)
    server.py  server → client message models (self-registered with audience)

This package re-exports everything, so consumers keep using
`from api.ws.schema import X` regardless of where X is declared.

The TypeScript contract (`apps/front/src/types/*.generated.ts`) is generated
from this package:  uv run python scripts/generate_ws_types.py
Bump `WS_SCHEMA_VERSION` on any breaking change.
"""

from __future__ import annotations

import inspect as _inspect
from typing import Annotated, Union

from pydantic import Field

from . import client as _client
from .base import *
from .base import ClientMessage, SERVER_MESSAGE_MODELS  # used below (star re-export)
from .client import *
from .models import *
from .server import *

# ─────────────────────────────── Registries ────────────────────────────────

# Client commands, collected in declaration order (PingCommand first).
# Adding a command model to client.py is enough — no list to maintain here.
CLIENT_MESSAGE_MODELS: list[type[ClientMessage]] = [
    obj
    for obj in vars(_client).values()
    if _inspect.isclass(obj)
    and issubclass(obj, ClientMessage)
    and obj is not ClientMessage
    and obj.__module__ == _client.__name__
]

# SERVER_MESSAGE_MODELS and MESSAGE_AUDIENCE are filled by the
# @server_message decorators in server.py (see base.py).

InboundMessage = Annotated[
    Union[tuple(CLIENT_MESSAGE_MODELS)],  # type: ignore[valid-type]  # noqa: UP007
    Field(discriminator="type"),
]
OutboundMessage = Annotated[
    Union[tuple(SERVER_MESSAGE_MODELS)],  # type: ignore[valid-type]  # noqa: UP007
    Field(discriminator="type"),
]
