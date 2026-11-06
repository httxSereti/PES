"""
Managed Intiface Engine.

PES can launch the headless `intiface-engine` binary itself, wait for its
WebSocket port and use it as a normal direct node. If an Intiface server is
already listening on the port (Intiface Central started by the user), PES
reuses it instead of spawning a second engine.

The engine is an external binary: PES never bundles it, but it can find the
copy installed by Intiface Central and start it with the Bluetooth LE device
manager enabled.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import os
import pathlib
import platform
import shlex
import shutil
import socket
import subprocess
import time
import zipfile
from typing import TYPE_CHECKING, Any

import aiohttp
import structlog

if TYPE_CHECKING:
    from .hub import LovenseHub

logger = structlog.get_logger("pes")

_ENGINE_NAMES = ("intiface-engine.exe", "intiface-engine")
_START_TIMEOUT_S = 20.0
_STOP_TIMEOUT_S = 5.0
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
_INSTALL_DIR = (
    pathlib.Path(__file__).resolve().parents[3] / "userdata" / "intiface-engine"
)


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


def _search_engine(root: pathlib.Path, depth: int = 4) -> pathlib.Path | None:
    """Bounded recursive search for the engine binary."""
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
    """Find intiface-engine from a setting, PATH or an Intiface Central install."""
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

    for managed_root in (
        _INSTALL_DIR,
        pathlib.Path.home() / ".pes-lovense" / "engine",
    ):
        found = _search_engine(managed_root, depth=6)
        if found is not None:
            return found

    candidates: list[pathlib.Path] = []
    home = pathlib.Path.home()
    appdata = os.getenv("APPDATA")
    localappdata = os.getenv("LOCALAPPDATA")
    program_files = os.getenv("ProgramFiles")
    program_files_x86 = os.getenv("ProgramFiles(x86)")

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
    # macOS / Linux application-support locations used by Intiface Central.
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
            pathlib.Path("/Applications/Intiface Central.app/Contents/Resources/engine/intiface-engine"),
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    # Last resort: bounded search in the known app directories.
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
            home / "Library" / "Application Support" / "com.nonpolynomial" / "intiface_central",
            home / ".local" / "share" / "com.nonpolynomial" / "intiface_central",
            home / ".local" / "share" / "IntifaceCentral",
        ]
    )
    for root in roots:
        found = _search_engine(root)
        if found is not None:
            return found
    return None


class ManagedIntiface:
    """Owns the optional intiface-engine child process."""

    def __init__(self, hub: LovenseHub):
        self._hub = hub
        self._proc: subprocess.Popen | None = None
        self._log_handle: Any = None
        self._monitor_task: asyncio.Task | None = None
        self._status = "stopped"
        self._last_error: str | None = None
        self._path: str | None = None
        self._owned = False
        self._external = False
        self._started_at: float | None = None
        self._lock = asyncio.Lock()

    # ───────── Settings ─────────

    @property
    def port(self) -> int:
        return max(1, min(65535, self._hub._int("managed_intiface_port", 12345)))

    @property
    def enabled(self) -> bool:
        return self._hub._bool("managed_intiface_enabled", True)

    @property
    def auto_restart(self) -> bool:
        return self._hub._bool("managed_intiface_auto_restart", True)

    @property
    def auto_download(self) -> bool:
        return self._hub._bool("managed_intiface_auto_download", True)

    @property
    def url(self) -> str:
        return f"ws://127.0.0.1:{self.port}"

    @property
    def running(self) -> bool:
        return self._status in {"running", "external"}

    def status_dict(self) -> dict[str, Any]:
        return {
            "status": self._status,
            "running": self.running,
            "owned": self._owned,
            "external": self._external,
            "port": self.port,
            "path": self._path,
            "pid": self._proc.pid if self._proc is not None else None,
            "last_error": self._last_error,
            "log_path": "intiface-engine.log",
        }

    # ───────── Engine download ─────────

    @staticmethod
    def _platform_token() -> str:
        system = platform.system().lower()
        machine = platform.machine().lower()
        arm = machine in {"arm64", "aarch64"}
        if system == "windows":
            return "win-arm64" if arm else "win-x64"
        if system == "darwin":
            return "macos-arm64" if arm else "macos-x64"
        return "linux-arm64" if arm else "linux-x64"

    def _pick_asset(self, release: dict[str, Any]) -> dict[str, Any] | None:
        token = self._platform_token()
        assets = release.get("assets") or []
        for asset in assets:
            name = str(asset.get("name") or "")
            if token in name and name.endswith(".zip"):
                return asset
        # Windows ARM runs x64 under emulation on current Windows versions.
        if token == "win-arm64":
            for asset in assets:
                name = str(asset.get("name") or "")
                if "win-x64" in name and name.endswith(".zip"):
                    return asset
        return None

    async def _resolve_download(self) -> tuple[str, str | None, str] | None:
        """Return (url, sha256 digest, version label) or None."""
        override = os.getenv("INTIFACE_ENGINE_DOWNLOAD_URL", "").strip()
        if override:
            return override, None, "custom"

        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "PlunEStim-Lovense",
        }
        timeout = aiohttp.ClientTimeout(total=30)
        try:
            async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
                async with session.get(_GITHUB_RELEASES) as response:
                    if response.status != 200:
                        raise RuntimeError(f"GitHub API returned {response.status}")
                    releases = await response.json()
        except Exception as err:
            logger.warning(
                "[Lovense] Could not query Intiface Engine releases", error=str(err)
            )
            releases = []
        if not isinstance(releases, list):
            releases = []

        for release in releases:
            tag = str(release.get("tag_name") or "")
            if not tag.startswith("intiface-engine-") or release.get("prerelease"):
                continue
            asset = self._pick_asset(release)
            if asset is None:
                continue
            digest = str(asset.get("digest") or "")
            sha256 = digest.split(":", 1)[1] if digest.startswith("sha256:") else None
            return (
                str(asset.get("browser_download_url") or ""),
                sha256,
                tag,
            )

        # Offline/API failure fallback: a known good release for this platform.
        token = self._platform_token()
        asset_name = f"intiface-engine-v{_FALLBACK_VERSION}-{token}.zip"
        url = (
            "https://github.com/buttplugio/buttplug/releases/download/"
            f"intiface-engine-{_FALLBACK_VERSION}/{asset_name}"
        )
        sha256 = _FALLBACK_SHA256.get(token)
        if sha256 is None and token == "win-arm64":
            sha256 = _FALLBACK_SHA256.get("win-x64")
        return url, sha256, f"intiface-engine-{_FALLBACK_VERSION}"

    async def download_engine(self) -> pathlib.Path | None:
        """Download the official standalone engine and extract its binary."""
        self._status = "downloading"
        self._last_error = None
        self._notify()
        resolved = await self._resolve_download()
        if resolved is None:
            self._status = "not_found"
            self._last_error = "Could not resolve an Intiface Engine download"
            self._notify()
            return None
        url, expected_sha, version = resolved
        target_dir = _INSTALL_DIR / "current"
        binary_name = "intiface-engine.exe" if os.name == "nt" else "intiface-engine"
        target = target_dir / binary_name
        version_file = target_dir / "version.txt"
        if (
            target.is_file()
            and version_file.is_file()
            and version_file.read_text(encoding="utf-8").strip() == version
        ):
            self._path = str(target)
            return target

        logger.info(
            "[Lovense] Downloading Intiface Engine",
            url=url,
            version=version,
        )
        timeout = aiohttp.ClientTimeout(total=180)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, allow_redirects=True) as response:
                    if response.status != 200:
                        raise RuntimeError(f"download returned {response.status}")
                    data = await response.read()
        except Exception as err:
            self._status = "not_found"
            self._last_error = f"Intiface Engine download failed: {err}"
            self._notify()
            logger.warning("[Lovense] %s", self._last_error)
            return None

        if expected_sha:
            digest = hashlib.sha256(data).hexdigest()
            if digest.lower() != expected_sha.lower():
                self._status = "not_found"
                self._last_error = "Intiface Engine download failed SHA-256 verification"
                self._notify()
                logger.error("[Lovense] %s", self._last_error)
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
                    raise RuntimeError("downloaded archive has no engine binary")
                target_dir.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(member))
                version_file.write_text(version, encoding="utf-8")
        except Exception as err:
            self._status = "not_found"
            self._last_error = f"Intiface Engine extraction failed: {err}"
            self._notify()
            logger.warning("[Lovense] %s", self._last_error)
            return None

        if os.name != "nt":
            try:
                target.chmod(0o755)
            except OSError:
                pass
        self._path = str(target)
        logger.info("[Lovense] Intiface Engine downloaded", path=self._path)
        return target

    async def _ensure_engine_binary(self) -> pathlib.Path | None:
        explicit = str(self._hub._setting("intiface_engine_path", "") or "")
        path = detect_engine(explicit)
        if path is not None:
            return path
        if not self.auto_download:
            return None
        return await self.download_engine()

    # ───────── Lifecycle ─────────

    async def start(self) -> dict[str, Any]:
        if self._status == "starting":
            return self.status_dict()
        self._last_error = None
        if self._proc is not None and self._proc.poll() is None:
            return self.status_dict()
        if self._proc is not None and self._proc.poll() is not None:
            self._proc = None
            self._close_log()
        if self._port_open():
            self._status = "external"
            self._external = True
            self._owned = False
            self._last_error = None
            logger.info(
                "[Lovense] Reusing an existing Intiface server",
                port=self.port,
            )
            self._notify()
            return self.status_dict()

        explicit = str(self._hub._setting("intiface_engine_path", "") or "")
        path = detect_engine(explicit)
        if path is None:
            path = await self._ensure_engine_binary()
        if path is None:
            self._status = "not_found"
            self._external = False
            self._owned = False
            self._path = None
            if not self._last_error:
                self._last_error = (
                    "Intiface Engine not found. Enable "
                    "'managed_intiface_auto_download' or set "
                    "'intiface_engine_path' to an intiface-engine binary."
                )
            logger.warning("[Lovense] %s", self._last_error)
            self._notify()
            return self.status_dict()

        self._path = str(path)
        self._status = "starting"
        self._last_error = None
        self._notify()
        logger.info(
            "[Lovense] Starting Intiface Engine",
            path=self._path,
            port=self.port,
        )

        extra = str(
            self._hub._setting("intiface_extra_args", "--use-bluetooth-le") or ""
        )
        args = [
            self._path,
            "--websocket-port",
            str(self.port),
            "--server-name",
            "PES Intiface",
        ]
        args.extend(shlex.split(extra, posix=os.name != "nt"))
        if "--use-bluetooth-le" not in args:
            args.append("--use-bluetooth-le")

        try:
            log_path = pathlib.Path("intiface-engine.log")
            self._log_handle = open(log_path, "ab", buffering=0)
            creationflags = 0
            if os.name == "nt":
                creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            self._proc = subprocess.Popen(
                args,
                cwd=str(path.parent),
                stdin=subprocess.DEVNULL,
                stdout=self._log_handle,
                stderr=subprocess.STDOUT,
                creationflags=creationflags,
                start_new_session=os.name != "nt",
            )
        except Exception as err:
            self._status = "error"
            self._last_error = str(err)
            self._close_log()
            logger.exception("[Lovense] Failed to start Intiface Engine")
            self._notify()
            return self.status_dict()

        started = time.monotonic()
        while time.monotonic() - started < _START_TIMEOUT_S:
            if self._proc.poll() is not None:
                code = self._proc.returncode
                self._status = "error"
                self._last_error = (
                    f"Intiface Engine exited during startup (code {code}). "
                    "Check intiface-engine.log."
                )
                self._close_log()
                logger.error("[Lovense] %s", self._last_error)
                self._notify()
                return self.status_dict()
            if await asyncio.to_thread(self._port_open):
                self._status = "running"
                self._owned = True
                self._external = False
                self._started_at = time.monotonic()
                self._monitor_task = asyncio.create_task(
                    self._monitor(), name="lovense-intiface-monitor"
                )
                logger.info(
                    "[Lovense] Intiface Engine ready",
                    port=self.port,
                    pid=self._proc.pid,
                )
                self._notify()
                return self.status_dict()
            await asyncio.sleep(0.25)

        self._status = "error"
        self._last_error = (
            f"Intiface Engine did not open port {self.port} within "
            f"{_START_TIMEOUT_S:.0f}s. Check intiface-engine.log."
        )
        logger.error("[Lovense] %s", self._last_error)
        await self._terminate()
        self._notify()
        return self.status_dict()

    async def stop(self) -> dict[str, Any]:
        if self._monitor_task is not None:
            self._monitor_task.cancel()
            self._monitor_task = None
        if self._external and self._port_open():
            # The user's own Intiface Central is still running: leave it alone.
            self._status = "external"
            self._notify()
            return self.status_dict()
        if self._owned:
            await self._terminate()
        self._status = "stopped"
        self._owned = False
        self._external = False
        self._started_at = None
        self._notify()
        logger.info("[Lovense] Managed Intiface stopped")
        return self.status_dict()

    async def restart(self) -> dict[str, Any]:
        await self.stop()
        return await self.start()

    async def ensure_running(self) -> dict[str, Any]:
        if self.running:
            return self.status_dict()
        return await self.start()

    # ───────── Internal ─────────

    def _port_open(self) -> bool:
        return _port_open(self.port)

    async def _terminate(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            self._close_log()
            return
        if proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                await asyncio.to_thread(proc.wait, _STOP_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                except Exception:
                    pass
                try:
                    await asyncio.to_thread(proc.wait, 2)
                except Exception:
                    pass
        self._close_log()

    def _close_log(self) -> None:
        if self._log_handle is not None:
            try:
                self._log_handle.close()
            except Exception:
                pass
            self._log_handle = None

    async def _monitor(self) -> None:
        backoff = 5.0
        while True:
            await asyncio.sleep(2)
            proc = self._proc
            if proc is not None and proc.poll() is None:
                backoff = 5.0
                continue
            if proc is None and not self.auto_restart:
                return
            if proc is not None:
                code = proc.returncode
                self._proc = None
                self._owned = False
                self._status = "error"
                self._last_error = f"Intiface Engine exited (code {code})"
                self._close_log()
                logger.warning("[Lovense] %s", self._last_error)
                self._notify()
            if not self.auto_restart:
                return
            await asyncio.sleep(backoff)
            backoff = min(30.0, backoff * 2)
            try:
                await self.start()
            except Exception:
                logger.exception("[Lovense] Intiface auto-restart failed")
            if self.running:
                return

    def _notify(self) -> None:
        self._hub.broadcast_intiface(self.status_dict())
