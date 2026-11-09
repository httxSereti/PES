# Lovense / Buttplug devices

The `lovense` integration drives Lovense toys (and any other Buttplug-compatible
device) through [Buttplug](https://buttplug.io) and
[Intiface Central](https://intiface.com/central/). It is a normal external
integration: it contributes events, actions and settings to the catalog, owns
its REST routes, and is controlled from the frontend over the PES WebSocket.

Unlike the 2B units, there is **no hardcoded device count**. Devices are
discovered at runtime from one or more Buttplug servers ("nodes") and stored in
the database, so the same code handles one Hush 2 or twenty devices.

## Quick start (local)

1. Start PES. The Lovense page auto-detects Intiface Engine from an Intiface
   Central install, or downloads the official standalone engine from the
   Buttplug GitHub release (SHA-256 verified) into
   `userdata/intiface-engine/current`.
2. PES starts the engine, creates a **Local Intiface** node and scans.
3. Turn the toy on and keep it near the PES machine. It appears in the Devices
   tab; use the sliders or play a built-in pattern.

If the engine is already running (for example the Intiface Central GUI), PES
reuses it. The first run needs internet access to download the engine; set
`managed_intiface_auto_download=false` or `intiface_engine_path` for a manual
install.

## Why Buttplug

- One protocol for every toy: vibration, rotation, oscillation, constriction,
  position, battery, RSSI.
- Intiface Central handles Bluetooth pairing, reconnection and per-device
  timing gaps.
- The official Python client (`buttplug` >= 1.0.0, protocol v4 / Buttplug v10)
  gives us `ButtplugClient`, `DeviceFeature`, `OutputType`, `InputType`,
  `step_count()` and event callbacks.
- We do not reimplement a Buttplug server: PES is a *client* of Intiface, and
  optionally a *relay* for remote clients.

## Connection modes

| Mode | Direction | NAT friendly | Inbound port | When to use |
| --- | --- | --- | --- | --- |
| Managed engine | PES launches Intiface | - | no | **default, simplest** |
| Direct local | PES -> Intiface | - | no | PES host has Bluetooth |
| Direct remote | PES -> Intiface | VPN / port forward | on the device owner | LAN, Tailscale, ZeroTier |
| Relay + companion | companion -> PES | yes | **no** | internet, non-technical users |
| Intiface Repeater | desktop -> phone | LAN | no | phone used as the Bluetooth radio |
| Demo node | in-process | - | no | Virtual Edge 2 for UI/pattern development |

### Managed Intiface (recommended)

PES can start **Intiface Engine** itself:

1. PES first looks for an engine installed by Intiface Central.
2. If none is found, it downloads the official standalone `intiface-engine`
   from the Buttplug GitHub release, verifies the SHA-256 digest and stores it
   in `userdata/intiface-engine/current`.
3. It starts the engine on `127.0.0.1:12345` with the Bluetooth LE manager,
   creates a **Local Intiface** node and scans.
4. If an Intiface server is already listening on the port (for example the
   Intiface Central GUI), PES reuses it instead of spawning a second engine.
5. PES stops the engine it started when the app shuts down or the integration
   is disabled. An engine started by the user is left alone.

The Lovense page shows the engine status (managed/external/downloading/stopped/
not found) with Start, Restart and Stop buttons. The engine log is written to
`intiface-engine.log`.

Set `managed_intiface_auto_download=false` to disable the download, or set
`intiface_engine_path` in Admin → Integrations → Lovense to use a specific
binary. The advanced `intiface_extra_args` setting can add device managers
(serial, HID, ...).

### Direct node

Add a node of kind `direct` with the Intiface WebSocket URL
(`ws://127.0.0.1:12345` by default). Intiface must be running and the server
started. For a remote Intiface, enable "Listen on all network interfaces" and
only expose it over a VPN or a firewall rule: **Intiface has no
authentication**.

### Relay node + companion

PES hosts `WS /lovense/relay/{node_id}`. The companion runs on the machine that
has Bluetooth, connects **out** to PES (so no port forwarding) and pipes
Buttplug frames to the local Intiface. Like PES, it reuses an existing Intiface,
starts Intiface Engine, or downloads the official standalone engine (SHA-256
verified) into `~/.pes-lovense/engine/current`.

```bash
# On the machine with the toy + Intiface Central
uv run --with websockets python apps/app/companion/lovense_companion.py \
  --server wss://pes.example.com/lovense/relay/<node_id> \
  --token <token> \
  --intiface ws://127.0.0.1:12345
```

The token is shown once when the node is created or rotated. It is stored
hashed in `lovense_nodes`.

PES creates a loopback Buttplug endpoint per relay node
(`ws://127.0.0.1:<ephemeral>`); `buttplug-py` connects to it exactly like a
local Intiface, so direct and relay nodes share one code path.

If the companion loses PES, it sends `StopAllDevices` to its local Intiface
before exiting. This is the fail-safe for remote devices.

### Demo node

Add a node of kind `demo` (Toys → Connection center → **Add demo Edge 2**) to
get an in-process **Lovense Edge 2** with its two vibration motors. It needs no
Intiface, no Bluetooth and no download: the hub registers it like a real device,
applies the usual caps and lets manual control, patterns, the pattern editor
and the kiosk run end-to-end. The device is tagged `edge2` and `demo`, so
patterns written for a real Edge 2 match it while the UI still flags it as a
demo toy. Add several demo toys to exercise multi-device grouping; delete a
node or device like any other.

## Device model

A node is a Buttplug server. A device belongs to a node and keeps:

- its Buttplug device index, name and feature snapshot;
- an optional alias and tags (`edge2`, `salon`, `camille`);
- battery/RSSI, an intensity cap and a control policy;
- its owner.

Buttplug device indexes are only stable while the device is in the latest
`DeviceList`; PES reconciles by index + name and falls back to the alias, so a
reconnect keeps the same PES device id whenever possible.

### Persistence

| Table | Contents |
| --- | --- |
| `lovense_nodes` | Buttplug servers, kind, URL, hashed relay token, enabled |
| `lovense_devices` | discovered devices, alias, tags, feature snapshot, battery, cap, policy, owner |
| `lovense_patterns` | pattern definitions, author, visibility, tags |
| `lovense_runs` | pattern runs (status, targets, options, origin, timings) |

Run history is pruned to the last 500 rows at startup.

### Edge 2 / Hush 2

Buttplug exposes the Edge 2 as two `Vibrate` features and a `Battery` input;
the Hush 2 as one `Vibrate` feature and a `Battery` input. The UI therefore
shows two sliders for the Edge and one for the Hush, and patterns can target
each motor separately.

Lovense reports 20 vibration steps and a 100 ms `DeviceMessageTimingGap`, so PES
quantizes commands to steps and never sends faster than the device accepts.

## Real-time control

The frontend sends `lovense:*` WS commands. The hub:

1. resolves the target (`device_ids`, `tags`, `node_ids`, `all`);
2. checks ownership and the intensity cap;
3. clamps to the feature step range;
4. sends through the node with a timeout;
5. broadcasts the new state.

Manual control uses a **dead-man switch**: the UI sends a hold heartbeat while
the user keeps control; after `manual_hold_seconds` without one, the output is
zeroed. A pattern or queue action cannot silently keep a device on.

An **output arbiter** gives each `(device, feature, output)` an owner with a
priority: manual > action > pattern. A pattern can preempt only when it is
started with `replace=true`.

## Patterns (Lovense profiles)

A pattern is a list of tracks. Each track matches devices (ids, tags, nodes or
all), targets one output (default `Vibrate`) and one feature (`0`, `1` or all),
and contains keyframes:

```json
{
  "version": 1,
  "name": "Slow Build",
  "loop": false,
  "bpm": null,
  "max_intensity_pct": 80,
  "fade_in_ms": 1500,
  "fade_out_ms": 800,
  "jitter_pct": 0,
  "tags": ["tease", "reward"],
  "tracks": [
    {
      "id": "t1",
      "match": { "tags": ["edge2"], "feature_index": 0 },
      "output": "Vibrate",
      "keyframes": [
        { "at_ms": 0, "value": 0.0, "easing": "linear" },
        { "at_ms": 15000, "value": 0.45, "easing": "ease-in-out" },
        { "at_ms": 30000, "value": 1.0, "easing": "step" }
      ]
    }
  ]
}
```

Supported easings: `linear`, `step`, `ease-in`, `ease-out`, `ease-in-out`,
`sine`. `jitter_pct` adds a per-tick random variation (0-50). The runner samples
at `pattern_tick_hz` (20 Hz by default), applies the cap and the run scale,
quantizes to the device step range and only sends when the step changes.

Patterns are stored in the database (ownership, visibility) and can be exported
as JSON. Built-in patterns are seeded on first start.

Playback options: `duration`, `loop`, `scale_pct`, `replace`, `fade_in_ms`,
`fade_out_ms`, `sync_offset_ms`. Trigger-rule pattern actions are normal queue
items (reversible on expiry); manual runs are tracked by the hub. `core:stop`,
session end and `neutralize_all()` stop every run through the hub.

## Events

| Event | When |
| --- | --- |
| `lovense_node_online` | node connected and handshake OK |
| `lovense_node_offline` | disconnect or error |
| `lovense_device_connected` | Buttplug `DeviceAdded` |
| `lovense_device_disconnected` | `DeviceRemoved` or node lost |
| `lovense_battery_low` | battery at or below `battery_low_pct` |
| `lovense_battery_charged` | battery back above threshold + 10 |
| `lovense_pattern_started` | a pattern run started |
| `lovense_pattern_completed` | natural end |
| `lovense_pattern_stopped` | manual/queue/`replace` stop |
| `lovense_output_limited` | a command was clamped by a cap |
| `lovense_manual_released` | manual hold expired, outputs were zeroed |
| `lovense_scan_finished` | scanning finished |
| `lovense_device_error` | a device command failed |
| `lovense_node_latency_high` | node latency above the warning threshold |

## Actions

| Action | Payload |
| --- | --- |
| `LOVENSE_SET` | `devices`/`tags`/`all`, `output`, `value` (0-100), `mode`, `ramp_ms` |
| `LOVENSE_PULSE` | target, output, value, attack/hold/release |
| `LOVENSE_STOP` | target, optional output |
| `LOVENSE_PATTERN_PLAY` | `pattern_id`/`pattern_name`, duration, loop, scale, replace |
| `LOVENSE_PATTERN_STOP` | `run_id` / `pattern_id` / all |
| `LOVENSE_RANDOM_PATTERN` | tags, target, duration |
| `LOVENSE_SCAN` | `node_id`, duration |
| `LOVENSE_SET_CAP` | target, `max_pct` |
| `LOVENSE_ASSIGN` | target, alias, tags |
| `LOVENSE_RECONNECT` | `node_id` |

`value` accepts the same MagicNumber expressions as the other actions (`50`,
`+10`, `%+10`, `[10-20]`). Values are percentages of the device step range.

## Settings

| Key | Default | Description |
| --- | --- | --- |
| `auto_connect` | true | connect nodes at startup |
| `auto_scan` | true | scan after connecting |
| `managed_intiface_enabled` | true | let PES launch Intiface Engine |
| `managed_intiface_port` | 12345 | local managed engine port |
| `intiface_engine_path` | "" | explicit engine binary path |
| `intiface_extra_args` | `--use-bluetooth-le` | extra engine arguments |
| `managed_intiface_auto_restart` | true | restart the engine if it exits |
| `managed_intiface_auto_download` | true | download the official engine when missing |
| `scan_seconds` | 10 | default scan duration |
| `pattern_tick_hz` | 20 | pattern runner frequency |
| `command_rate_limit` | 20 | commands per second per user |
| `battery_poll_seconds` | 120 | battery polling interval |
| `battery_low_pct` | 15 | low battery threshold |
| `default_max_intensity_pct` | 70 | global intensity cap |
| `manual_hold_seconds` | 60 | manual dead-man delay |
| `default_pattern_max_minutes` | 30 | maximum pattern run duration |
| `relay_enabled` | true | enable `/lovense/relay` |
| `relay_public_url` | "" | public `wss://` URL shown in the UI |
| `relay_max_nodes` | 10 | maximum relay nodes |
| `relay_heartbeat_seconds` | 15 | companion heartbeat |
| `latency_warn_ms` | 250 | latency warning threshold |

## Permissions

| Permission | Use |
| --- | --- |
| `READ_DEVICES` | see nodes, devices, battery, patterns |
| `WRITE_DEVICES` | control owned devices, edit patterns |
| `MANAGE_DEVICES` | manage nodes/tokens, caps and every device |

Role defaults: guests/users read, operators/trusted read+write, admins manage,
HOST has everything. A device with an owner can only be controlled by that
user (or a manager); the consent-grant table is on the roadmap.

## Safety

- Every cap is enforced server-side, never only in the UI.
- `stop_all` runs on `core:stop`, session end, shutdown and integration
  disable. The companion stops its local devices when it loses PES.
- The companion stops its local devices before exiting.
- Pattern runs have a maximum duration, a watchdog and fade-out on stop.
- Manual control expires without heartbeat.
- Low battery stops the device before it dies mid-session.
- Intiface is unauthenticated: use the relay or a VPN, never expose it
  publicly.

## API surface

REST (mounted by the integration router):

```
GET/POST      /lovense/nodes
PATCH/DELETE  /lovense/nodes/{id}
POST          /lovense/nodes/{id}/token
POST          /lovense/nodes/{id}/reconnect
GET           /lovense/devices
PATCH         /lovense/devices/{id}
GET/POST      /lovense/patterns
PATCH/DELETE  /lovense/patterns/{id}
GET           /lovense/patterns/{id}/export
POST          /lovense/patterns/import
GET           /lovense/health
GET           /lovense/intiface
POST          /lovense/intiface/start
POST          /lovense/intiface/stop
POST          /lovense/intiface/restart
WS            /lovense/relay/{node_id}
```

WS commands: `lovense:set`, `lovense:stop`, `lovense:stop_all`,
`lovense:pulse`, `lovense:scan`, `lovense:node_save`, `lovense:node_delete`,
`lovense:node_reconnect`, `lovense:node_token`, `lovense:device_update`,
`lovense:device_delete`, `lovense:battery`, `lovense:identify`,
`lovense:pattern_list`,
`lovense:pattern_detail`, `lovense:pattern_save`, `lovense:pattern_delete`,
`lovense:pattern_duplicate`, `lovense:pattern_play`, `lovense:pattern_stop`,
`lovense:pattern_export`, `lovense:pattern_import`, `lovense:health`,
`lovense:intiface_start`, `lovense:intiface_stop`, `lovense:intiface_restart`.

WS messages: `lovense:init`, `lovense:nodes`, `lovense:devices`,
`lovense:device`, `lovense:runs`, `lovense:patterns`,
`lovense:pattern_saved`, `lovense:pattern_deleted`, `lovense:error`,
`lovense:health`, `lovense:intiface`.

## Limits

- Buttplug exposes no Lovense firmware or on-device patterns; patterns are
  software-side.
- Remote patterns are open-loop: latency is measured and offset can be
  configured, but tight musical sync needs local nodes.
- The relay requires a single PES process (already true for the queue and the
  2B hardware).
- Lovense Connect and the Lovense dongle are not supported by Buttplug; use
  BLE + Intiface.
