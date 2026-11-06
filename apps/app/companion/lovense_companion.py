#!/usr/bin/env python3
"""
PES Lovense companion.

Runs next to a remote Intiface Central/Engine and connects *out* to the PES
relay. It is a transparent Buttplug frame pump: PES's buttplug-py client talks
to its local Intiface exactly as if it were on the same machine.

The companion is intentionally dependency-light (websockets only). On exit it
opens a short-lived connection to Intiface and sends StopAllDevices, so a
remote toy is never left running if PES disappears.

Usage:
    uv run --with websockets python apps/app/companion/lovense_companion.py \
        --server wss://pes.example.com/lovense/relay/<node_id> \
        --token <token> \
        --intiface ws://127.0.0.1:12345
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import os
import pathlib
import platform
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import zipfile
from typing import Any
from urllib.parse import urlparse

try:
    from websockets.asyncio.client import connect
except ImportError:  # pragma: no cover - friendly message
    print("Missing dependency: pip install websockets", file=sys.stderr)
    raise SystemExit(1)

PROTOCOL_VERSION = 1
SUBPROTOCOL = "pes-lovense-v1"
_ENGINE_NAMES = ("intiface-engine.exe", "intiface-engine")
_GITHUB_RELEASES = (
    "https://api.github.com/repos/buttplugio/buttplug/releases?per_page=30"
)
_FALLBACK_VERSION = "5.0.4"
_FALLBACK_SHA256 = {
    "win-x64": "29ea7051b23f7a05124e65581df48c8600070c83adc0348f0738b9ba75b58782",
    "linux-x64": "ea2b40eca8369e01edcaa00076315bde0d7352108d38c226b77f1818395d2e66",
    "linux-arm64": "01536003a3075ddb896552b70d2024f19992099b9ea1aef93459f9084aacb7e2",
    "macos-arm64": "430fbea694cbbde60e567c2f8e01c297db040259f02e541a5bf3d2abdbdf3d0d",
}


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


def _search_engine(root: pathlib.Path, depth: int = 4) -> pathlib.Path | None:
    if not root.exists():
        return None
    root_depth = len(root.parts)
    try:
        for current, dirs, files in os.walk(root):
            current_path = pathlib.Path(current)
            if len(current_path.parts) - root_depth > depth:
                dirs[:] = []
                continue
            for name in files:
                if name.lower() in _ENGINE_NAMES:
                    candidate = current_path / name
                    if candidate.is_file():
                        return candidate
    except OSError:
        return None
    return None


def detect_engine(explicit: str = "") -> pathlib.Path | None:
    if explicit.strip():
        candidate = pathlib.Path(explicit.strip()).expanduser()
        if candidate.is_file():
            return candidate
    env_path = os.getenv("INTIFACE_ENGINE_PATH", "").strip()
    if env_path:
        candidate = pathlib.Path(env_path).expanduser()
        if candidate.is_file():
            return candidate
    for name in _ENGINE_NAMES:
        found = shutil.which(name)
        if found:
            return pathlib.Path(found)

    home = pathlib.Path.home()
    found = _search_engine(home / ".pes-lovense" / "engine", depth=6)
    if found is not None:
        return found

    appdata = os.getenv("APPDATA")
    localappdata = os.getenv("LOCALAPPDATA")
    program_files = os.getenv("ProgramFiles")
    program_files_x86 = os.getenv("ProgramFiles(x86)")
    candidates: list[pathlib.Path] = []
    if appdata:
        candidates.append(
            pathlib.Path(appdata)
            / "com.nonpolynomial"
            / "intiface_central"
            / "engine"
            / "intiface-engine.exe"
        )
    if localappdata:
        candidates.extend(
            [
                pathlib.Path(localappdata)
                / "IntifaceCentral"
                / "engine"
                / "intiface-engine.exe",
                pathlib.Path(localappdata)
                / "IntifaceCentral"
                / "data"
                / "engine"
                / "intiface-engine.exe",
            ]
        )
    for prefix in (program_files, program_files_x86):
        if prefix:
            candidates.append(
                pathlib.Path(prefix)
                / "IntifaceCentral"
                / "engine"
                / "intiface-engine.exe"
            )
    candidates.extend(
        [
            home
            / "Library"
            / "Application Support"
            / "com.nonpolynomial"
            / "intiface_central"
            / "engine"
            / "intiface-engine",
            home
            / ".local"
            / "share"
            / "com.nonpolynomial"
            / "intiface_central"
            / "engine"
            / "intiface-engine",
            home
            / ".local"
            / "share"
            / "IntifaceCentral"
            / "engine"
            / "intiface-engine",
            pathlib.Path(
                "/Applications/Intiface Central.app/Contents/Resources/engine/intiface-engine"
            ),
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    roots: list[pathlib.Path] = []
    if appdata:
        roots.append(pathlib.Path(appdata) / "com.nonpolynomial" / "intiface_central")
    if localappdata:
        roots.append(pathlib.Path(localappdata) / "IntifaceCentral")
    for prefix in (program_files, program_files_x86):
        if prefix:
            roots.append(pathlib.Path(prefix) / "IntifaceCentral")
    roots.extend(
        [
            home
            / "Library"
            / "Application Support"
            / "com.nonpolynomial"
            / "intiface_central",
            home / ".local" / "share" / "com.nonpolynomial" / "intiface_central",
            home / ".local" / "share" / "IntifaceCentral",
        ]
    )
    for root in roots:
        found = _search_engine(root)
        if found is not None:
            return found
    return None


def _platform_token() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    arm = machine in {"arm64", "aarch64"}
    if system == "windows":
        return "win-arm64" if arm else "win-x64"
    if system == "darwin":
        return "macos-arm64" if arm else "macos-x64"
    return "linux-arm64" if arm else "linux-x64"


def _resolve_download() -> tuple[str, str | None, str] | None:
    override = os.getenv("INTIFACE_ENGINE_DOWNLOAD_URL", "").strip()
    if override:
        return override, None, "custom"
    try:
        request = urllib.request.Request(
            _GITHUB_RELEASES,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "PES-Lovense-Companion",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            releases = json.loads(response.read())
    except Exception as err:
        print(f"[companion] release lookup failed: {err}", file=sys.stderr)
        releases = []
    if isinstance(releases, list):
        token = _platform_token()
        for release in releases:
            tag = str(release.get("tag_name") or "")
            if not tag.startswith("intiface-engine-") or release.get("prerelease"):
                continue
            for asset in release.get("assets") or []:
                name = str(asset.get("name") or "")
                if token not in name or not name.endswith(".zip"):
                    continue
                digest = str(asset.get("digest") or "")
                sha256 = (
                    digest.split(":", 1)[1]
                    if digest.startswith("sha256:")
                    else None
                )
                return str(asset.get("browser_download_url") or ""), sha256, tag
    token = _platform_token()
    asset_name = f"intiface-engine-v{_FALLBACK_VERSION}-{token}.zip"
    url = (
        "https://github.com/buttplugio/buttplug/releases/download/"
        f"intiface-engine-{_FALLBACK_VERSION}/{asset_name}"
    )
    sha256 = _FALLBACK_SHA256.get(token)
    if sha256 is None and token == "win-arm64":
        sha256 = _FALLBACK_SHA256.get("win-x64")
    return url, sha256, f"intiface-engine-{_FALLBACK_VERSION}"


def download_engine() -> pathlib.Path | None:
    resolved = _resolve_download()
    if resolved is None:
        return None
    url, expected_sha, version = resolved
    target_dir = pathlib.Path.home() / ".pes-lovense" / "engine" / "current"
    binary_name = "intiface-engine.exe" if os.name == "nt" else "intiface-engine"
    target = target_dir / binary_name
    version_file = target_dir / "version.txt"
    if (
        target.is_file()
        and version_file.is_file()
        and version_file.read_text(encoding="utf-8").strip() == version
    ):
        return target
    print(f"[companion] downloading Intiface Engine: {url}")
    try:
        request = urllib.request.Request(
            url, headers={"User-Agent": "PES-Lovense-Companion"}
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
    except Exception as err:
        print(f"[companion] engine download failed: {err}", file=sys.stderr)
        return None
    if expected_sha:
        digest = hashlib.sha256(data).hexdigest()
        if digest.lower() != expected_sha.lower():
            print(
                "[companion] engine download failed SHA-256 verification",
                file=sys.stderr,
            )
            return None
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            member = next(
                (
                    name
                    for name in archive.namelist()
                    if pathlib.Path(name).name.lower() in _ENGINE_NAMES
                ),
                None,
            )
            if member is None:
                raise RuntimeError("archive has no engine binary")
            target_dir.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(member))
            version_file.write_text(version, encoding="utf-8")
    except Exception as err:
        print(f"[companion] engine extraction failed: {err}", file=sys.stderr)
        return None
    if os.name != "nt":
        try:
            target.chmod(0o755)
        except OSError:
            pass
    print(f"[companion] Intiface Engine installed: {target}")
    return target


def ensure_engine(args: argparse.Namespace) -> subprocess.Popen | None:
    """Start Intiface Engine locally when no server is already listening."""
    if args.no_managed_intiface:
        return None
    parsed = urlparse(args.intiface)
    host = (parsed.hostname or "127.0.0.1").lower()
    if host not in {"127.0.0.1", "localhost", "::1"}:
        return None
    port = parsed.port or 12345
    if _port_open(port):
        print(f"[companion] using existing Intiface on port {port}")
        return None
    path = detect_engine(args.intiface_engine)
    if path is None:
        path = download_engine()
    if path is None:
        print(
            "[companion] Intiface Engine not found. Install Intiface Central, "
            "pass --intiface-engine <path>, or allow the automatic download.",
            file=sys.stderr,
        )
        return None
    print(f"[companion] starting Intiface Engine: {path}")
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    log_path = pathlib.Path("companion-intiface.log")
    log_handle = open(log_path, "ab", buffering=0)
    try:
        proc = subprocess.Popen(
            [
                str(path),
                "--websocket-port",
                str(port),
                "--server-name",
                "PES Companion Intiface",
                "--use-bluetooth-le",
            ],
            cwd=str(path.parent),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
            start_new_session=os.name != "nt",
        )
    except Exception as err:
        log_handle.close()
        print(f"[companion] failed to start Intiface: {err}", file=sys.stderr)
        return None
    started = time.monotonic()
    while time.monotonic() - started < 20:
        if proc.poll() is not None:
            print(
                f"[companion] Intiface exited during startup (code {proc.returncode}); "
                "see companion-intiface.log",
                file=sys.stderr,
            )
            log_handle.close()
            return None
        if _port_open(port):
            print(f"[companion] Intiface ready on port {port}")
            return proc
        time.sleep(0.25)
    print("[companion] Intiface did not open its port in time", file=sys.stderr)
    stop_engine(proc)
    log_handle.close()
    return None


def stop_engine(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


async def stop_all_intiface(url: str) -> None:
    """Best-effort StopAllDevices on the local Intiface server."""
    try:
        async with connect(url, open_timeout=2, close_timeout=2) as ws:
            await ws.send(
                json.dumps(
                    [
                        {
                            "RequestServerInfo": {
                                "Id": 1,
                                "ClientName": "PES Companion",
                                "ProtocolVersionMajor": 4,
                                "ProtocolVersionMinor": 0,
                            }
                        }
                    ]
                )
            )
            await asyncio.wait_for(ws.recv(), timeout=2)
            await ws.send(
                json.dumps(
                    [{"StopCmd": {"Id": 2, "Inputs": True, "Outputs": True}}]
                )
            )
            await asyncio.sleep(0.2)
    except Exception as err:
        print(f"[companion] stop-all failed: {err}", file=sys.stderr)


async def run_once(args: argparse.Namespace) -> None:
    headers = {"Authorization": f"Bearer {args.token}"}
    async with connect(
        args.server,
        additional_headers=headers,
        subprotocols=[SUBPROTOCOL],
        ping_interval=20,
        ping_timeout=20,
        max_size=1024 * 1024,
    ) as pes:
        await pes.send(
            json.dumps(
                {
                    "type": "hello",
                    "version": PROTOCOL_VERSION,
                    "name": args.name,
                    "intiface": args.intiface,
                }
            )
        )
        welcome = json.loads(await asyncio.wait_for(pes.recv(), timeout=10))
        if not isinstance(welcome, dict) or welcome.get("type") != "welcome":
            raise RuntimeError(f"unexpected handshake: {welcome!r}")
        if args.verbose:
            print(f"[companion] connected to node {welcome.get('node_id')}")

        async with connect(args.intiface, max_size=1024 * 1024) as intiface:
            if args.verbose:
                print(f"[companion] connected to {args.intiface}")

            async def pes_to_intiface() -> None:
                async for raw in pes:
                    if isinstance(raw, str):
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            data = None
                        if isinstance(data, dict) and data.get("type") == "ping":
                            await pes.send(
                                json.dumps({"type": "pong", "t": data.get("t")})
                            )
                            continue
                        if isinstance(data, dict) and data.get("type") in {
                            "hello",
                            "welcome",
                        }:
                            continue
                    await intiface.send(raw)

            async def intiface_to_pes() -> None:
                async for raw in intiface:
                    await pes.send(raw)

            tasks = [
                asyncio.create_task(pes_to_intiface()),
                asyncio.create_task(intiface_to_pes()),
            ]
            try:
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in tasks:
                    task.cancel()


async def main_async(args: argparse.Namespace) -> None:
    backoff = 1.0
    while True:
        try:
            await run_once(args)
            backoff = 1.0
        except asyncio.CancelledError:
            raise
        except Exception as err:
            print(f"[companion] disconnected: {err}", file=sys.stderr)
        # Always fail safe: a lost PES or Intiface must not leave a toy on.
        await stop_all_intiface(args.intiface)
        print(f"[companion] reconnecting in {backoff:.0f}s")
        await asyncio.sleep(backoff)
        backoff = min(30.0, backoff * 2)


def main() -> None:
    parser = argparse.ArgumentParser(description="PES Lovense companion")
    parser.add_argument("--server", required=True, help="PES relay WebSocket URL")
    parser.add_argument("--token", required=True, help="Relay node token")
    parser.add_argument(
        "--intiface",
        default="ws://127.0.0.1:12345",
        help="Local Intiface WebSocket URL",
    )
    parser.add_argument("--name", default="PES companion", help="Companion name")
    parser.add_argument(
        "--intiface-engine",
        default="",
        help="Optional intiface-engine binary path (auto-detected when empty)",
    )
    parser.add_argument(
        "--no-managed-intiface",
        action="store_true",
        help="Never start Intiface Engine; expect it to be already running",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    engine_proc = ensure_engine(args)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    task = loop.create_task(main_async(args))
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, task.cancel)
        except NotImplementedError:  # Windows
            pass
    try:
        loop.run_until_complete(task)
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        loop.run_until_complete(stop_all_intiface(args.intiface))
        stop_engine(engine_proc)
        loop.close()


if __name__ == "__main__":
    main()
