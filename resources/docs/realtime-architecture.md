# Realtime Architecture — Commands & Events

This document describes the typed realtime architecture of PlunEStim: how
commands (client → server) and events (server → client) are defined,
validated, authorized, and delivered over the single WebSocket channel.

Source of truth: `apps/app/src/api/ws/schema.py`. The TypeScript contract is
generated — never edit generated files by hand:

```bash
pnpm codegen:ws   # apps/front/src/types/websocket.generated.ts + auth.generated.ts
```

## 1. Message taxonomy

Every message on `/ws` is a JSON envelope `{ id?, type, payload? }` where
`type` is a `<domain>:<verb>` string acting as a discriminator.

| Kind | Direction | Examples | Purpose |
|---|---|---|---|
| Command | client → server | `units:update_level`, `trigger_rules:create` | Mutate state; always answered |
| Command response | server → client | `command` (echoes `id`) | Correlated ack/error |
| Event | server → client | `events:triggered`, `units:update`, `queue:update` | State broadcast, audience-filtered |
| Loader | server → client | `sensors:init`, `trigger_rules:load`, `events:history` | Initial / bulk state, sent per-connection |
| Heartbeat | both | `ping`, `pong`, `connected` | Liveness + handshake |

`id` correlates a command with its `command` response; events and loaders
carry no `id`.

## 2. The contract (`api.ws.schema` package)

The contract lives in the **`api/ws/schema/` package**, split by domain so no
file grows unwieldy:

- `base.py` — envelope bases (`ClientMessage`, `ServerMessage`), `TsType`
  codegen metadata, and the `@server_message(audience=...)` decorator.
- `models.py` — shared payloads (`UnitSettings`, `Sensor`, `TriggerRule`,
  `CommandResult`, …) and the `*Patch` aliases.
- `client.py` — every client → server command model, grouped by domain.
- `server.py` — every server → client message model, grouped by domain.
- `__init__.py` — re-exports everything (`from api.ws.schema import X` works
  regardless of where X lives), collects `CLIENT_MESSAGE_MODELS`, and builds
  the discriminated unions `InboundMessage` / `OutboundMessage`.

Every message is a pydantic model with a `type: Literal[...]` discriminator.
`WS_SCHEMA_VERSION` is sent in the `connected` handshake as `schemaVersion`.
Bump it on any breaking change.
`Annotated[X, TsType("...")]` pins a verbatim TypeScript type for codegen
when the Python type is looser than the intended contract (e.g. patch dicts).

## 3. Commands: runtime validation + decorator registry

Inbound flow (`api/ws/endpoint.py`):

1. `json.loads` → validate against the `InboundMessage` union via
   `pydantic.TypeAdapter`. Malformed/unknown messages get a `command` error
   reply (`status: "error"`) — they never reach a handler and never crash the
   socket.
2. Handlers **self-register** with the `@command` decorator
   (`api/ws/registry.py`) — there is no central list to maintain. At import
   time `load_commands()` walks the `api/ws/commands/` package
   (`pkgutil.walk_packages`), importing every module so decorators run, then
   asserts the registry matches the contract exactly (every command model has
   a handler, and nothing unknown is registered).
3. `store.check_permission(user_id, spec.permission)` gates execution.
4. The handler receives the **validated model** and a `CommandContext`
   (`user`, `msg_id`, `notifier`) and returns a `CommandResult`. The reply
   echoes the command's `id` (request-reply correlation).

One command = one file in `api/ws/commands/<domain>/`:

```python
# api/ws/commands/units/handle_update_level.py
@command(UnitsUpdateLevelCommand, Permission.WRITE_UNITS)
async def handle_update_level(
    msg: UnitsUpdateLevelCommand, ctx: CommandContext
) -> CommandResult: ...
```

Adding a command = one model in `schema/client.py` + one handler file with
the decorator. Routing, validation, permission, auto-discovery and the TS
contract all follow from those two declarations.

## 4. Events: audiences

Every server→client message declares its **audience** — the `Permission` a
connection must hold to receive it — **on the model itself**, with the
`@server_message` decorator (`schema/base.py`). `None` means public. The
decorator fills `SERVER_MESSAGE_MODELS` and `MESSAGE_AUDIENCE` together, so
a message can never exist without an audience, and no separate registry can
drift out of sync.

```python
@server_message(audience=Permission.ADMIN)
class QueueUpdateMessage(ServerMessage):
    type: Literal["queue:update"] = "queue:update"
    payload: QueueStatus
```

Current matrix:

| Messages | Audience |
|---|---|
| `connected`, `ping`, `pong`, `command`, `auth:refresh` | public |
| `units:init`, `units:update`, `core:stop` | `READ_UNITS` |
| `sensors:init`, `sensors:update`, `hardware:init`, `hardware:update` | `READ_SENSORS` |
| `events:history`, `events:triggered` | `READ_EVENTS` (members: USER and above) |
| `queue:update`, `trigger_rules:*` | `ADMIN` |

Delivery: at connect time the endpoint computes the user's **effective
permissions** (role ∪ custom) and stores a snapshot in the
`WebSocketManager` next to the socket. `WebSocketNotifier.notify(type, payload)`
(the same call hardware threads already use via `call_soon_threadsafe`)
resolves the audience and broadcasts only to matching connections. Snapshots
are refreshed (`WebSocketManager.update_permissions`) when a role changes,
and the affected client gets an `auth:refresh` nudge so it re-fetches its
profile.

Loaders obey the same matrix: the connect sequence only sends `units:init`,
`events:history`, `trigger_rules:load`, … to connections holding the matching
permission.

## 5. Users, tokens, JWT

- **Users persist in SQLite** (`users` table): id, display_name, role,
  custom_permissions (JSON), is_active, created_at, last_login_at. The
  in-memory `Store` user map is a **cache** loaded at startup; all mutations
  go through `UserService` (`src/services/users.py`), which writes through to
  the DB via `UserRepo` and keeps the cache + live permission snapshots in
  sync.
- **Magic tokens persist in `magic_tokens`**: only the SHA-256 hash is
  stored; tokens expire (7 days) and are single-use (marked `used_at` on
  login). Raw tokens only ever exist in the magic link shown once at
  creation.
- **Host bootstrap**: at startup, if no active HOST user exists one is
  created; then a **fresh HOST magic token is issued on every boot** —
  previous unused host tokens are revoked, and the link is printed to the
  console. The console is the root-of-trust recovery path (a printed link is
  single-use; the next boot always prints a new one).
- **JWT**: HS256, 24 h, `sub` = user id. Used as REST `Bearer` and as the WS
  `?token=`. Every auth path re-resolves the user and rejects unknown or
  inactive users — a valid JWT never outlives its user.
- **Guest**: `POST /auth/guest` issues a JWT for an ephemeral, non-persisted
  GUEST user.

## 6. Authorization

Permissions are checked against **effective permissions** everywhere:

- WS commands: `CommandSpec.permission` (declarative).
- REST: `require_permission(Permission.X)` dependency
  (`api/helpers/permissions.py`) — e.g. `MANAGE_USERS` for magic-link
  creation, `ADMIN` for queue pause/resume, `WRITE_UNITS` for queue cancel
  (safety actions stay available to operators).
- WS events: `MESSAGE_AUDIENCE` (see §4).

`GET /auth/me` returns the effective permission list so the frontend gates UI
with the same model (`hasPermission(user, Permission.X)`), never with string
role compares. Roles themselves are only meaningful as permission bundles
(`ROLE_PERMISSIONS`).

## 7. Frontend contract

- `websocket.generated.ts`: message models + `WebSocketClientMessage` /
  `WebSocketServerMessage` unions (regenerated by `pnpm codegen:ws`).
- `auth.generated.ts`: `Role`, `Permission` enums and
  `SERVER_MESSAGE_AUDIENCE` (same generator run).
- `sendCommand<T extends CommandType>(type, payload)` is typed end-to-end:
  the payload type is derived from the command type via `Extract` on the
  client union; resolves with `CommandResult`.
- `useWebSocketEvent<T extends ServerEventType>(type, cb)` delivers a typed
  payload.
- The Redux middleware maps inbound events to slices (unchanged), plus
  `auth:refresh` → re-verify the current user.

## 8. Security notes

- Unknown/inactive users are rejected at WS connect (close `4001`) and on
  every REST call.
- Audiences are enforced **server-side**; the frontend never receives
  messages outside its permission set (UI gating is UX, not security).
- Magic tokens are hashed at rest, expiring, single-use, and transported in
  the request **body** (never query params → no access-log leakage).
- The Chaster webhook remains HTTP-Basic-authed and separate from the user
  system.
