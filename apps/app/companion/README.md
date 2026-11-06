# PES Lovense companion

The companion lets PES control Lovense devices that are **not** on the same
machine as the server, without opening any inbound port.

```
PES (relay endpoint)  <-- wss (outbound) --  companion  <-- ws -->  Intiface Central  <-- BLE -->  toy
```

## Setup

1. In PES, open **Lovense → Add node → Relay**. Copy the node token and the
   companion command shown in the dialog.
2. Run the command on the machine with Bluetooth:

```bash
uv run --with websockets python apps/app/companion/lovense_companion.py \
  --server wss://pes.example.com/lovense/relay/<node_id> \
  --token <token> \
  --intiface ws://127.0.0.1:12345
```

The companion reconnects automatically. It reuses an existing Intiface server
(Intiface Central GUI, for example); otherwise it starts Intiface Engine, or
downloads the official standalone engine from the Buttplug GitHub release
(SHA-256 verified) into `~/.pes-lovense/engine/current`. Use
`--no-managed-intiface` to require an already running server, or
`--intiface-engine <path>` to point at a specific binary.

When it loses PES (or is stopped), it sends `StopAllDevices` to the local
Intiface before exiting: a remote toy must never be left running.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--server` | required | PES relay WebSocket URL |
| `--token` | required | Node token (shown once in PES) |
| `--intiface` | `ws://127.0.0.1:12345` | Local Intiface server |
| `--intiface-engine` | auto | Explicit engine binary path |
| `--no-managed-intiface` | off | Never start/download Intiface Engine |
| `--name` | `PES companion` | Name shown in logs |
| `--verbose` | off | Connection logs |

## Security

- The token is a bearer secret. Store it on the companion machine only.
- Use `wss://` (PES behind a TLS reverse proxy) when the companion is not on
  the same trusted network as PES.
- Intiface has no authentication. The companion connects to `127.0.0.1` by
  default; do not expose Intiface publicly.
- Rotating the token invalidates the old one; the companion is rejected on its
  next reconnect (restart it to apply the new token).

## Windows

Use PowerShell. If `uv` is not installed:

```powershell
winget install --id=astral-sh.uv -e
```

Then run the same command. The companion works on Windows, macOS and Linux.
