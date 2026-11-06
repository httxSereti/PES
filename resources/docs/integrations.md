# Integrations

Everything that contributes **events**, **actions** or **settings** to PES is an
integration. They all live under `apps/app/src/integrations/` and are registered
in one `IntegrationRegistry`.

| Id         | Kind     | Events           | Actions                    | Settings                  |
| ---------- | -------- | ---------------- | -------------------------- | ------------------------- |
| `units`    | core     | —                | `PROFILE`, `LEVEL`, `MULT` | — (units/hardware pages)  |
| `sensors`  | core     | `sensor_*_alarm` | —                          | — (sensors page)          |
| `training` | core     | `training_*` (9) | `TRAINING_*` (7)           | —                         |
| `chaster`  | external | `chaster_*`      | `CHASTER_TIME_UPDATE`      | `CHASTER_*` (env, ro)     |
| `puryfi`   | external | `puryfi_*` (17)  | `PURYFI_*` (6)             | thresholds, port, secrets |

### Training (edging sessions)

The `training` integration exposes the training session events plus seven
one-shot actions so a trigger rule can drive the module: `TRAINING_START`
(template or program), `TRAINING_PAUSE`, `TRAINING_RESUME`, `TRAINING_END`,
`TRAINING_NEXT_PROGRAM_STEP`, `TRAINING_RECORD_EDGE` and
`TRAINING_STOP_AND_NEUTRALIZE`. They act as the `system` actor and target the
running session unless the payload names a session id.

Actions emitted by these handlers are one-shot: the dispatcher runs them once
and finalizes them on the next queue tick. `TRAINING_RECORD_EDGE` is ignored on
training-origin events, and every training event emitted by an action is tagged
as a local echo so re-entrant `TRAINING_*` actions are skipped.

Guided sessions can opt into hardware automation (`guided_config`): a profile
is applied at start, stepped up per phase, lowered after each edge, and
rewarded/punished on success/failure. The automation profile is a normal queue
item, so `units:stop` and `neutralize_all()` always override it, and the level
ceiling is capped at 100%. Programs may define whole-program goals and an
optional reward profile: completing every step and goal emits
`training_program_completed` and applies the reward through the same queue
mechanism. Sessions default to private; `visibility=everyone` exposes them to
every authenticated training reader, including guests.

### PuryFi (browser blocker)

Unlike Chaster, PuryFi **connects to PES**: the integration opens a WebSocket
server (`ws://127.0.0.1:8088` by default) and speaks the PuryFi plugin
protocol (msgpack, `ready` handshake, intents). Setup:

1. In PuryFi's options → Plugins → register a WebSocket plugin with the URL
   shown in the integration drawer (`ws://localhost:8088` by default, with a
   copy button).
2. Grant the requested intents when PuryFi asks (they appear in the options).

The integration subscribes to media scans (`staticMediaScan`) and to
`enabled` / `wblistConfiguration` state, and polls `lockConfiguration` every
`lock_poll_seconds` to emit lock events (the SDK cannot subscribe to null
lock paths). Detection events are per category (`puryfi_genitals_detected`,
`puryfi_breasts_detected`, …) with `min_score_pct`, `min_objects`,
`cooldown_seconds` and `include_covered` settings.

Lock actions share one source of truth: `PURYFI_SET_LOCK` applies the
`lock_password` setting, and `PURYFI_ENTER_LOCK_PASSWORD` reuses the same
setting, so the password used to create a lock always matches the unlock
password. `PURYFI_EMERGENCY_UNLOCK` likewise reads `emergency_token`.

Censor hooks (`mediaCensorHookRequest`) are answered with `pass` — PES never
intercepts images.

- **core** integrations are built-in hardware: always enabled, cannot be
  disabled/removed. They are thin facades — the hardware code
  (`hardware/units.py`, `hardware/sensors.py`, `events/executor.py`) keeps
  owning its state and safety limits.
- **external** integrations are third-party services: enable/disable,
  credentials, own REST routes, isolated failures.

Disabling an external integration is a global kill switch: its events no
longer trigger rules, its actions are skipped, and waiting actions are
canceled. Per-event and per-action switches stay stored and editable while the
integration is disabled.

Actions that change an integration's own state (PuryFi lock/state updates,
Chaster time updates, training session transitions) tag the resulting events
as local echoes. The dispatcher skips actions from that same integration for
those echoes and caps the causation chain, so a rule cannot feed back into
itself indefinitely.

Event history and live event payloads are sanitised: sensitive keys in action
payloads and event data (`password`, `secret`, `token`, `api_key`, …) are
replaced before storage and broadcast, and older rows are redacted again when
read.

## The registry

`integrations/registry.py` is the single source of truth:

- `events()` / `get_event(id)` — trigger rule sources + validation
- `actions()` / `get_action(id)` — action metadata + queued-action handlers
- `settings_values()/set_settings()`, `is_enabled()/set_enabled()`
- `catalog()` / `catalog_entry()` — JSON consumed by REST/WS/UI
- `routers()` — REST routers mounted by `api/app.py`
- `start(ctx)` / `stop()` — lifecycle, driven by the FastAPI lifespan

The executor delegates any action whose `ActionDef` has a `handler` (e.g.
`CHASTER_TIME_UPDATE` → `integrations/chaster/actions.py`); core hardware
actions keep their implementation in `events/executor.py`.

## Catalog surfaces

- WS `integrations:load` (on connect) / `integrations:update` (broadcast),
  client command `integrations:update` — see `api/ws/schema/`.
- REST `GET /integrations` (admin) — catalog + settings values (env-backed
  secrets masked; JSON-backed secrets are editable).
- REST `GET /api/events/types`, `GET /api/events/action-types` — SAME data the
  frontend uses to render event groups, the events handbook and the action
  dropdowns.

## Settings

- JSON-backed values (`source="json"`): `configurations/integrations.json`
  (`{"chaster": {"enabled": true, ...}}`), edited from Admin → Integrations.
  JSON-backed secrets (`secret=True`) are edited there too and rendered as
  password fields.
- Env-backed values (`source="env"`): `config.env`, shown read-only (masked)
  in the UI.

## Adding an integration

1. Create `integrations/<id>/` with `integration.py` subclassing `Integration`
   (declare `id`, `name`, `kind`, and `events()/actions()/settings()`).
2. Add an `ActionHandler` only for actions PES should execute for it.
3. Add `router()` if it receives HTTP (e.g. webhooks).
4. Register the instance in `integrations/__init__.py::build_default_registry()`.
5. If it introduces a new action id, add it to `ActionType` (`events/enums.py`)
   and a form section in
   `apps/front/src/components/common/events/trigger-rules/form/trigger-rule-action-fields.tsx`.
6. Run `pnpm codegen:ws` if the WS contract changed, then lint/typecheck.

Events and actions declared in step 1 show up automatically in the UI catalog
(event groups, handbook, action dropdown, Integrations page).
