# Events & Trigger Rules — Bug and Feature Backlog

Static review of the event pipeline and trigger-rule system:

- `apps/app/src/events/` — dispatcher, registry, queue, executor, models
- `apps/app/src/database/repositories/trigger_rule_repo.py`
- `apps/app/src/api/ws/commands/trigger_rules/`
- `apps/app/src/api/rest/trigger_rules.py`
- integration event sources and action handlers (`chaster`, `puryfi`, sensors, units)
- event history and WebSocket replay

No runtime testing was performed for the original review. Status reflects the current codebase.

## Status legend

- **Open** — still present.
- **Verify** — likely a bug, but depends on third-party payloads or intended behavior.
- **Fixed** — addressed in the current tree.

## Event flow snapshot

1. An integration or sensor calls `EventDispatcher.dispatch(...)`.
2. `EventRegistry` loads enabled `TriggerRule`s for the event type.
3. Each enabled action becomes a `QueueItem` (`priority`, `duration`, `cumulative`).
4. `ActionQueue.tick()` runs once per second on the API event loop.
5. `ActionExecutor` applies hardware actions or delegates to integration handlers.
6. Every event is persisted to `triggered_events` and broadcast over WebSocket.

---

## Bugs and risky behavior

### P0 — safety / correctness

#### 1. PuryFi unlock actions always fail — Open

- **Where:** `apps/app/src/integrations/puryfi/actions.py`, `EnterLockPasswordHandler` and `EmergencyUnlockHandler`.
- **Problem:** Both call `self._integration.settings().get(...)`, but `PuryFiIntegration.settings()` returns `list[SettingDef]`, not a dict. `.get()` therefore raises `AttributeError`.
- **Impact:** `PURYFI_ENTER_LOCK_PASSWORD` and `PURYFI_EMERGENCY_UNLOCK` never run. The queue catches the exception, logs it, and drops the item.
- **Fix:** use `self._integration.settings_values().get(...)`.
- **Related:** `PURYFI_SET_LOCK` stores its password in the rule payload, while unlock actions read the `lock_password` setting. These can be different passwords; unify the secret source.

#### 2. Emergency stop paths can be undone — Open

- **Where:** `api/ws/commands/units/handle_stop.py`, `api/ws/commands/core/handle_stop.py`, `services/session.py`, `events/executor.py`.
- **Problems:**
  - `units:stop` stops ramps and zeroes channels but does not cancel running queue items. A running profile with `ramped` fields is restored unconditionally at expiry, potentially raising the channel again after the user stopped the unit.
  - `core:stop` cancels the queue but does not stop manual ramps. The ramp thread continues ticking and can re-raise levels.
  - `end_session` zeroes `ch_A`/`ch_B` but does not stop manual ramps.
  - App shutdown cancels tasks and closes the DB but does not cancel the queue, stop ramps, or explicitly zero outputs. Whether the 2B goes quiet depends on link-loss behavior.
- **Fix:** create one “neutralize everything” path that cancels the queue, stops all ramps, resets multipliers, zeros channels, and clears the active profile. Use it from session end, shutdown, and panic stop. Make `units:stop` cancel queue items targeting that unit.

#### 3. Rule create/edit was not atomic — Fixed

- **Where:** `database/repositories/trigger_rule_repo.py`, `api/ws/commands/trigger_rules/handle_trigger_rule_create.py`, `handle_trigger_rule_edit.py`.
- **Original problem:** The edit handler updated the rule, deleted all actions, then recreated them one by one. A failure left the rule with missing or partial actions. Create had the same risk.
- **Current implementation:**
  - `TriggerRuleRepo.create_rule_with_actions(...)` writes the rule, event links, actions, and labels in one transaction.
  - `TriggerRuleRepo.replace_rule_with_actions(...)` updates the rule and fully replaces actions/labels in one transaction.
  - Old actions and event links are flushed as deleted before new rows are inserted, preventing composite-PK collisions for re-selected event types.
  - Both WS handlers now use these methods.
  - `_resolve_labels(...)` is shared with `set_labels_for_rule(...)`.
  - `update_rule(...)` also flushes event-link deletes before inserting replacements.
- **Verification:** throwaway SQLite tests covered create, replace, overlapping event-type replacement, label reuse, and forced create/replace failures; rollback preserved the previous state.

#### 4. Missing migration for `triggered_events.session_id` — Fixed

- **Where:** `database/models/triggered_event.py`, `database/connection.py::ensure_schema`.
- **Problem:** `session_id` was added after the original schema, but `ensure_schema()` only added `sessions.integration_ids`. Existing databases would not get the column or its index.
- **Impact:** event saves and session-history queries would fail on upgraded installations.
- **Current implementation:** `ensure_schema()` now checks `PRAGMA table_info(triggered_events)`, adds the nullable `session_id VARCHAR` column when missing, and creates `ix_triggered_events_session_id` idempotently.
- **Verification:** tested against a synthetic old schema (missing column and index) and a fresh schema, running `ensure_schema()` twice.

#### 5. Disabling an integration does not consistently disable its events/actions — Fixed

- **Where:** `integrations/registry.py`, `events/dispatcher.py`, `events/executor.py`, `events/queue.py`, `integrations/puryfi/integration.py`.
- **Problem:** `is_event_enabled()` and `is_action_enabled()` only checked per-item toggles; they did not check whether the owning integration was enabled.
- **Impact:**
  - PuryFi started unconditionally and `_dispatch()` never checked `is_enabled`. A disabled PuryFi could still fire rules.
  - Chaster’s webhook checked `is_enabled`, so behavior was inconsistent.
  - A sensor-triggered rule could still execute a Chaster/PuryFi action while that integration was disabled.
  - Actions already waiting in the queue still ran after their integration was disabled.
- **Current implementation:**
  - `is_event_enabled()` and `is_action_enabled()` now return the effective state: owning integration enabled **and** per-item switch on.
  - New `is_event_toggled()` / `is_action_toggled()` methods keep the catalog’s per-item switches independently configurable while an integration is globally disabled.
  - PuryFi suppresses its event dispatch at the source when disabled.
  - `dispatch_direct()` now respects the event-level enabled state.
  - The action queue re-checks the action at claim time and cancels waiting items whose integration/action was disabled, rather than applying them.
- **Note:** PuryFi’s WebSocket client remains connected while disabled, but it no longer emits events or executes queued actions.
- **Verification:** tested effective vs. per-item state and catalog output, PuryFi dispatch suppression, direct-dispatch gating, and queue cancellation/retention for disabled vs. enabled actions.

#### 6. No feedback-loop protection — Fixed

- **Where:** `integrations/puryfi/integration.py`, `integrations/puryfi/actions.py`, `integrations/chaster/actions.py`, `integrations/chaster/webhooks.py`, `events/dispatcher.py`, `events/models.py`.
- **Problem:** integration actions could generate the events that trigger them. PuryFi lock polling dispatches `puryfi_lock_time_added` after its own timer changes, so a rule on that event that calls `PURYFI_SET_LOCK_TIMER` could loop. Chaster time actions had the same risk if Chaster emitted an action-log webhook for API time changes.
- **Current implementation:**
  - Added `integrations/echo_guard.py`, a bounded, TTL-based queue of expected local-action echoes carrying causation depth.
  - PuryFi action handlers register the state/lock/wblist events their action may cause. PuryFi event dispatch consumes the expectation and tags the event with `chain_depth` and `source_integration_id="puryfi"`.
  - Chaster time updates register an expected `time_changed` echo before sending the API request. The webhook consumes it and tags the event with `chain_depth` and `source_integration_id="chaster"`.
  - Dispatcher events now carry an optional causation chain. Actions belonging to the integration that caused an echo are skipped, so the feedback edge is removed while cross-integration reactions can still run.
  - A hard chain-depth cap (`8`) stops longer cross-integration cycles; rule-driven events are still recorded, but no further actions are queued.
  - `QueueItem.causation_depth` propagates the chain through asynchronous actions.
- **Trade-off:** a legitimate external change in the same short suppression window can be treated as a local echo. The TTL bounds this, and the same-integration action filter is only applied to tagged echoes.
- **Verification:** tested `EchoGuard` counts/TTL, PuryFi action → echo tagging, Chaster action → webhook echo tagging, same-integration action filtering, and the chain-depth cap.

#### 7. Secrets leak into event history and live broadcasts — Fixed

- **Where:** `events/redaction.py`, `events/dispatcher.py`, `api/ws/websocket_notifier.py`, `services/session.py`, `integrations/base.py`, `integrations/puryfi/integration.py`.
- **Problem:** `_build_rule_summary()` copied the full action payload into `triggered_events` and the `events:triggered` WS message. `PURYFI_SET_LOCK` could contain a legacy plaintext `password`. `READ_EVENTS` is granted to the normal `USER` role, while trigger rules require `ADMIN`.
- **Impact:** regular users could see lock passwords or other action secrets in history and the live event feed.
- **Current implementation:**
  - Added `events/redaction.py` with recursive key-name redaction (`password`, `secret`, `token`, `api_key`, …) and support for action-declared `secret_fields`.
  - Added `ActionDef.secret_fields`; `PURYFI_SET_LOCK` declares `password` for legacy rules.
  - Dispatcher summaries redact action payloads before persistence and broadcast.
  - Event `event_data` is redacted before persistence and broadcast as well.
  - History read paths (`websocket_notifier.send_history`, `services.session.serialize_event`) redact existing rows before sending them to clients, so older records do not leak either.
- **Note:** existing rows still contain their original stored values; they are sanitised on read. A future data migration can rewrite those rows permanently.
- **Verification:** tested generic and declared-field redaction, nested/list payloads, dispatcher summaries, write-path persistence/broadcast, and history read-path serialization.

### P1 — important

#### 8. LEVEL reversal drifts; MULT is not reversible at all — Open

- **Where:** `events/executor.py`.
- **Problems:**
  - LEVEL snapshots store a `diff` and reversal adds it to the current value. If something changed the level after the action, reversal produces the wrong value.
  - MULT has no snapshot and `reverse()` does nothing for it, even though a duration can be supplied. A “timed” MULT action is misleading and permanently changes the multiplier.
  - MULT has no clamp; repeated actions can produce extreme or negative multipliers. Session end only zeros `ch_A`/`ch_B`, not multipliers.
- **Fix:** store before/applied values per field and restore conditionally, or use field ownership. Either make MULT reversible with clamping, or reject durations for non-reversible actions server-side and document the behavior.

#### 9. The queue tick can be stalled by slow handlers — Fixed

- **Where:** `events/queue.py`, `events/models.py`, `services/neutralize.py`, `integrations/chaster/actions.py`.
- **Problem:** `tick()` awaited `_start_item()` → `executor.apply()` inline. A slow integration handler, especially Chaster HTTP without an explicit timeout, blocked finalization/reversal of unrelated level/profile actions. Duration was counted in tick iterations, so loop stalls extended every running action.
- **Current implementation:**
  - `tick()` no longer awaits handlers. Apply and reverse operations run in tracked background `asyncio` tasks; the tick only performs state transitions and scheduling.
  - Durations use `time.monotonic()` deadlines. `elapsed` is recomputed from the monotonic clock, and expiry works even if the tick loop is delayed.
  - Duration starts when `apply()` completes, so a slow handler does not consume the configured action duration.
  - Apply and reverse handlers have bounded timeouts (60s / 30s), and Chaster HTTP uses a 30s `aiohttp` timeout.
  - `cancel_inflight()` cancels outstanding handler tasks during neutralization/shutdown, preventing a late apply from undoing a stop.
  - Background tasks are tracked until completion and their unhandled failures are logged.
- **Trade-off:** a timed action whose apply is still in flight is shown as RUNNING with elapsed `0` until the apply completes and its deadline starts.
- **Verification:** tested slow apply and slow reverse handlers (tick returns immediately), monotonic elapsed, expiry finalization, cancel-during-apply, `cancel_inflight`, apply timeout, and disabled-action skipping.

#### 10. Server-side payload/event validation is missing — Open

- **Where:** `api/ws/schema/client.py`, trigger-rule WS handlers, `events/executor.py`.
- **Problem:** `TriggerActionDraft.payload` is `dict[str, Any]`; the server only checks the action enum. Catalog `payload_schema` values are documentation only.
- **Impact:**
  - A PROFILE action whose `units` is a string instead of a list is treated as “apply all units”.
  - Invalid LEVEL units/channels silently decode to `[]`, so the rule appears to run but changes nothing.
  - Empty action lists are allowed server-side.
  - Values such as `"false"`, strings where integers are expected, or malformed ranges can fail at execution time.
- **Fix:** validate payloads against the action catalog at create/edit and again at dispatch; reject empty action lists and invalid duration/type combinations.

#### 11. Wheel of Fortune custom codes also fire the generic WOF event — Verify

- **Where:** `integrations/chaster/webhooks.py`, WOF branch.
- **Problem:** A custom profile/unit code dispatches `custom:...`, then the code falls through to the unconditional `CHASTER_WOF_TURNED` dispatch. A custom WOF action can therefore trigger both the direct action and any generic WOF rule.
- **Fix:** confirm intent; if the generic event is only for non-text/plain segments, move the generic dispatch into that branch.

#### 12. Custom WOF actions bypass session integration scoping — Open

- **Where:** `events/dispatcher.py::_session_allows_event`, `integrations/chaster/webhooks.py`.
- **Problem:** `_session_allows_event()` returns `True` when the event has no owning integration. `custom:wof_profile_*` has no owner, so it runs even when the active session excludes Chaster.
- **Fix:** pass the owning integration ID for direct dispatches, or explicitly check Chaster membership before dispatching custom WOF events.

#### 13. Action `sort_order` is effectively ignored — Fixed

- **Where:** `database/models/trigger_rule.py`, `database/repositories/trigger_rule_repo.py`.
- **Problem:** `TriggerRule.actions` had no `order_by`. Both the dispatcher and loader used `rule.actions` directly; the only sorted query, `TriggerRuleRepo.get_actions_for_rule`, was unused.
- **Impact:** execution and display order was de facto row order, not the order configured in the UI.
- **Current implementation:**
  - `TriggerRule.actions` now has a relationship-level `order_by` using `sort_order`, then `created_at`, then `id` as a deterministic tie-breaker.
  - `TriggerRuleRepo.get_actions_for_rule` uses the same ordering.
  - Dispatcher and loader consume `rule.actions`, so they now get the configured order automatically.
- **Verification:** created actions with mixed and duplicate `sort_order` values and confirmed the relationship loads them in the expected deterministic order.

#### 14. Session event history returns the oldest 500, not the latest — Fixed

- **Where:** `database/repositories/triggered_event_repo.py`.
- **Problem:** `get_by_session` ordered ascending with `limit=500`.
- **Impact:** long sessions hid their most recent events.
- **Current implementation:**
  - `get_by_session` selects the latest `limit` events in descending order (with `triggered_at`/`id` tie-breakers), then reverses the result for chronological display.
  - `get_recent` now uses the same deterministic tie-breakers for replay consistency.
- **Verification:** inserted five session events and confirmed a limit of three returns the latest three in chronological order.

#### 15. Queue timestamps are local time but serialized as UTC — Open

- **Where:** `events/dispatcher.py`, `events/models.py`, `events/queue.py`, `utils/datetime_utils.py`.
- **Problem:** queue items use naive `datetime.now()`, while `to_utc_iso()` assumes naive datetimes are UTC.
- **Impact:** on a non-UTC machine, queue/pending timestamps are shifted by the local offset.
- **Fix:** use `datetime.now(UTC)` consistently for queue item timestamps.

#### 16. Event persistence happens before enqueueing, so a DB failure drops the action — Open

- **Where:** `events/dispatcher.py::dispatch`, `hardware/sensors.py::sensor_alarm_check`.
- **Problem:** the event is saved before `queue.enqueue()`. If SQLite is locked or the insert fails, the hardware action never runs. Sensor alarm markers are advanced before dispatch, so the sensor event will not retry.
- **Fix:** make history persistence best-effort relative to enqueueing, or stage both in a retryable pipeline. Add retries around SQLite writes.

#### 17. Channel decoder accepts commas — Open

- **Where:** `events/executor.py::_decode_channels`.
- **Problem:** the regex uses `[A,B]+` and `list(ch_arg)`. `"A,B"` becomes `["A", ",", "B"]`, and `update_unit_dict()` adds a bogus `ch_,` field.
- **Fix:** use `[AB]+` and reject unknown channel characters explicitly.

#### 18. `chaster_pillory_vote` is advertised but never dispatched — Verify

- **Where:** `events/enums.py`, `integrations/chaster/integration.py`, `integrations/chaster/webhooks.py`.
- **Problem:** the event exists in the enum/catalog, but no webhook branch dispatches it.
- **Impact:** users can create rules that never fire.
- **Fix:** implement the Chaster action-log branch for pillory votes or remove the event from the catalog.

#### 19. Legacy seed creates rules for event names that no longer exist — Open

- **Where:** `database/seed.py`, `configurations/event_action.json`.
- **Problem:** the seed uses the JSON key as `event_type`. The legacy file uses `position`, `move`, `sound`, `vote`, `vote_sub`, while current event IDs are `sensor_position_alarm`, `sensor_move_alarm`, `sensor_sound_alarm`, `chaster_vote_add/sub`.
- **Impact:** on a fresh install, most seeded rules never match.
- **Also:** the legacy `wait` field is ignored and every seeded action is written with `cumulative=False`.
- **Fix:** map legacy event names to current IDs and translate `wait` to `cumulative`.

### P2 — smaller issues

- `pause()` stops tick updates, so the visible `elapsed` field is stale until resume; monotonic timers continue underneath and items may expire immediately on resume.
- `dispatch_direct()` returns before persisting/broadcasting when every action is disabled, contradicting its docstring.
- Deleting a session does not delete its `triggered_events`; there is no FK/cascade and no retention job.
- `EventRegistry` logs a warning for every event with no matching rule, which can spam logs for high-frequency events.
- Chaster webhook credentials default to `sereti` / `password` when env vars are missing. Require explicit configuration and consider signature/IP verification.
- Chaster webhook retries have no idempotency/dedupe; `requestId` is only embedded in `origin`.
- Rule create/edit catches only `KeyError`; DB or `ValueError` failures can still surface as unhandled errors.
- Editing a rule deletes and recreates action IDs, so `triggered_events.triggered_rules[].action_id` can reference rows that no longer exist.
- The queue is unbounded, and a permanent (`duration=-1`) non-cumulative action blocks every later non-cumulative action indefinitely.
- All matching rules fire; priority is only queue ordering, not “first match wins” or exclusivity.
- Actions in one rule are independent queue items, so a rule’s actions are not applied atomically.
- Actions and ramps have no field-level locking: a running ramp can overwrite a LEVEL action, and a profile can fight a manually started ramp.
- There is no test suite covering the queue state machine or rule engine.

---

## Feature ideas

### Rule engine

- **Conditions / guards** on `event_data`, session, role, current unit state, and time.
  - Examples: `sensor_id == motion1`, `duration > 0`, `author == keyholder`, `only during active session`, `active usage == chastity`.
- **Cooldowns and rate limits** per rule, event, session, or user.
  - Examples: “max 3 triggers per hour”, debounce bursts, minimum time between fires.
- **Deduplication / idempotency** using Chaster `requestId`, an event hash, or a per-source key.
- **Configurable loop protection**: expose the echo-suppression TTLs, expectation counts, and chain-depth cap per integration/rule instead of using built-in defaults.
- **Exclusive rule groups / stop-on-match**: let priority mean “first matching rule wins” when desired.
- **Sequences and counters**: “event A followed by event B within 60 seconds”, “third vote in this session”.
- **Scheduled/time windows**: only fire on certain days/hours, or add a time-based trigger event.
- **Rule testing and dry-run**: simulate an event against current state, show matched rules and queued actions, without touching hardware.
- **Rule import/export and templates**, plus version history and an audit log of changes.
- **Per-rule “only during session” toggle**.
- **Per-rule execution history**: last fired, next expiry, failure count, and resolved magic-number values.

### Safety and reliability

- **Persist the queue and snapshots** so a restart can recover or explicitly neutralize running actions.
- **Startup and shutdown neutralization**: zero channels, stop ramps, reset multipliers, clear active profiles.
- **Cancel by unit, rule, or session**, not just by queue item ID or “cancel all”.
- **Global panic stop** that cancels the queue, stops every ramp, resets multipliers, and zeros outputs in one operation.
- **Action timeouts, retries, and a dead-letter queue** for Chaster/PuryFi network failures.
- **Field ownership/locking** so ramps, profiles, and level actions cannot silently overwrite each other.
- **Hard caps**: max concurrent actions, max queue length, max multiplier, max event rate.

### Action model

- **Atomic rule actions**: apply all actions of a rule as one group, or explicitly support “run together” vs “run in sequence”.
- **Start delay** in addition to duration.
- **Reversible/non-reversible enforcement server-side**: reject `duration` on non-reversible actions, or define explicit semantics.
- **Action result tracking**: success/failure, latency, snapshot ID, and a live queue timeline in the UI.
- **Secret references**: PuryFi password/token fields should reference settings, not store plaintext in rule payloads or history.
- **Action priorities inside a rule** with explicit ordering.

### Events and observability

- **Typed event schemas** with runtime validation, not just documentation strings.
- **Richer sensor payloads**: sensor ID, alarm count, measured value, threshold. Today sensor events have empty `event_data`, so rules cannot distinguish sound/motion1/motion2.
- **More lifecycle events**: session started/ended, queue empty, action completed/failed, unit disconnected/low battery, ramp finished.
- **Complete Chaster coverage**: pillory votes, task votes, shared-link vote details.
- **History UX**: filters by event/rule/session/date, pagination, retention configuration, export, per-rule stats.
- **Rule diagnostics**: “why did this rule not match?” and the resolved value before applying.
- **Metrics/tracing**: events per second, rule match rate, queue wait time, action failure rate, DB write latency.

### Architecture

- **Cache enabled rules with invalidation** instead of querying the DB on every event.
- **Generate action/event enums from the integration registry** instead of maintaining a hardcoded `ActionType`.
- **Move the event pipeline to a worker/queue** so HTTP handlers and sensor loops do not wait on DB writes or SQLite locks.
- **Enable SQLite WAL + busy timeout** and consider a single writer for event persistence.
- **Redact secrets in all event/WS payloads** and consider encrypting JSON-backed secrets.
- **Split rule creation into a service layer** if rule composition keeps growing; the repository now owns the transaction, but orchestration/validation may belong above it.

---

## Suggested fix order

1. PuryFi unlock/emergency-unlock bug and unified password source.
2. Emergency-stop/shutdown safety cluster: cancel queue + stop ramps + reset multipliers + zero channels.
3. Payload schema validation for trigger-rule actions and events.
4. Level reversal correctness and MULT clamp/reversal semantics.
5. Fix WOF double dispatch and custom-WOF session scoping.
6. Correct queue timestamps and legacy seed mappings.
