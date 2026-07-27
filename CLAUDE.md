# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PlunEStim (PES) drives EStim sessions over the internet. It controls hardware **units** (2B DIY boards, up to 6 channels / 3 units over Bluetooth or Serial) and **sensors** (2 motion, 1 sound), integrates with **Chaster** (lock control via webhooks: Pillory, Wheel of Fortune, time/vote events, freeze), and runs a Discord bot. Core mechanic: external **Events** resolve to **Trigger Rules**, which enqueue **Actions** that mutate units, apply profiles, or change the Chaster lock. `README.md` and `apps/app/README.md` document the domain language — MagicNumber operators (`+5`, `-5`, `[5-10]`, `%+5`, `%-[5-10]`) and random selectors for units (`123RO`, `123RM`) and channels (`ABRO`, `ABRM`).

## Monorepo layout

pnpm + Turborepo workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

- `apps/app` — Python backend (FastAPI + Discord bot + hardware I/O). Managed by **uv**, not pnpm.
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

## Backend process model (`apps/app/src/main.py`, ~2000 lines)

`main.py` is a deliberate monolith that runs the entire backend in one process. At import time it instantiates the core singletons in order (`main.py` ~160–244): `Database()` → `Store()` → `EventRegistry(db)` → `ActionExecutor(store, ws_notifier)` → `ActionQueue(executor, ws_notifier)` → `EventDispatcher(registry, action_queue, ws_notifier)`.

The `__main__` block starts **daemon threads** for: each BT sensor (if `ENABLE_BT_SENSORS`), each 2B unit (if `ENABLE_MK2BT`), the software ramp loop, and the API (`uvicorn` on `0.0.0.0:8000`). The **Discord bot (`Bot2b3`, nextcord) runs on the main thread** inside a restart loop; it only grabs `EventDispatcher.get_instance()` for sensor alarms. The **per-second queue tick** (`queue_tick_loop`) is an asyncio task started in the FastAPI `lifespan`, so it runs on the API loop and does not depend on Discord.

So when reasoning about a flow: hardware and the web server live on background threads; the event loop ticking the action queue (and serving `cancel`/`cancel_all`) is the uvicorn API loop; cross-thread → asyncio handoff goes through `WebSocketNotifier` (`call_soon_threadsafe`).

FastAPI `lifespan` (not `__main__`) handles async startup: `ws_notifier.setup(loop)`, start `ws_notifier.consume`, start `queue_tick_loop` (the per-second `ActionQueue.tick()` driver), `db.init()`, create tables, `seed_from_json(db)`, and inject the dispatcher into the Chaster webhook router via `chaster_webhooks.setup(dispatcher)`. CORS is open to all origins. Toggle hardware with `ENABLE_MK2BT` / `ENABLE_BT_SENSORS` flags near the top of `main.py`. Config is loaded from `apps/app/config.env` via `dotenv`.

## Event → Action pipeline (`src/events/`)

This is the heart of PES.

- **`EventDispatcher.dispatch(event_type, event_data, origin)`** (singleton): asks the registry for matching rules, converts each rule's actions into `QueueItem`s, persists a `TriggeredEvent`, broadcasts `events:triggered` over WS, then enqueues. Before consulting DB rules it handles **Wheel-of-Fortune dynamic codes** in `event_data` (e.g. `{p:Jfa}` = profile/level/duration, parsed by `_parse_wof_dynamic_profile`).
- **`EventRegistry.get_rules_for_event(event_type)`**: returns enabled `TriggerRule`s ordered by priority via `TriggerRuleRepo`.
- **`ActionQueue`** (singleton, thread-safe, `threading.Lock`): priority-sorted queue ticked once per second. Per tick it increments `elapsed` on RUNNING items, finalizes expired ones (`duration == -1` means no expiry), then starts work: **only one non-cumulative item runs at a time**, while **all cumulative items run concurrently**. `cancel`/`finalize` call `ActionExecutor.reverse`. Pushes `queue:update` on every state change.
- **`ActionExecutor`**: applies/reverses each `ActionType` — `LEVEL`, `PROFILE`, `MULT`, `CHASTER_TIME_UPDATE` (`src/events/enums.py`). Mutates the `Store` for unit/profile actions or calls the Chaster API for lock-time actions; returns a snapshot used to reverse later.
- **`TriggerableEvent` enum** (`src/events/enums.py`) is the canonical event-type registry: Chaster Pillory (vote/started/ended), shared-link vote add/sub, time add/sub, WOF turned, lock frozen/unfrozen, and sensor sound/position/move alarms. Add new routable events here.

## Persistence (`src/database/`)

Async SQLAlchemy + SQLite at `apps/app/plunes.db` (`sqlite+aiosqlite`, `check_same_thread=False`). `Database` is a singleton (`get_instance()`, or `.session_maker`); all access goes through repositories (`TriggerRuleRepo`, `TriggeredEventRepo`) — don't query models directly from API/logic code. Models: `TriggerRule`, `TriggerAction`, `TriggerRuleLabel`, `TriggeredEvent`. `seed.py` migrates legacy `configurations/event_action.json` into the DB **only when the rules table is empty**.

## State (`src/store/`)

`Store` is a thread-safe singleton (double-checked locking, separate `RLock`s for units/sensors/users) that is the in-memory source of truth bridging hardware threads and the API. It holds the three units' settings, sensor state (2 motion + 1 sound, initialized in `_init_sensors`), the users map, and owns the `WebSocketManager` (`store.websocket`). Permission checks go through `store.check_permission(user_id, permission)`.

## Communication & auth

- **WebSocket `/ws?token=<jwt>`** (`src/api/ws/`) is the primary channel. On connect the server sends `connected`, `sensors:init`, `units:init`, replays the last ~250 events (`events:history`), and loads trigger rules, then runs a ping/pong heartbeat. Inbound commands route through the `HANDLERS` map in `main.py`, each a `(handler_fn, required_permission)` tuple: `core:stop`, `sensors:update`, `units:update_level`, `units:update_mode`, `units:update_power_mode`, `units:update_adj`, `trigger_rules:update`. Handlers live in `src/api/ws/commands/<domain>/`; the established pattern is: import the `Store()` singleton, mutate it, call `ws_notifier.notify("<type>", payload)`, and return `{"status": "ok"}` (or an error dict). Outbound state is pushed via `ws_notifier.notify(payload_type, payload)` — e.g. `units:update`, `queue:update`, `events:triggered`.
- **REST** (`src/api/rest/`) handles auth and CRUD via routers `users`, `auth`, `admin`, `webhooks/chaster`, `trigger_rules`. App-user auth is JWT bearer (HS256, `JWT_SECRET_KEY`): a user logs in with a **magic token** (`POST /auth/login`) and gets an access token used both as the REST `Authorization` header and the WS `?token=` query param. The **Chaster webhook (`POST /webhooks/chaster`)** is separate — it uses HTTP Basic auth (`CHASTER_WEBHOOK_USER`/`CHASTER_WEBHOOK_PWD`), parses `action_log.created` payloads, maps them to `TriggerableEvent`s, and calls `dispatcher.dispatch(...)`.
- **Roles & permissions** (`src/typings/enums/`): `Role` (GUEST→USER→OPERATOR→TRUSTED→ADMIN→ROOT) expands to `Permission` sets in `ROLE_PERMISSIONS`. Gate new actions by attaching a `Permission` in the `HANDLERS` tuple (WS) or a route dependency (REST) rather than checking roles ad hoc.

When a backend change affects the frontend, the contract is the WS `{type, payload}` message — keep the backend `payload_type` strings and the frontend reducer mapping in sync.

## Frontend (`apps/front/src`)

- **Redux Toolkit** store (`store/index.ts`) with a custom **WebSocket middleware** (`store/middleware/websocketMiddleware.ts`) that owns the single connection: reads the JWT from `localStorage`, builds the URL from `VITE_WS_URL`, manages reconnect + heartbeat, and maps inbound `{type, payload}` messages to slice actions (`units:init`→`unitsInitialized`, `events:triggered`→`eventTriggered`, etc.). Slices: `auth`, `websocket`, `sensors`, `units`, `unitsHistory`, `events`, `triggerRules`, `triggerRuleLabels`. `WebSocketProvider` (`providers/`) wires it into the React tree.
- **Routing** is config-based in `src/routes.ts` (React Router 7): an `app` layout with `units`, `sensors`, `events` (incl. `trigger-rules` new/edit/triggered) and an `admin` section, plus an `auth` route and a catch-all. Shared TS contracts live in `src/types/` (`websocket`, `events`, `units`, `sensor`, `auth`, `api`).
- UI is built with **shadcn/ui** (style `new-york`, base color `neutral`, CSS variables, `lucide` icons — see `components.json` in both `packages/ui` and `apps/front`). Generated primitives (Radix + `class-variance-authority` + `tailwind-merge`) live in `packages/ui/src/components` and are consumed via the `@pes/ui/components` alias; app-specific composites are under `components/common` / `components/layout`. When adding a shadcn component, generate it into `packages/ui` (the shared registry), not into `apps/front`. A custom `@niko-table` registry is also configured. Forms use react-hook-form + zod.
- End-to-end recipe for a new realtime event: add/extend the relevant slice action, handle its `type` in the middleware switch, and add the matching type in `src/types/`.

## Conventions & gotchas

- Backend logging is `structlog` (`logger = structlog.get_logger("pes")`) with bracketed component tags — `[Dispatcher]`, `[Queue]`, `[Executor]`, `[Webhook]`. Match that style and pass structured kwargs.
- The singletons (`Database`, `Store`, `ActionQueue`, `EventDispatcher`, `ActionExecutor`, `ws_notifier`) are the intended DI mechanism; reach them via `get_instance()` / `Store()` / module globals instead of passing instances around.
- IDs use `cuid2` on both sides (backend `cuid_wrapper()`, frontend `@paralleldrive/cuid2`).
- `src/constants.py` contains a hardcoded Windows `DIR_USERDATA` path and the `BT_UNITS` / `MODE_2B` hardware definitions — check it before changing unit/path behavior.
- `estim_bot.py` at the repo root is the legacy single-file original, kept for reference; the maintained code is `apps/app/src`. `apps/app/claudio.md` is an older architecture note and is partly out of date (e.g. it describes a `src/services/` Notifier that isn't in the tree and a lifespan-centric startup) — trust the code over it.
