# AGENTS.md

Guidance for AI agents working in this repository.

## Project Overview

**PlunEStim (PES)** is software for running EStim (electro-stimulation) sessions, locally or remotely. It controls DIY 2B EStim boards (up to 3 units / 6 channels) over Bluetooth/Serial, reads BT sensors (motion, noise), and integrates with third-party services (Chaster) to trigger actions from events.

Core domain model (see `README.md` and `resources/docs/` for details):

- **Events** — things that happen (Chaster pillory votes, sensor motion/noise, ...).
- **Trigger Rules** — rules bound to events that produce one or more **Actions**.
- **Actions** — consequences applied to units/channels (intensity/multiplier updates, profile apply, Chaster lock time changes).
- **MagicNumbers** — value expressions used in actions (`5`, `+5`, `-5`, `[5-10]`, `%+5`, `%-[5-10]`, `RO`/`RM` randomness suffixes).

## Repository Layout

Hybrid monorepo: **pnpm workspaces + Turbo** (JS/TS) and **uv workspace** (Python).

- `apps/app` — Python 3.12 backend (`pes-bot`). FastAPI REST + WebSocket server on port **8000**, hardware threads (BT units, sensors), SQLite database (`plunes.db` via SQLAlchemy + aiosqlite), event pipeline. Entry point: `src/main.py`.
- `apps/front` — React 19 frontend. React Router 7 (framework mode) + Vite 5, Tailwind CSS 4, Redux Toolkit, react-hook-form + zod. Talks to the backend via REST (`VITE_API_URL`) and WebSocket (`VITE_WS_URL/ws`).
- `packages/ui` — `@pes/ui`, shared component library (Radix UI / shadcn-style, Tailwind). Exported via subpath exports (`./components/*`, `./hooks/*`, `./lib/*`, `./globals.css`).
- `packages/eslint-config` — `@pes/eslint-config`, shared ESLint flat configs (`base.js`, `vite.js`, `react-internal.js`, `next.js`).
- `packages/typescript-config` — `@pes/typescript-config`, shared `tsconfig` presets.
- `resources/docs` — domain documentation (events flow, app flow, Chaster integration, realtime architecture).

## Common Commands

Run from the repo root unless noted otherwise.

| Task | Command |
|---|---|
| Install JS deps | `pnpm install` |
| Install Python deps | `uv sync` (or `cd apps/app && uv sync`) |
| Dev (all apps via Turbo) | `pnpm dev` |
| Backend only | `cd apps/app && uv run src/main.py` (or `pnpm --filter app dev`) |
| Frontend only | `pnpm --filter front dev` |
| Build | `pnpm build` |
| Lint (all) | `pnpm lint` |
| Lint backend only | `cd apps/app && uv run ruff check .` |
| Typecheck frontend | `pnpm --filter front typecheck` (runs `react-router typegen` first) |
| Typecheck backend | `cd apps/app && uv run mypy src` |
| Format TS/MD | `pnpm format` (Prettier) |
| Regenerate WS/Auth TS types | `pnpm codegen:ws` |
| Check workspace package hygiene | `pnpm pkg:check` / `pnpm pkg:fix` |

There is currently **no test suite** — do not invent test commands; verify changes with lint, typecheck, and manual runs.

## Architecture Notes

### Backend (`apps/app/src`)

- `main.py` is the **composition root**: instantiates singletons in order — `Database` → `Store` → `EventRegistry` → `ActionExecutor` → `ActionQueue` → `EventDispatcher` — then starts daemon hardware threads (one per BT unit/sensor) and runs uvicorn on the main thread.
- `api/rest/` — FastAPI REST routers (`auth`, `users`, `admin`, `trigger_rules`, `webhooks/`).
- `api/ws/` — WebSocket layer: `schema/` (pydantic message contracts, **source of truth**), `commands/`, `loaders/`, `registry.py`, `websocket_manager.py`.
- `events/` — the event pipeline: `dispatcher.py`, `registry.py`, `queue.py`, `executor.py`, `models.py`, `enums.py`.
- `hardware/` — `units.py` (2B board BT comms), `sensors.py`, `ramp.py`. Hardware threads always run and idle when their device is disabled in the Store; devices are toggled at runtime via WS `hardware:*` commands (persisted in `configurations/hardware.json`).
- `database/` — SQLAlchemy setup: `connection.py`, `models/`, `repositories/`, `seed.py`.
- `store/` — in-memory runtime `Store` singleton (live device/session state).
- `typings/` — shared enums (`Role`, `Permission`) and Chaster types.
- Config: `config.env` (env vars, loaded via dotenv), `configurations/*.json` (hardware, BT sensors). `constants.py` contains a hardcoded Windows `DIR_USERDATA` path — be careful when editing for portability.

### Frontend (`apps/front/src`)

- Routes are declared explicitly in `src/routes.ts` (React Router framework mode, no file-based routing).
- `store/` — Redux Toolkit slices; the WebSocket client lives in `store/index.ts`.
- `types/*.generated.ts` — **generated files, do not edit by hand** (see below).
- UI components come from `@pes/ui`; app-specific components live in `src/components/`.

### Type codegen (important)

`apps/front/src/types/websocket.generated.ts` and `auth.generated.ts` are generated from the Python pydantic schema (`apps/app/src/api/ws/schema.py`) and `src/typings` enums by `apps/app/scripts/generate_ws_types.py`.

- After changing the WS schema or Role/Permission enums, run `pnpm codegen:ws`.
- Use `--check` to fail if generated files are stale.
- Never hand-edit `*.generated.ts`.

## Conventions

- **Python**: 3.12 (pinned `==3.12.6`), managed by **uv** (not pip/poetry). Lint with Ruff, typecheck with mypy (`check_untyped_defs = true`). Backend imports are rooted at `src/` (e.g. `from api.app import app`).
- **TypeScript**: strict, 4-space indentation, ESM (`"type": "module"`), React 19. Prettier formats `**/*.{ts,tsx,md}`.
- **Package naming**: internal packages are scoped `@pes/*` and referenced as `workspace:*`.
- **Package manager**: pnpm 10 (pinned via `packageManager`); Node >= 20. Use `pnpm --filter <name>` to target a workspace. Keep `package.json` files consistent — CI hygiene is enforced with `manypkg` (`pnpm pkg:check`).
- New shared UI components go in `packages/ui`, not in `apps/front`, when more than one app could use them.
- Git commits/PRs: follow the existing style; do not commit `config.env`, `plunes.db`, `log.txt`, `userdata/`, or other local runtime artifacts.

## Safety Notes

- This software drives **physical hardware** (EStim units). Be conservative when touching `hardware/`, the action `executor`, or intensity/multiplier logic — a bug has physical consequences. Flag risky changes to the user rather than silently refactoring.
- Bluetooth code is platform-sensitive and the project is developed on **Windows**; avoid assuming Linux-only APIs.
