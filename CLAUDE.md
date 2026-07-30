# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PlunEStim (PES) drives EStim sessions over the internet. It controls hardware **units** (2B DIY boards, up to 6 channels / 3 units over Bluetooth or Serial) and **sensors** (2 motion, 1 sound), and integrates with **Chaster** (lock control via webhooks: Pillory, Wheel of Fortune, time/vote events, freeze). Core mechanic: external **Events** resolve to **Trigger Rules**, which enqueue **Actions** that mutate units, apply profiles, or change the Chaster lock. `README.md` and `apps/app/README.md` document the domain language — MagicNumber operators (`+5`, `-5`, `[5-10]`, `%+5`, `%-[5-10]`) and random selectors for units (`123RO`, `123RM`) and channels (`ABRO`, `ABRM`).

## Monorepo layout

pnpm + Turborepo workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

- `apps/app` — Python backend (FastAPI + hardware I/O). Managed by **uv**, not pnpm.
- `apps/front` — React Router 7 SPA (`ssr: false`, `appDirectory: src`) + Redux Toolkit + Tailwind v4.
- `packages/ui` — shared **shadcn/ui** component library `@pes/ui` (includes `niko-table`).
- `packages/eslint-config`, `packages/typescript-config` — shared `@pes/*` configs.

## Commands

Root (Turbo fans out across workspaces):

```bash
pnpm dev          # all dev servers
pnpm build        # turbo build
pnpm lint         # turbo lint (front: eslint --max-warnings 0; app: ruff check)
pnpm format       # prettier on **/*.{ts,tsx,md}
```

Backend — `apps/app`, **Python 3.12.6 exactly** (pinned in `pyproject.toml`):

```bash
cd apps/app
uv run src/main.py      # runs the whole stack (see below)
uv run ruff check .     # lint
```

Frontend — `apps/front`:

```bash
cd apps/front
pnpm dev          # react-router dev (needs VITE_WS_URL env for the WS connection)
pnpm typecheck    # react-router typegen && tsc --noEmit --skipLibCheck
pnpm build
```

No test suite exists in this repo. There is no migration tooling: tables are created at startup via `Base.metadata.create_all`.

## Backend process model (`apps/app/src/main.py`, ~110-line composition root)

`main.py` runs the entire backend in one process but holds no feature code — it only wires singletons and starts threads. At import time it instantiates the core singletons in order: `Database()` → `Store()` → `EventRegistry(db)` → `ActionExecutor(store, ws_notifier)` → `ActionQueue(executor, ws_notifier)` → `EventDispatcher(registry, action_queue, ws_notifier)`. Feature code lives in:

- `src/hardware/units.py` — `UnitConnect` (serial-over-BT link to a 2B), `thread_bt_unit`, `mk2b_init`, the `FW_2B_CMD` map, and the `usage_limit`/`default_usage`/`init_settings` JSON configs.
- `src/hardware/sensors.py` — BLE sensor threads, alarm threshold checks (`sensor_*`), and `sensor_alarm_check` (dispatches fired alarms as events).
- `src/hardware/ramp.py` — home of the (currently removed) software ramp; design notes only.
- `src/api/app.py` — FastAPI assembly: `lifespan`, routers, CORS, `GET /`.
- `src/api/ws/endpoint.py` — the `/ws` WebSocket endpoint (an `APIRouter`) and the `HANDLERS` command/permission map.

The `__main__` block starts **daemon threads** for each BT sensor and each 2B unit (always started; each thread idles while its device is disabled in the Store), then runs the API (`uvicorn` on `0.0.0.0:8000`) on the main thread. User loading + ROOT bootstrap are async and live in the FastAPI `lifespan` (see Persistence). The **per-second queue tick** (`queue_tick_loop`) and the **per-second sensor alarm check** (`sensor_alarm_loop`, which dispatches fired sensor alarms via `EventDispatcher`) are asyncio tasks started in the FastAPI `lifespan`, so they run on the API loop.

So when reasoning about a flow: hardware lives on background threads while the web server runs on the main thread; the event loop ticking the action queue (and serving `cancel`/`cancel_all`) is the uvicorn API loop; cross-thread → asyncio handoff goes through `WebSocketNotifier` (`call_soon_threadsafe`).

FastAPI `lifespan` (`src/api/app.py`, not `__main__`) handles async startup: `ws_notifier.setup(loop)`, start `ws_notifier.consume`, start `queue_tick_loop` (the per-second `ActionQueue.tick()` driver), start `sensor_alarm_loop` (the per-second `sensor_alarm_check()` driver), `db.init()`, create tables, `seed_from_json(db)`, and inject the dispatcher into the Chaster webhook router via `chaster_webhooks.setup(EventDispatcher.get_instance())`. Both per-second tasks are cancelled on shutdown. CORS is open to all origins. Hardware connexion search is toggled **per device at runtime** (each unit/sensor idles when disabled): flags live in the `Store`, are persisted in `apps/app/configurations/hardware.json`, and are driven from the dashboard via the WS `hardware:update_mk2bt` / `hardware:update_bt_sensors` / `hardware:rescan_*` commands (state broadcast as `hardware:init` / `hardware:update`). Config is loaded from `apps/app/config.env` via `dotenv`.

## Event → Action pipeline (`src/events/`)

This is the heart of PES.

- **`EventDispatcher.dispatch(event_type, event_data, origin)`** (singleton): asks the registry for matching rules, converts each rule's actions into `QueueItem`s, persists a `TriggeredEvent`, broadcasts `events:triggered` over WS, then enqueues. Before consulting DB rules it handles **Wheel-of-Fortune dynamic codes** in `event_data` (e.g. `{p:Jfa}` = profile/level/duration, parsed by `_parse_wof_dynamic_profile`).
- **`EventRegistry.get_rules_for_event(event_type)`**: returns enabled `TriggerRule`s ordered by priority via `TriggerRuleRepo`.
- **`ActionQueue`** (singleton, thread-safe, `threading.Lock`): priority-sorted queue ticked once per second. Per tick it increments `elapsed` on RUNNING items, finalizes expired ones (`duration == -1` means no expiry), then starts work: **only one non-cumulative item runs at a time**, while **all cumulative items run concurrently**. `cancel`/`finalize` call `ActionExecutor.reverse`. Pushes `queue:update` on every state change.
- **`ActionExecutor`**: applies/reverses each `ActionType` — `LEVEL`, `PROFILE`, `MULT`, `CHASTER_TIME_UPDATE` (`src/events/enums.py`). Mutates the `Store` for unit/profile actions or calls the Chaster API for lock-time actions; returns a snapshot used to reverse later.
- **`TriggerableEvent` enum** (`src/events/enums.py`) is the canonical event-type registry: Chaster Pillory (vote/started/ended), shared-link vote add/sub, time add/sub, WOF turned, lock frozen/unfrozen, and sensor sound/position/move alarms. Add new routable events here.

## Persistence (`src/database/`)

Async SQLAlchemy + SQLite at `apps/app/plunes.db` (`sqlite+aiosqlite`, `check_same_thread=False`). `Database` is a singleton (`get_instance()`, or `.session_maker`); all access goes through repositories (`TriggerRuleRepo`, `TriggeredEventRepo`, `UserRepo`, `MagicTokenRepo`) — don't query models directly from API/logic code. Models: `TriggerRule`, `TriggerAction`, `TriggerRuleLabel`, `TriggeredEvent`, `UserModel`, `MagicTokenModel`. `seed.py` migrates legacy `configurations/event_action.json` into the DB **only when the rules table is empty**.

**Users are persisted** (`users` table: role, custom_permissions JSON, is_active, last_login_at) with magic login tokens in `magic_tokens` (SHA-256 hash only, 7-day expiry, single-use). The `Store` user map is an in-memory **cache**: it is loaded from the DB in the FastAPI lifespan, and every mutation goes through `UserService` (`src/services/users.py`), which writes through to the DB and refreshes live WS permission snapshots. If no active ROOT user exists at startup, one is created and its magic link printed to the console (once per database, not per boot).

## State (`src/store/`)

`Store` is a thread-safe singleton (double-checked locking, separate `RLock`s for units/sensors/users) that is the in-memory source of truth bridging hardware threads and the API. It holds the three units' settings, sensor state (2 motion + 1 sound, initialized in `_init_sensors`), the users cache (DB-backed — see Persistence), and owns the `WebSocketManager` (`store.websocket`). Permission checks go through `store.check_permission(user_id, permission)`.

## Communication & auth

The full realtime contract is documented in **`resources/docs/realtime-architecture.md`** — read it before changing anything in this section.

- **WebSocket `/ws?token=<jwt>`** (`src/api/ws/`) is the primary channel. On connect the endpoint resolves the user (unknown/inactive → close `4001`), registers the connection with the user's effective permissions, then sends an **audience-gated** init sequence: `connected` always, `sensors:init`/`units:init`/`hardware:init`/`events:history`/`trigger_rules:load` each only if the user holds the required permission. Ping/pong heartbeat follows.
- **Commands (client→server)** are validated at runtime against the `InboundMessage` union (`TypeAdapter` in `src/api/ws/endpoint.py`), then dispatched through the **decorator registry** (`src/api/ws/registry.py`): handlers self-register with `@command(Model, Permission)` and are auto-discovered by `load_commands()` (one file per command under `src/api/ws/commands/<domain>/`, no central list). Handlers receive the **validated pydantic model** plus a `CommandContext` (`user`, `msg_id`, `notifier` from `src/api/ws/context.py`) and return a `CommandResult`; the reply echoes the command `id` (request-reply correlation). Pattern: mutate the `Store()`, call `ctx.notifier.notify("<type>", payload)`, return `CommandResult(status="ok")`.
- **Events (server→client)** are **audience-filtered**: each server message model declares its audience with `@server_message(audience=...)` in `src/api/ws/schema/server.py` (the `Permission` required to receive it, `None` = public; feeds `SERVER_MESSAGE_MODELS` + `MESSAGE_AUDIENCE` together so they can't drift). The `WebSocketManager` keeps a per-connection permission snapshot (refreshed on role change, with an `auth:refresh` nudge to the client) and `broadcast` skips connections lacking the audience. Outbound pushes go through `ws_notifier.notify(payload_type, payload)` as before.
- **REST** (`src/api/rest/`) handles auth and CRUD via routers `users`, `auth`, `admin`, `webhooks/chaster`, `trigger_rules`. App-user auth is JWT bearer (HS256, `JWT_SECRET_KEY`): `POST /auth/login` exchanges a **magic token (JSON body)** for a 24 h JWT; `POST /auth/guest` issues a JWT for the ephemeral read-only guest; `GET /auth/me` returns the profile with **effective** permissions. Magic tokens are stored SHA-256-hashed in `magic_tokens`, expire after 7 days, and are single-use. REST authorization uses the **`require_permission(Permission.X)` dependency** (`src/api/helpers/permissions.py`) — including the queue-control endpoints (`/api/queue*`), which are no longer public. The **Chaster webhook (`POST /webhooks/chaster`)** is separate — HTTP Basic auth (`CHASTER_WEBHOOK_USER`/`CHASTER_WEBHOOK_PWD`), parses `action_log.created` payloads, maps them to `TriggerableEvent`s, and calls `dispatcher.dispatch(...)`.
- **Roles & permissions** (`src/typings/enums/`): `Role` (GUEST→USER→OPERATOR→TRUSTED→ADMIN→ROOT) expands to `Permission` sets in `ROLE_PERMISSIONS`. Gate new actions by attaching a `Permission` in the `@command` decorator (WS), a `require_permission` dependency (REST), or a `@server_message(audience=...)` argument (events) rather than checking roles ad hoc.

When a backend change affects the frontend, the contract is the WS `{type, payload}` message — declared in the **`apps/app/src/api/ws/schema/` package** (split into `base` / `models` / `client` / `server`; re-exported flat from `api.ws.schema`). `WS_SCHEMA_VERSION` is sent to clients as `schemaVersion` in the `connected` handshake. After editing the schema, regenerate the TS contracts with `pnpm codegen:ws` (writes `apps/front/src/types/websocket.generated.ts` **and** `auth.generated.ts` with the `Role`/`Permission` enums + `SERVER_MESSAGE_AUDIENCE` — never edit generated files by hand) and keep the frontend reducer mapping in `websocketMiddleware.ts` in sync.

## Frontend (`apps/front/src`)

- **Redux Toolkit** store (`store/index.ts`) with a custom **WebSocket middleware** (`store/middleware/websocketMiddleware.ts`) that owns the single connection: reads the JWT from `localStorage`, builds the URL from `VITE_WS_URL`, manages reconnect + heartbeat, and maps inbound `{type, payload}` messages to slice actions (`units:init`→`unitsInitialized`, `events:triggered`→`eventTriggered`, etc.). Slices: `auth`, `websocket`, `sensors`, `units`, `unitsHistory`, `events`, `triggerRules`, `triggerRuleLabels`. `WebSocketProvider` (`providers/`) wires it into the React tree.
- **Routing** is config-based in `src/routes.ts` (React Router 7): an `app` layout with `units`, `sensors`, `events` (incl. `trigger-rules` new/edit/triggered) and an `admin` section, plus an `auth` route and a catch-all. Shared TS contracts live in `src/types/` (`websocket`, `events`, `units`, `sensor`, `auth`, `api`) — the wire shapes in `websocket.generated.ts` are generated from `apps/app/src/api/ws/schema.py` (run `pnpm codegen:ws`); only transport and local state types are hand-written.
- UI is built with **shadcn/ui** (style `new-york`, base color `neutral`, CSS variables, `lucide` icons — see `components.json` in both `packages/ui` and `apps/front`). Generated primitives (Radix + `class-variance-authority` + `tailwind-merge`) live in `packages/ui/src/components` and are consumed via the `@pes/ui/components` alias; app-specific composites are under `components/common` / `components/layout`. When adding a shadcn component, generate it into `packages/ui` (the shared registry), not into `apps/front`. A custom `@niko-table` registry is also configured. Forms use react-hook-form + zod.
- End-to-end recipe for a new realtime event: add/extend the relevant slice action, handle its `type` in the middleware switch, and add the matching type in `src/types/`.

## Conventions & gotchas

- Backend logging is `structlog` (`logger = structlog.get_logger("pes")`) with bracketed component tags — `[Dispatcher]`, `[Queue]`, `[Executor]`, `[Webhook]`. Match that style and pass structured kwargs.
- The singletons (`Database`, `Store`, `ActionQueue`, `EventDispatcher`, `ActionExecutor`, `ws_notifier`) are the intended DI mechanism; reach them via `get_instance()` / `Store()` / module globals instead of passing instances around.
- IDs use `cuid2` on both sides (backend `cuid_wrapper()`, frontend `@paralleldrive/cuid2`).
- `src/constants.py` contains a hardcoded Windows `DIR_USERDATA` path and the `BT_UNITS` / `MODE_2B` hardware definitions — check it before changing unit/path behavior.
- `estim_bot.py` at the repo root is the legacy single-file original, kept for reference; the maintained code is `apps/app/src`. `apps/app/claudio.md` is an older architecture note and is partly out of date (e.g. it describes a `src/services/` Notifier that isn't in the tree and a lifespan-centric startup) — trust the code over it.
