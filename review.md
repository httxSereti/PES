# Code Review — PlunEStim

**Scope:** core backend (`apps/app/src` — `main.py` in full, the `events/` pipeline, `store`, DB layer, WS/REST API, auth) and the frontend WebSocket middleware.

**Stated assumptions:** single-instance, self-hosted app on a private network with a handful of users; correctness matters a lot because software bugs translate into *physical* hardware behavior; no horizontal-scale requirement.

---

## Overall assessment

This is a working prototype in the middle of a half-finished architectural migration, and it shows: the new event pipeline (`events/`) is genuinely well-constructed, but it coexists with a legacy global-state path (`threads_settings`) that is still what the Discord bot and software ramp actually write to — meaning several user-facing features are silently no-ops. There are at least three crash-on-use bugs (`ActionType.CHASTER_TIME_ADD`, `store.update_thread_settings`, `Store.check_permission` on stale JWTs) and real authorization gaps on the Discord side. Not production-ready; very fixable. The single highest-leverage thing you can do is add tests — the worst bugs here are exactly the kind a 20-line test file would have caught.

## Strengths

- **The event pipeline design is sound.** Dispatcher → Registry → Queue → Executor is a clean separation with single responsibilities, good docstrings, and the apply/snapshot/reverse pattern is the right model for time-boxed hardware mutations. `dispatcher.py` in particular is readable, well-logged, and does persistence + notification + enqueue in a sensible order.
- **Consistent structured logging.** `structlog` with bracketed component tags (`[Queue]`, `[Executor]`) and structured kwargs is applied uniformly in the new code. This will pay off when debugging hardware sessions.
- **The WS command pattern is good.** The `HANDLERS` map of `(handler, required_permission)` in `main.py` is exactly the right way to gate commands — declarative, extensible, no ad-hoc role checks. The `handle_update_level.py` handler is a model example of the pattern.
- **Repository layer is done properly.** `selectinload` for eager-loading relationships (avoiding async lazy-load explosions), `expire_on_commit=False`, per-call sessions, and no model queries leaking into API code. `set_labels_for_rule` handles dedup/case-insensitivity thoughtfully.
- **Store's unit API has the right instincts.** Copy-on-read (`get_unit_dict` returns `.copy()`), consume-flag semantics (`consume_unit_update`), and limit clamping centralized in `update_unit_dict`/`set_unit_setting` so limits can't be bypassed by callers.
- **Webhook auth uses `secrets.compare_digest`** — timing-safe comparison is a detail most people get wrong.
- **Frontend middleware is solid.** Heartbeat with timeout, exponential backoff with cap, clean auth-error handling on close codes 4001/4003, and message-type-to-slice mapping is explicit and easy to extend.
- **The magic-number parser** (`calculate_magic_number`) is pure, self-contained, and handles a genuinely fiddly DSL — ideal unit-test bait.

## Weaknesses

### Critical

1. **`ActionExecutor` references a non-existent enum member — Chaster time actions always crash.** *(correctness)* `executor.py:92` checks `action_type == ActionType.CHASTER_TIME_ADD`, but the enum (`events/enums.py:10`) only defines `CHASTER_TIME_UPDATE`. The `elif` chain evaluates lazily, so every non-LEVEL/PROFILE/MULT item raises `AttributeError`. It's swallowed by `_start_item`'s `try/except`, logged once, and the item is silently deleted — Chaster-time rules *never execute* and nobody notices. This is what happens with zero tests: a rename that would fail any import-level check ships broken.

2. **Two sources of truth for unit state; Discord commands and the software ramp are no-ops.** *(correctness / architecture)* `main.py:302` keeps a module-global `threads_settings` dict. The ramp thread (`thread_update_ramp`, lines 1577–1674) and all Discord commands (`/usage`, `/unit power`, `/unit timer`, `/ramp *`, `/profile apply`) mutate `threads_settings` and set `threads_settings[unit]["updated"] = True`. But the hardware thread (`thread_bt_unit`, line 655) consumes via `store.consume_unit_update()` — it *only* reads the `Store`. Nothing ever syncs `threads_settings` → `Store` after `mk2b_init`. So: the software ramp computes values into a dict nobody reads, Discord slash commands report success while changing nothing, and `/profile save` (line 977) snapshots the *stale* dict that diverges from the Store the moment anyone uses the web UI. This is the single most damaging structural issue in the repo.

3. **`/restore` calls a method that doesn't exist.** *(correctness)* `main.py:921` calls `store.update_thread_settings(unit, restored)`. `Store` has no such method (it's `update_unit_dict`). The command raises `AttributeError` every time — restore has never worked since the Store refactor.

4. **Missing authorization on destructive Discord commands + path traversal.** *(security)* `/backup`, `/restore`, and `/profile` (save/apply/info) have **no** `check_permission` call, unlike their sibling commands. Anyone in the guild can apply profiles — i.e., drive physical hardware — and write files. Worse, `filename = filename + ".json"` with `open(DIR_BACKUP / filename)` (lines 892, 905, 976, 989) is a trivial path traversal: `../../something` reads/writes JSON anywhere the process can reach. For an app whose whole point is physical safety, an unauthenticated "apply torture profile" command is a critical flaw, not a formality.

5. **Cross-event-loop race on the action queue.** *(correctness / concurrency)* The queue is ticked on the Discord bot's loop (main thread), but `core:stop` from the WS endpoint calls `await bot._action_queue.cancel_all()` on *uvicorn's* loop (`main.py:1891–1893`), and `cancel`/`cancel_all`/`tick` all `await executor.reverse()` **outside** the lock after snapshotting the list. Two loops in two threads can reverse the same RUNNING item twice (double level-correction on hardware), or finalize an item the other loop just cancelled. The `threading.Lock` gives a false sense of safety — it protects list mutation but not the state machine.

### Moderate

6. **`Store.check_permission` crashes on unknown users.** *(correctness)* `store.py:289`: `user = self._users.get(user_id); return user.has_permission(...)` — `None.has_permission` → `AttributeError`. Users live only in memory, so after any backend restart, every still-valid 24h JWT makes the WS endpoint die via the generic `except Exception` — the client gets a connection drop instead of a clean `4001`. The REST path (`get_current_user`) handles this correctly; the WS path doesn't.

7. **Sensor state bypasses the Store's thread safety.** *(correctness / concurrency)* `get_sensor_setting` returns the *live* dict (`store.py:193–195`), and `get_all_sensors_settings` is a shallow copy — inner dicts are shared. `sensor_bt`, `sensor_notification`, and `bt_sensor_alarm` all mutate `current_sensor_settings[...]` directly from BLE threads with no lock, *and* then redundantly write the same keys through `update_sensor_fields`. The unit API copies; the sensor API doesn't. Pick one contract.

8. **Sensor alarm hysteresis is broken.** *(correctness)* In `sensor_check_val` (`main.py:1415–1438`), when the value drops below threshold and the counter is ≥ 0, the counter is **never reset to 0**. `delay_on` is documented as "nb consecutive value for starting an action" but nothing enforces consecutiveness — stale counts accumulate across unrelated spikes, so alarms fire earlier than configured over time.

9. **WOF events are double-dispatched.** *(correctness — possibly deliberate, verify)* In `chaster.py`, the generic `CHASTER_WOF_TURNED` dispatch (line 146) is dedented out of the `if segment_type == "text"` block, so a text segment with `{p:Jfa}` produces **two** triggered events: the custom profile dispatch *and* the generic one (firing any rules bound to `chaster_wof_turned`). The comment says "WOF with non-text segment — dispatch generic event," which suggests it belongs in an `else`. If double-firing is intended, the comment is wrong; if not, it's a bug that doubles actions.

10. **No webhook idempotency.** *(correctness)* `requestId` is logged but never deduplicated. Chaster retries/timeouts will re-POST, and each retry re-runs the full rule set — double pillory-vote actions, double profile applications. Persist seen `requestId`s (SQLite, unique constraint) and no-op on replays.

11. **Unauthenticated state endpoints + weak secret defaults.** *(security)* `GET /sensors` and `GET /units` (`main.py:1808–1815`) expose live state with no auth while everything else requires JWT — inconsistent at best. The webhook falls back to hardcoded `sereti`/`password` if env vars are missing (`chaster.py:33–34`) — fail closed instead. CORS is `*` (acceptable for token-in-localStorage, but a conscious choice to make), and the JWT rides in the WS **query string**, where it lands in uvicorn access logs and any proxy logs.

12. **Blocking I/O inside the 1-second tick loop.** *(performance / correctness)* `_apply_chaster_time` does up to 3 sequential HTTP round-trips to Chaster (`executor.py:288–327`) with no timeout, awaited inline by the queue tick — which runs on the Discord bot loop alongside sensor-alarm dispatch. A slow Chaster API stalls *all* action timers and sensor alarms. Also: `elapsed += 1` per tick assumes exactly 1s cadence, so any stall silently stretches every running action's duration. (Related brittleness: `strptime(max_date_str, "%Y-%m-%dT%H:%M:%S.%fZ")` will throw if Chaster ever omits fractional seconds; `locks[0]["_id"]` and `resp.json()` have no status/shape checks.)

13. **Restart/reconnect paths are broken.** *(correctness / ops)* `on_ready` fires on *every* Discord reconnect, not just first connect — so it re-DMs the magic link and calls `rerun_event_queue_mgmt.start()` again, which raises `RuntimeError` on an already-running task. The outer restart loop sleeps **1000** seconds (16 minutes — `100` was probably intended), and re-runs `bot.load_extension(cog)` on an already-loaded bot, which will fail for duplicate cogs.

14. **`MULT` actions never revert, despite having durations.** *(correctness / UX)* `_apply_mult` is documented "not reversible," but the queue happily accepts `MULT` items with a `duration`, finalizes them on expiry, and calls `reverse()` — which does nothing. A user configuring "×+20% multiplier for 60s" gets a *permanent* multiplier change with no warning. Either snapshot/revert it, or reject `MULT` with `duration != -1` at rule-creation time.

15. **Queue failure handling loses information.** *(maintainability / correctness)* `_start_item` on executor error deletes the item with no FAILED status and no `queue:update` notify (`queue.py:191–196`) — clients just see it vanish. `_notify_update` swallows all exceptions with bare `except Exception: pass`. A duration=-1 non-cumulative item silently blocks all later non-cumulative items forever; there's no visibility into that starvation.

16. **Mutual recursion in the BT reconnect path.** *(correctness)* `parse_reply` calls `self.detect()` on parse failure (`main.py:486`), `detect` calls `parse_reply` (546), and `send_cmd` retries `while True` forever. A unit that replies garbage causes unbounded mutual recursion → eventual `RecursionError`, caught by the thread's blanket `except`, 30s sleep, repeat. Convert to a loop with a reconnect counter.

### Minor

17. **Dead/unreachable code in `/profile apply`:** `main.py:1006` `elif field in ("ch_A", "ch_B", "ramp_progress")` can never run — `ch_A`/`ch_B` are caught by the preceding `if`, and `ramp_progress` isn't in `PROFILE_FIELDS`. The "Ramp will update the level" behavior it promises doesn't exist. Also `/profile save` zeroes `ch_A`/`ch_B` **on the live dict** (lines 980–982) — saving a profile mutates live targets as a side effect.
18. **Secrets and noise in logs/stdout:** `print(f"📨 Received: {json.dumps(message...)}")` prints every WS payload (`main.py:1877`); `generate_root_access` prints the full magic URL to stdout; the frontend ships `console.log('WS MESSAGE RECEIVED:', message)` in production. Use `logger.debug` and strip in prod builds.
19. **`manage_profile` save ordering bug:** `backup_data = {"threads_settings": threads_settings}` holds a *reference*; it works today only because the zeroing happens before `json.dump`. Fragile — copy the dict.
20. **`datetime.utcnow()`** (`jwt_helpers.py:30`) is deprecated; use `datetime.now(timezone.utc)`. `asyncio.get_event_loop()` in lifespan should be `get_running_loop()`.
21. **Magic tokens never expire, are compared with `==`**, and `login(magic_token: str)` takes the token as a query parameter (FastAPI binds bare scalars to query) — tokens in URLs get logged. `if magic_token is None` is dead code (FastAPI returns 422 first). Also the root user's magic link is regenerated on every `on_ready`.
22. **Import-time side effects everywhere:** `main.py` opens five JSON files, builds the Store, and configures logging at import; `pathlib.Path(os.getenv("DIR_BACKUP"))` throws `TypeError` at import if the env var is missing. Makes the module untestable and errors land far from their cause.
23. **`calculate_magic_number` quirks:** caps at 99 not 100; absolute values (`"250"`) aren't clamped at the parser level (relies on downstream clamping); regex `%*` allows `%%+5`; `%+5` on a current value of 0 is always a no-op (0 × anything = 0) — surprising for users. Fine if documented; it isn't.
24. **Frontend:** the `window.dispatchEvent(new CustomEvent(...))` side-channel for command responses bypasses Redux types entirely — untyped, and listener leaks are easy. The 300ms `setTimeout` after `auth/setToken` is a race-prone hack. `NodeJS.Timeout` types in browser code.
25. **Lint-drift:** unused imports (`pprint`, `math` in main?), a no-op `filter_Logger`, commented-out code blocks, `# TODO: REF` markers on the profile/ramp paths that date the half-done migration.

## Specific recommendations

**Fix 1 — the enum crash (do this today):**

```python
# events/executor.py, line 92
elif action_type == ActionType.CHASTER_TIME_UPDATE:
    await self._apply_chaster_time(payload)
    return None
```

Then add the test that would have caught it:

```python
# tests/test_executor.py
import pytest
from events.enums import ActionType
from events.executor import ActionExecutor

def test_every_action_type_is_handled():
    import inspect, re
    src = inspect.getsource(ActionExecutor.apply)
    handled = set(re.findall(r"ActionType\.(\w+)", src))
    assert handled == {m.name for m in ActionType}, (
        f"Unhandled or unknown ActionTypes: {set(m.name for m in ActionType) ^ handled}"
    )
```

**Fix 2 — kill `threads_settings`.** This is the big one. Migrate the ramp thread and Discord commands to the Store, then delete the global. The ramp loop becomes:

```python
def thread_update_ramp():
    RAMP_STEP = 2
    while True:
        time.sleep(RAMP_STEP)
        for unit_str in BT_UNITS:
            unit = UnitDict(unit_str)
            state = store.get_unit_dict(unit)                      # copy, lock-held
            changes = _compute_ramp_changes(state, RAMP_STEP)      # pure function
            if changes:
                changes["updated"] = True
                store.update_unit_dict(unit, changes)              # limits enforced centrally
```

Pull `_compute_ramp_changes` out as a pure function of `(state, step) -> dict` — that makes the ramp math unit-testable for the first time, and routes all writes through the one place that enforces channel limits (today the ramp thread writes `ch_A` with **no limit clamp** — a safety-relevant gap beyond the no-op issue). The Discord commands then call the same `store.update_unit_dict(...)` the WS handlers use. One write path, one source of truth.

**Fix 4 — permission + path traversal on Discord file commands:**

```python
# at the top of bot_backup / bot_recover / manage_profile:
if not await check_permission(interaction, "administrator"):
    return

# sanitize the filename — reject anything that isn't a plain name
if not re.fullmatch(r"[\w\-]{1,64}", filename):
    await interaction.response.send_message("invalid name")
    return
path = (DIR_BACKUP / f"{filename}.json").resolve()
if DIR_BACKUP.resolve() not in path.parents:
    await interaction.response.send_message("invalid name")
    return
```

**Fix 5 — serialize queue access through one loop.** The queue is owned by the Discord bot's loop, so cross-thread callers should hand work to it instead of awaiting queue methods directly:

```python
# in the WS endpoint, replace: await bot._action_queue.cancel_all()
loop = bot.loop  # nextcord exposes the bot's loop
future = asyncio.run_coroutine_threadsafe(bot._action_queue.cancel_all(), loop)
await asyncio.wrap_future(future)
```

And in `ActionQueue`, hold the lock while flipping `status` (state transitions must be atomic with respect to list membership), keeping only the `executor.apply/reverse` awaits outside it.

**Fix 6 — fail cleanly on unknown WS users:**

```python
# store.py
def check_permission(self, user_id: str, permission: Permission) -> bool:
    with self._users_lock:
        user = self._users.get(user_id)
        return user is not None and user.has_permission(permission)
```

…and in the WS endpoint, after decoding the JWT, verify `store.get_user(user_id)` exists; if not, `await websocket.close(code=4001)` — the frontend already handles 4001 by logging out.

**Fix 8 — reset the sensor counter:**

```python
# sensor_check_val, after the threshold check:
elif current_sensor_settings[measure + "_alarm_counter"] >= 0:
    new_counter = 0
    fields_to_update[measure + "_alarm_counter"] = 0
```

**Fix 10 — webhook dedup:**

```python
# add to TriggeredEvent or a tiny processed_webhooks table:
# requestId TEXT UNIQUE
try:
    await repo.save(ProcessedWebhook(id=webhook_id))
except IntegrityError:
    return {"status": "duplicate"}
```

**Fix 11/12 — fail closed + bound external calls:** remove the default webhook credentials (raise at startup if unset), put `Depends(get_current_user)` on `/sensors` and `/units`, and give the Chaster session an explicit timeout (`aiohttp.ClientTimeout(total=5)`) plus a defensive date parse (`dateutil.parser.isoparse` handles both with/without fractional seconds).

## Bigger-picture suggestions

1. **Finish the migration before adding features.** The repo's core problem isn't any single bug — it's that a Store-based architecture was adopted ~80% of the way and the last 20% (Discord commands, ramp, profiles) still runs on the old global. Every new feature built now lands on top of that ambiguity. Declare `threads_settings` deprecated, migrate the three remaining writers, delete it, and treat "the Store is the only source of truth" as an invariant enforced by review. Update `CLAUDE.md`/`claudio.md` when you do — the docs currently describe the *target* state, not the actual one, which is how bugs like #2 and #3 survive code review.

2. **Break up `main.py` along the seams that already exist.** The code practically tells you where to cut: `UnitConnect` + `thread_bt_unit` → `hardware/units.py`; `sensor_*` → `hardware/sensors.py`; `thread_update_ramp` → `hardware/ramp.py`; `Bot2b3` + slash commands → `discord/bot.py` (move the inline `@self.slash_command` closures into cogs — you already have a cog loader); `HANDLERS` + the WS endpoint → `api/ws/endpoint.py`. `main.py` should be ~100 lines of composition root. The current monolith is why `on_ready` starting the queue tick felt acceptable — ownership of the tick is invisible when everything is in one file.

3. **Reconsider who owns the queue tick.** The action queue — the safety-critical heartbeat of the system — is ticked by the *Discord bot*, an optional integration. If Discord is down (or the bot is mid-restart in its 1000-second sleep), no actions start, expire, or reverse. The queue deserves its own `asyncio` task in the FastAPI lifespan (or its own thread with a dedicated loop), with the bot as just another event source. This also fixes the cross-loop race (#5) by giving the queue exactly one owner loop.

4. **Introduce a real test suite — start with the pure seams.** You don't need hardware mocks to get most of the value: `calculate_magic_number` (fully pure), `_decode_units`/`_decode_channels` (pure), `_parse_wof_dynamic_profile` (pure), the ramp computation once extracted (pure), queue state transitions (executor is an interface — fake it), and the enum-coverage test above. pytest + pytest-asyncio, ~150 lines of tests, would have caught every Critical correctness bug on this list. Add `uv run pytest` to the workspace and a CI gate.

5. **Model reversal as an explicit stack, or scope it.** The current snapshot/diff approach has two known-wrong cases — overlapping LEVEL actions reverse out of order (LIFO violation with clamping loses state), and PROFILE reversal stomps legitimate interim changes. For a v1 this is survivable, but the honest fix is per-(unit, channel) value reconciliation: instead of "apply/reverse," keep a desired-state model where each running action contributes a delta and the Store recomputes the effective value whenever the action set changes. That eliminates reversal-order bugs by construction and makes `core:stop` just "clear all contributions."

6. **Make the WS contract a versioned schema.** The `{type, payload}` strings are the frontend/backend contract, maintained by hand in two languages. At minimum, generate the TS union from a Python source (or keep a single `messages.json` both sides validate against); longer term, pydantic models + a codegen step. You already have the discipline to keep them in sync manually — that erodes as the message count grows.

7. **Ops hygiene as the user count grows:** rotate `log.txt` (currently truncated per start — fine, but no retention policy), move all env validation into one `settings.py` (pydantic-settings) that fails fast with a readable error instead of `TypeError` at import, and persist users/magic tokens in SQLite alongside the rules so restarts don't log everyone out.

---

The bones here are good — the event pipeline is better designed than most hobby-to-production code I review. The risk is concentrated exactly where the docs admit the refactoring stopped. Finish that, add the test floor, and this is in solid shape.
