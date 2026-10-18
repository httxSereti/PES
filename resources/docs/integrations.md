# Integrations

Everything that contributes **events**, **actions** or **settings** to PES is an
integration. They all live under `apps/app/src/integrations/` and are registered
in one `IntegrationRegistry`.

| Id        | Kind     | Events                | Actions                                  | Settings                  |
| --------- | -------- | --------------------- | ---------------------------------------- | ------------------------- |
| `units`   | core     | —                     | `PROFILE`, `LEVEL`, `MULT`               | — (units/hardware pages)  |
| `sensors` | core     | `sensor_*_alarm`      | —                                        | — (sensors page)          |
| `chaster` | external | `chaster_*`           | `CHASTER_TIME_UPDATE`                    | `CHASTER_*` (env, ro)     |

- **core** integrations are built-in hardware: always enabled, cannot be
  disabled/removed. They are thin facades — the hardware code
  (`hardware/units.py`, `hardware/sensors.py`, `events/executor.py`) keeps
  owning its state and safety limits.
- **external** integrations are third-party services: enable/disable,
  credentials, own REST routes, isolated failures.

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
- REST `GET /integrations` (admin) — catalog + settings values, secrets masked.
- REST `GET /api/events/types`, `GET /api/events/action-types` — SAME data the
  frontend uses to render event groups, the events handbook and the action
  dropdowns.

## Settings

- Non-secret values: `configurations/integrations.json`
  (`{"chaster": {"enabled": true, ...}}`), edited from Admin → Integrations.
- Secrets: `config.env`, declared with `SettingDef(source="env")` and shown
  read-only (masked) in the UI.

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
