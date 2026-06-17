#!/usr/bin/env python3
"""
Echelon Sync Daemon
===================

A tiny zero-dependency HTTP service that lets the Echelon PWA running
in your phone's browser publish eepsite files to a real on-disk
directory that i2pd serves.

Protocol
--------
POST /publish         JSON: { "eepsite": "<name>.i2p", "files": { "<path>": "<contents>", ... } }
                       Writes each file into <ROOT>/<sanitised-eepsite>/<path>.
                       Replies 200 with a JSON summary.
GET  /list            Lists all published eepsites + their files.
GET  /health          Returns 200 OK; used by the PWA to detect the daemon.
DELETE /eepsite/<name> Removes a published eepsite directory.

Defaults
--------
HOST = 127.0.0.1
PORT = 7071
ROOT = ~/echelon-eepsites

Override with env vars: ECHELON_SYNC_HOST, ECHELON_SYNC_PORT, ECHELON_SYNC_ROOT.

Security
--------
This daemon binds to 127.0.0.1 by default and is intended to run on the
SAME device as the PWA. Do NOT expose it on a LAN or the public internet.
It only allows requests from origins you'd realistically be running the
Echelon PWA from (localhost, file://, and well-known dev ports).

Usage
-----
    pkg install -y python                   # in Termux
    python3 echelon_sync_daemon.py
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Sibling modules: the i2pd web-console scraper.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import i2pd_stats  # noqa: E402
from scripts import i2pd_config  # noqa: E402
from scripts import i2pd_tunnels  # noqa: E402
from scripts import threat_filters  # noqa: E402
from scripts import threat_events  # noqa: E402
from scripts import eepgen_proxy  # noqa: E402
from scripts import auth as auth_mod  # noqa: E402
from scripts import network_doctor as net_doctor  # noqa: E402
from scripts import network_autopilot as net_autopilot  # noqa: E402
from scripts import traffic_regularization  # noqa: E402
from scripts import i2p_fetch  # noqa: E402
from scripts import html_sanitizer  # noqa: E402
from scripts.rate_limiter import RateLimiter  # noqa: E402


def _filters_root() -> Path:
    raw = os.environ.get("ECHELON_FILTERS_ROOT")
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".echelon" / "filters"


def _eepgen_root() -> Path:
    """Root directory for hosted-EepGen state. Override with
    ECHELON_EEPGEN_ROOT (used by tests for isolation)."""
    raw = os.environ.get("ECHELON_EEPGEN_ROOT")
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".echelon" / "eepgen"


def _i2p_proxy_host_port() -> tuple[str, int]:
    """Resolve the i2pd HTTP proxy host/port for eepsite fetches.

    Comes from the daemon's OWN environment, never from the browser
    request — the browser cannot redirect the eepsite fetch at an
    arbitrary host. Defaults to i2pd's 127.0.0.1:4444."""
    host = os.environ.get("ECHELON_I2PD_PROXY_HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("ECHELON_I2PD_PROXY_PORT", "4444"))
    except ValueError:
        port = 4444
    return host, port


def _i2pd_tunnels_path() -> Path:
    """Resolve the i2pd tunnels.conf path. Override with ECHELON_I2PD_TUNNELS."""
    raw = os.environ.get("ECHELON_I2PD_TUNNELS")
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".i2pd" / "tunnels.conf"

HOST = os.environ.get("ECHELON_SYNC_HOST", "127.0.0.1")
PORT = int(os.environ.get("ECHELON_SYNC_PORT", "7071"))
ROOT = Path(os.environ.get("ECHELON_SYNC_ROOT", str(Path.home() / "echelon-eepsites"))).resolve()
MAX_BODY = 80 * 1024 * 1024  # 80 MB hard cap on a single publish (room for 64 MB eepsite + JSON overhead)

# Per-file and per-eepsite size caps (Phase I.2). The /publish endpoint
# enforces both — caps a single template/HTML file from blowing up
# the daemon's disk, and caps total per-eepsite footprint so a user
# can't accidentally fill their phone with one bloated site.
MAX_FILE_BYTES = 4 * 1024 * 1024   # 4 MB per file
MAX_EEPSITE_BYTES = 64 * 1024 * 1024  # 64 MB per eepsite total


def _i2pd_config_path() -> Path:
    """Resolve the i2pd config path. Override with ECHELON_I2PD_CONFIG."""
    raw = os.environ.get("ECHELON_I2PD_CONFIG")
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".i2pd" / "i2pd.conf"


def _yggdrasil_peer_count() -> int | None:
    """Best-effort established-peer count via `yggdrasilctl getPeers`.
    None if yggdrasilctl is unavailable / errors (never raises)."""
    exe = shutil.which("yggdrasilctl")
    if not exe:
        return None
    try:
        r = subprocess.run([exe, "getPeers"], capture_output=True, timeout=4, text=True)
        if r.returncode != 0:
            return None
        # Count lines that look like peer entries (contain an address).
        # yggdrasilctl output lists one peer per line under a header.
        lines = [ln for ln in r.stdout.splitlines() if "://" in ln or ":" in ln]
        # Header line excluded by requiring a URI-ish token.
        peers = [ln for ln in lines if "://" in ln]
        return len(peers)
    except Exception:  # noqa: BLE001
        return None


def _i2pd_meshnet_enabled() -> bool | None:
    """Is `[meshnets] yggdrasil = true` set in i2pd.conf? None if unreadable."""
    try:
        text = _i2pd_config_path().read_text(encoding="utf-8")
    except OSError:
        return None
    in_meshnets = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].split(";", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            in_meshnets = line[1:-1].strip().lower() == "meshnets"
            continue
        if "=" in line:
            k, v = (p.strip().lower() for p in line.split("=", 1))
            # accept both sectioned and dotted forms
            if k == "yggdrasil" and in_meshnets:
                return v in ("true", "1", "yes", "on")
            if k == "meshnets.yggdrasil":
                return v in ("true", "1", "yes", "on")
    return False


def _termux_wake_lock_held() -> bool | None:
    """Best-effort: is a Termux wake-lock held? Detected via the wake-lock
    notification marker file Termux maintains. None if undeterminable."""
    prefix = os.environ.get("PREFIX", "")
    if "com.termux" not in prefix:
        return None
    # Termux exposes wake-lock state through its service; we check for the
    # termux-wake-lock helper and the process marker. Honest fallback: None.
    marker = Path(os.environ.get("HOME", "")) / ".termux" / "wake-lock"
    if marker.exists():
        return True
    if not shutil.which("termux-wake-lock"):
        return None  # tooling absent — can't tell
    return False

logging.basicConfig(level=logging.INFO, format="[echelon-sync] %(message)s")
log = logging.getLogger("echelon-sync")

# Echelon will run inside a browser. We accept localhost-ish origins so
# the PWA can talk to us via fetch() without being blocked by CORS.
ALLOWED_ORIGIN_PATTERNS = [
    re.compile(r"^https?://localhost(:\d+)?$"),
    re.compile(r"^https?://127\.0\.0\.1(:\d+)?$"),
    re.compile(r"^https?://0\.0\.0\.0(:\d+)?$"),
    re.compile(r"^https?://\[?::1\]?(:\d+)?$"),
    # PWA installed on-device:
    re.compile(r"^https?://[^/]+\.local(:\d+)?$"),
    # Capacitor / cordova:
    re.compile(r"^capacitor://localhost$"),
    re.compile(r"^ionic://localhost$"),
    re.compile(r"^file://$"),
]

SAFE_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,62}\.i2p$")
SAFE_PATH_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")


def cors_allowed(origin: str | None) -> str | None:
    if not origin:
        return "*"  # curl etc. — same-device, fine.
    for pat in ALLOWED_ORIGIN_PATTERNS:
        if pat.match(origin):
            return origin
    return None


def sanitise_eepsite_name(raw: str) -> str | None:
    name = raw.strip().lower()
    if not name.endswith(".i2p"):
        name += ".i2p"
    return name if SAFE_NAME.match(name) else None


def sanitise_relative_path(raw: str) -> str | None:
    """Reject any path that escapes the eepsite directory or that uses
    syntax we don't want to silently accept (absolute paths, backslashes,
    leading-slash). Returns the cleaned forward-slash-joined path on
    success, None on failure."""
    if not isinstance(raw, str) or not raw:
        return None
    if "\\" in raw:
        return None  # we don't accept Windows-style separators in paths
    if raw.startswith("/"):
        return None  # we don't accept absolute paths
    parts = [p for p in raw.split("/") if p]
    if not parts:
        return None
    for p in parts:
        if not SAFE_PATH_SEGMENT.match(p):
            return None
        if p in (".", ".."):
            return None
    return "/".join(parts)


class Handler(BaseHTTPRequestHandler):
    server_version = "EchelonSync/1.0"
    rate_limiter = RateLimiter(rate=30.0, capacity=50)

    # --- helpers -------------------------------------------------------

    def _send_json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        origin = cors_allowed(self.headers.get("Origin"))
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Echelon-Auth")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_bytes(self, status: int, content_type: str, data: bytes, extra_headers: dict | None = None) -> None:
        """Send a raw byte response (sanitized eepsite HTML or a proxied
        resource). The CSP header is a defense-in-depth backstop to the
        CSP <meta> the sanitizer injects."""
        origin = cors_allowed(self.headers.get("Origin"))
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "invalid Content-Length"})
            return None
        if length <= 0 or length > MAX_BODY:
            # Drain the inbound body before responding so the client
            # gets the response cleanly instead of an RST.
            remaining = max(length, 0)
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            self._send_json(413, {"error": "request body too large or empty"})
            return None
        try:
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            self._send_json(400, {"error": f"invalid JSON: {e}"})
            return None

    def log_message(self, fmt: str, *args) -> None:  # quieter
        log.info("%s - %s", self.client_address[0], fmt % args)

    def _check_auth(self, path: str) -> bool:
        """Apply the optional X-Echelon-Auth gate. Returns True if the
        request may proceed; False if a 401/503 response was already sent."""
        if not auth_mod.require_auth_enabled():
            return True
        try:
            expected = auth_mod.load_or_create_secret()
        except OSError:
            expected = None
        submitted = self.headers.get("X-Echelon-Auth")
        verdict = auth_mod.auth_status_for(
            path,
            submitted_token=submitted,
            expected_token=expected,
            require_auth=True,
        )
        if verdict is None:
            return True
        status, message = verdict
        self._send_json(status, {"error": message})
        return False

    def _check_write_guard(self) -> bool:
        """CSRF/cross-origin guard for state-changing methods. Returns True
        if the request may proceed; False if a rejection was already sent.
        Closes the 'malicious clearnet page makes the browser POST to
        127.0.0.1' hole independently of the optional auth token."""
        verdict = auth_mod.write_request_rejection(
            origin=self.headers.get("Origin"),
            content_type=self.headers.get("Content-Type"),
            method=self.command,
            allow_match=lambda o: cors_allowed(o) is not None,
        )
        if verdict is None:
            return True
        status, message = verdict
        self._send_json(status, {"error": message})
        return False

    # --- browse (eepsite fetch + sanitize) -----------------------------

    def _handle_browse(self) -> None:
        """GET /browse?url=<eepsite> — fetch through i2pd, sanitize,
        return safe HTML. This is the ONLY path by which the browser
        renders eepsite content; the webview never touches i2pd directly,
        and never sees un-sanitized HTML (deanonymization defense)."""
        qs = parse_qs(urlparse(self.path).query)
        raw_url = (qs.get("url") or [""])[0]
        if not raw_url:
            self._send_json(400, {"error": "missing url parameter"})
            return
        proxy_host, proxy_port = _i2p_proxy_host_port()
        try:
            result = i2p_fetch.fetch_eepsite(raw_url, proxy_host=proxy_host, proxy_port=proxy_port)
        except i2p_fetch.I2pFetchError as e:
            # Structured error → the browser maps reason to a SmartErrorPage.
            self._send_json(502, {"error": e.message, "reason": e.reason})
            return

        ctype = (result.content_type or "").lower()
        if "text/html" not in ctype and "application/xhtml" not in ctype:
            # Non-HTML top-level navigation (a PDF, image, etc.). Serve it
            # through the resource path semantics: pass the bytes with the
            # original content-type but never let it execute. Simplest safe
            # behavior: hand it back as a download-ish response.
            self._send_bytes(
                result.status,
                result.content_type or "application/octet-stream",
                result.body,
                extra_headers={"Content-Disposition": "inline"},
            )
            return

        try:
            html_text = result.body.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            html_text = result.body.decode("latin-1", errors="replace")

        safe_html, report = html_sanitizer.sanitize_html(html_text, result.final_url)
        safe_bytes = safe_html.encode("utf-8")

        # WF-defense: when the client opts into traffic regularization
        # (?wf=1, Privacy tier), report the on-wire shape the daemon would
        # emit under Tamaraw-style padding. The regularized byte length is
        # a function only of the anonymity-set bucket, so the response
        # *size* leaks only the bucket, not which eepsite. We surface the
        # shape in headers; the actual constant-rate emission is applied by
        # the transport wrapper when streaming to the client.
        extra = {
            "Content-Security-Policy": html_sanitizer.INJECTED_CSP,
            "X-Frame-Options": "SAMEORIGIN",
            "X-Echelon-Blocked": str(report.blocked_clearnet),
            "X-Echelon-Scripts-Removed": str(report.scripts_removed),
            "X-Echelon-Rewritten": str(report.rewritten_in_network),
            "X-Echelon-Final-Url": result.final_url,
        }
        wf = parse_qs(urlparse(self.path).query).get("wf", ["0"])[0] in ("1", "true", "yes")
        if wf:
            shape = traffic_regularization.regularize(len(safe_bytes))
            extra["X-Echelon-WF-Defense"] = "tamaraw"
            extra["X-Echelon-WF-Cells"] = str(shape.cells)
            extra["X-Echelon-WF-Padded-Bytes"] = str(shape.padded_bytes)
            extra["X-Echelon-WF-Bucket"] = str(shape.bucket)
            # Sprint C: actually frame+pad the body to the bucket length and
            # pace it as constant-rate cells. The client recovers the exact
            # sanitized HTML via the documented [4-byte len][data][zeros]
            # framing (X-Echelon-WF-Framed tells it to unpad).
            extra["X-Echelon-WF-Framed"] = "tamaraw-v1"
            extra["X-Echelon-WF-Cell-Size"] = str(traffic_regularization.RegularizationParams().cell_size)
            framed = traffic_regularization.pad_payload(safe_bytes)
            self._send_paced_cells(result.status, framed, extra)
            return

        self._send_bytes(
            result.status,
            "text/html; charset=utf-8",
            safe_bytes,
            extra_headers=extra,
        )

    def _send_paced_cells(self, status: int, framed: bytes, extra_headers: dict) -> None:
        """Stream an already-framed/padded body as constant-rate cells.
        Content-Length is the padded length (the observable). Pacing is
        capped so a huge page can't stall the connection for minutes; the
        cell *sizes* and *count* (the dominant WF signal) are always exact."""
        origin = cors_allowed(self.headers.get("Origin"))
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(framed)))
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in extra_headers.items():
            self.send_header(k, v)
        self.end_headers()
        p = traffic_regularization.RegularizationParams()
        interval_s = p.rate_interval_ms / 1000.0
        # Bound total pacing time; beyond the budget, flush the rest at once.
        budget_s = float(os.environ.get("ECHELON_WF_PACING_BUDGET_S", "2.0"))
        spent = 0.0
        for i in range(0, len(framed), p.cell_size):
            self.wfile.write(framed[i:i + p.cell_size])
            if spent < budget_s:
                time.sleep(interval_s)
                spent += interval_s

    def _gather_doctor(self, probe: bool):
        """Shared input-gathering for the doctor + autopilot endpoints.
        Returns (DoctorInputs, platform, yggdrasil_running)."""
        console_host = os.environ.get("ECHELON_I2PD_CONSOLE_HOST", "127.0.0.1")
        try:
            console_port = int(os.environ.get("ECHELON_I2PD_CONSOLE_PORT", "7070"))
        except ValueError:
            console_port = 7070
        stats = i2pd_stats.fetch_i2pd_stats(console_host, console_port, timeout=4.0)

        ygg_installed = shutil.which("yggdrasil") is not None
        ygg_running = False
        try:
            r = subprocess.run(["pgrep", "-f", "yggdrasil"], capture_output=True, timeout=3)
            ygg_running = r.returncode == 0 and bool(r.stdout.strip())
        except Exception:  # noqa: BLE001
            ygg_running = False

        eepsite_ok = None
        if probe:
            proxy_host, proxy_port = _i2p_proxy_host_port()
            try:
                res = i2p_fetch.fetch_eepsite(
                    "shx5vqsw7usdaunyzr2qmes2fq37oumybpudrd4jjj4e4vk4uusa.b32.i2p",
                    proxy_host=proxy_host, proxy_port=proxy_port,
                )
                eepsite_ok = res.status == 200
            except Exception:  # noqa: BLE001
                eepsite_ok = False

        platform = "termux" if "com.termux" in os.environ.get("PREFIX", "") else (
            "macos" if sys.platform == "darwin" else "generic"
        )
        is_termux = platform == "termux"
        inp = net_doctor.DoctorInputs(
            daemon_reachable=True,
            i2pd_stats=stats,
            yggdrasil_installed=ygg_installed,
            yggdrasil_running=ygg_running,
            eepsite_probe_ok=eepsite_ok,
            yggdrasil_peers=_yggdrasil_peer_count() if ygg_running else None,
            i2pd_meshnet_enabled=_i2pd_meshnet_enabled(),
            termux_wake_lock=_termux_wake_lock_held() if is_termux else None,
            platform_is_termux=is_termux,
        )
        return inp, platform, ygg_running

    def _handle_network_doctor(self) -> None:
        """GET /network/doctor[?probe=1] — diagnose I2P connectivity and
        return a prioritized fix. The in-app Network Doctor screen renders
        this; the CLI shares the same diagnose() engine."""
        qs = parse_qs(urlparse(self.path).query)
        probe = (qs.get("probe") or ["0"])[0] in ("1", "true", "yes")
        inp, platform, _ygg = self._gather_doctor(probe)
        diag = net_doctor.diagnose(inp, platform=platform)
        self._send_json(200, diag.to_dict())

    def _handle_network_mode(self, plan_only: bool) -> None:
        """GET /network/mode + /network/autofix-plan — the autopilot.
        Maps the diagnosis to a mode (A_NATIVE..E_DEGRADED) + a plan that
        separates fixes the daemon can apply itself from user actions."""
        qs = parse_qs(urlparse(self.path).query)
        probe = (qs.get("probe") or ["0"])[0] in ("1", "true", "yes")
        inp, platform, ygg_running = self._gather_doctor(probe)
        diag = net_doctor.diagnose(inp, platform=platform)
        plan = net_autopilot.classify_mode(diag, yggdrasil_running=ygg_running)
        body = plan.to_dict()
        if not plan_only:
            # /network/mode = just the headline mode + reason.
            self._send_json(200, {"mode": body["mode"], "reason": body["reason"]})
        else:
            self._send_json(200, body)

    def _handle_apply_safe_config(self) -> None:
        """POST /network/apply-safe-config {fixes:[codes]} — apply ONLY the
        no-root i2pd config fixes (client-mode). Anything needing install
        or sudo is REFUSED with a reason; we never claim to have done
        something we didn't. Writes via the whitelisted i2pd_config writer."""
        body = self._read_json()
        if body is None:
            return
        if not isinstance(body, dict):
            self._send_json(400, {"error": "expected JSON object"})
            return
        requested = body.get("fixes")
        if not isinstance(requested, list) or not all(isinstance(x, str) for x in requested):
            self._send_json(400, {"error": "fixes must be a list of strings"})
            return

        edits, applied, refused = net_autopilot.applicable_safe_edits(requested)
        if edits:
            cfg_path = _i2pd_config_path()
            try:
                i2pd_config.write_i2pd_config(cfg_path, edits)
            except (ValueError, OSError) as e:
                self._send_json(500, {"error": f"could not write i2pd config: {e}"})
                return

        self._send_json(200, {
            "applied": applied,
            "refused": refused,
            "writtenKeys": list(edits.keys()),
            "note": (
                "Refused fixes require installation or admin rights and cannot be "
                "auto-applied — see the recommendation for the manual step. "
                "Restart i2pd for applied config changes to take effect."
            ) if refused else "Restart i2pd for changes to take effect.",
        })

    def _handle_browse_resource(self) -> None:
        """GET /browse/resource?url=<in-network resource> — fetch a
        sub-resource (image, stylesheet) through i2pd and return its raw
        bytes. The sanitizer rewrote in-network resource URLs to point
        here. Only .i2p hosts are fetchable (i2p_fetch enforces). CSS
        responses are themselves sanitized for nested url()/@import."""
        qs = parse_qs(urlparse(self.path).query)
        raw_url = (qs.get("url") or [""])[0]
        if not raw_url:
            self._send_json(400, {"error": "missing url parameter"})
            return
        proxy_host, proxy_port = _i2p_proxy_host_port()
        try:
            result = i2p_fetch.fetch_eepsite(raw_url, proxy_host=proxy_host, proxy_port=proxy_port)
        except i2p_fetch.I2pFetchError as e:
            self._send_json(502, {"error": e.message, "reason": e.reason})
            return

        ctype = (result.content_type or "application/octet-stream").lower()
        # CSS can itself reference clearnet via url()/@import — sanitize it.
        if "text/css" in ctype:
            css_text = result.body.decode("utf-8", errors="replace")
            safe_css = html_sanitizer.sanitize_css(css_text, result.final_url)
            self._send_bytes(result.status, "text/css; charset=utf-8", safe_css.encode("utf-8"))
            return
        # Block active content types from being served as resources.
        if any(t in ctype for t in ("javascript", "ecmascript", "text/html", "application/xhtml")):
            # An eepsite trying to load HTML/JS as an "image" — refuse.
            self._send_json(415, {"error": "resource type not permitted"})
            return
        self._send_bytes(result.status, result.content_type or "application/octet-stream", result.body)

    # --- routes --------------------------------------------------------

    def do_OPTIONS(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        self._send_json(204, {})

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_auth(path):
            return
        if path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        client = self.client_address[0]
        if not self.rate_limiter.allow(client):
            self._send_json(429, {"error": "rate limited"})
            return
        if path == "/auth/info":
            # Surface auth-mode status for the browser bootstrap. Never
            # leaks the token itself.
            self._send_json(200, {
                "requireAuth": auth_mod.require_auth_enabled(),
                "secretPath": str(auth_mod.secret_path()) if auth_mod.require_auth_enabled() else None,
                "instructions": (
                    "When auth is required, run "
                    "`cat ~/.echelon/secret` (or the path shown in secretPath) "
                    "and paste the token into Settings → Sync Daemon → Auth Token."
                    if auth_mod.require_auth_enabled() else None
                ),
            })
            return
        if path == "/list":
            entries = []
            if ROOT.exists():
                for d in sorted(p for p in ROOT.iterdir() if p.is_dir()):
                    files = []
                    for f in d.rglob("*"):
                        if f.is_file():
                            files.append({
                                "path": str(f.relative_to(d)).replace("\\", "/"),
                                "size": f.stat().st_size,
                            })
                    entries.append({"eepsite": d.name, "files": files})
            self._send_json(200, {"eepsites": entries})
            return
        if path == "/i2pd/stats":
            host = os.environ.get("ECHELON_I2PD_CONSOLE_HOST", "127.0.0.1")
            try:
                port = int(os.environ.get("ECHELON_I2PD_CONSOLE_PORT", "7070"))
            except ValueError:
                port = 7070
            stats = i2pd_stats.fetch_i2pd_stats(host, port, timeout=4.0)
            self._send_json(200, stats)
            return
        if path == "/browse":
            self._handle_browse()
            return
        if path == "/network/doctor":
            self._handle_network_doctor()
            return
        if path == "/network/mode":
            self._handle_network_mode(plan_only=False)
            return
        if path == "/network/autofix-plan":
            self._handle_network_mode(plan_only=True)
            return
        if path == "/browse/resource":
            self._handle_browse_resource()
            return
        if path == "/i2pd/config":
            cfg_path = _i2pd_config_path()
            try:
                values = i2pd_config.read_i2pd_config(cfg_path)
            except OSError as e:
                self._send_json(500, {"error": f"could not read i2pd config: {e}"})
                return
            self._send_json(200, {
                "configPath": str(cfg_path),
                "values": values,
                "knownKeys": list(i2pd_config.known_keys()),
            })
            return
        if path == "/i2pd/outproxy":
            tunnels_path = _i2pd_tunnels_path()
            try:
                spec = i2pd_tunnels.read_managed_spec(tunnels_path)
            except OSError as e:
                self._send_json(500, {"error": f"could not read tunnels.conf: {e}"})
                return
            self._send_json(200, {
                "tunnelsPath": str(tunnels_path),
                "spec": i2pd_tunnels.spec_to_dict(spec),
                "lockedBindHost": i2pd_tunnels.LOCKED_BIND_HOST,
            })
            return
        if path == "/filters/lists":
            store = threat_filters.SubscriptionStore(root=_filters_root())
            self._send_json(200, {
                "filtersRoot": str(store.root),
                "subscriptions": [s.__dict__ for s in store.all()],
                "wellKnown": threat_filters.WELL_KNOWN_LISTS,
            })
            return
        if path == "/filters/blocklist":
            store = threat_filters.SubscriptionStore(root=_filters_root())
            block = threat_filters.compile_blocklist(store)
            self._send_json(200, {
                "filtersRoot": str(store.root),
                "blocklistSize": len(block),
                "sample": sorted(block)[:50],
            })
            return
        if path == "/filters/events":
            qs = parse_qs(urlparse(self.path).query)
            try:
                since = int(qs.get("since", ["0"])[0])
            except (ValueError, TypeError):
                since = 0
            buf = threat_events.get_global_buffer()
            events = buf.since(since)
            self._send_json(200, {
                "events": threat_events.events_to_dict(events),
                "headSeq": buf.head_seq(),
                "bufferSize": len(buf),
                "bufferCap": buf.cap,
            })
            return
        self._send_json(404, {"error": "not found"})

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_write_guard():
            return
        if not self._check_auth(path):
            return
        # /filters/lists/<id>
        fm = re.match(r"^/filters/lists/([A-Za-z0-9]{1,64})$", path)
        if fm:
            sub_id = fm.group(1)
            store = threat_filters.SubscriptionStore(root=_filters_root())
            removed = store.remove(sub_id)
            if not removed:
                self._send_json(404, {"error": "subscription not found"})
                return
            self._send_json(200, {"removed": sub_id})
            return
        m = re.match(r"^/eepsite/([^/]+)$", path)
        if not m:
            self._send_json(404, {"error": "not found"})
            return
        name = sanitise_eepsite_name(m.group(1))
        if not name:
            self._send_json(400, {"error": "invalid eepsite name"})
            return
        target = ROOT / name
        if target.exists():
            for f in sorted(target.rglob("*"), reverse=True):
                if f.is_file():
                    f.unlink()
                elif f.is_dir():
                    f.rmdir()
            target.rmdir()
        self._send_json(200, {"deleted": name})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not self._check_write_guard():
            return
        if not self._check_auth(path):
            return
        client = self.client_address[0]
        if not self.rate_limiter.allow(client):
            self._send_json(429, {"error": "rate limited"})
            return
        if path == "/network/apply-safe-config":
            self._handle_apply_safe_config()
            return
        if path == "/filters/lists":
            body = self._read_json()
            if body is None:
                return
            if not isinstance(body, dict):
                self._send_json(400, {"error": "expected JSON object"})
                return
            store = threat_filters.SubscriptionStore(root=_filters_root())
            try:
                sub = store.add(
                    name=str(body.get("name") or ""),
                    url=str(body.get("url") or ""),
                    fmt=str(body.get("format", "hosts")),
                )
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
                return
            self._send_json(200, {"subscription": sub.__dict__})
            return
        if path == "/filters/refresh":
            store = threat_filters.SubscriptionStore(root=_filters_root())
            updated = threat_filters.refresh_all(store)
            block = threat_filters.compile_blocklist(store)
            self._send_json(200, {
                "subscriptions": [s.__dict__ for s in updated],
                "blocklistSize": len(block),
            })
            return
        if path == "/i2pd/outproxy":
            body = self._read_json()
            if body is None:
                return
            try:
                spec = i2pd_tunnels.spec_from_dict(body if isinstance(body, dict) else {})
            except (ValueError, TypeError) as e:
                self._send_json(400, {"error": str(e)})
                return
            tunnels_path = _i2pd_tunnels_path()
            try:
                i2pd_tunnels.write_managed_spec(tunnels_path, spec)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
                return
            except OSError as e:
                self._send_json(500, {"error": f"could not write tunnels.conf: {e}"})
                return
            stored = i2pd_tunnels.read_managed_spec(tunnels_path)
            self._send_json(200, {
                "tunnelsPath": str(tunnels_path),
                "spec": i2pd_tunnels.spec_to_dict(stored),
                "lockedBindHost": i2pd_tunnels.LOCKED_BIND_HOST,
            })
            return
        if path == "/i2pd/config":
            body = self._read_json()
            if body is None:
                return
            updates = body.get("values") if isinstance(body, dict) else None
            if not isinstance(updates, dict) or not updates:
                self._send_json(400, {"error": "missing or empty 'values' map"})
                return
            # Reject the whole request atomically if anything is bad.
            for k, v in updates.items():
                if not i2pd_config.is_whitelisted(k):
                    self._send_json(400, {"error": f"non-whitelisted key: {k}"})
                    return
                if not isinstance(v, str) or not i2pd_config.validate(k, v):
                    self._send_json(400, {"error": f"invalid value for {k}: {v!r}"})
                    return
            cfg_path = _i2pd_config_path()
            try:
                i2pd_config.write_i2pd_config(cfg_path, updates)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
                return
            except OSError as e:
                self._send_json(500, {"error": f"could not write i2pd config: {e}"})
                return
            # Echo back the freshly-stored values.
            stored = i2pd_config.read_i2pd_config(cfg_path)
            self._send_json(200, {
                "configPath": str(cfg_path),
                "values": stored,
                "writtenCount": len(updates),
            })
            return
        if path == "/eepgen/complete":
            body = self._read_json()
            if body is None:
                return
            if not isinstance(body, dict):
                self._send_json(400, {"error": "expected JSON object"})
                return
            # Wallet-ownership signature is required unless explicitly
            # disabled (e.g. a fully-local single-user deployment that
            # trusts loopback). Default is to require it.
            require_sig = os.environ.get("ECHELON_EEPGEN_REQUIRE_SIG", "1").strip().lower() not in (
                "0", "false", "no", "off",
            )
            try:
                result = eepgen_proxy.handle_request(
                    _eepgen_root(), body, require_signature=require_sig,
                )
            except eepgen_proxy.EepGenError as e:
                self._send_json(e.status, {"ok": False, "error": e.message})
                return
            self._send_json(200, result)
            return
        if path != "/publish":
            self._send_json(404, {"error": "not found"})
            return
        body = self._read_json()
        if body is None:
            return
        name = sanitise_eepsite_name(str(body.get("eepsite", "")))
        if not name:
            self._send_json(400, {"error": "invalid or missing eepsite name"})
            return
        files = body.get("files")
        if not isinstance(files, dict) or not files:
            self._send_json(400, {"error": "missing or empty files map"})
            return

        # Phase I.2 size caps — applied BEFORE we touch disk so a
        # malformed publish can never even partially write.
        total_bytes = 0
        for raw_path, contents in files.items():
            if not isinstance(contents, str):
                self._send_json(400, {"error": f"file {raw_path!r} must be a string"})
                return
            file_bytes = len(contents.encode("utf-8"))
            if file_bytes > MAX_FILE_BYTES:
                self._send_json(413, {
                    "error": f"file {raw_path!r} is {file_bytes} bytes; cap is {MAX_FILE_BYTES} bytes ({MAX_FILE_BYTES // (1024*1024)} MB) per file",
                })
                return
            total_bytes += file_bytes
            if total_bytes > MAX_EEPSITE_BYTES:
                self._send_json(413, {
                    "error": f"eepsite total exceeds {MAX_EEPSITE_BYTES} bytes ({MAX_EEPSITE_BYTES // (1024*1024)} MB)",
                })
                return

        target_root = (ROOT / name).resolve()
        ROOT.mkdir(parents=True, exist_ok=True)
        target_root.mkdir(parents=True, exist_ok=True)

        # Wipe previous publish so deleted files actually disappear.
        for f in sorted(target_root.rglob("*"), reverse=True):
            if f.is_file():
                f.unlink()
            elif f.is_dir() and f != target_root:
                try:
                    f.rmdir()
                except OSError:
                    pass

        written = []
        for raw_path, contents in files.items():
            rel = sanitise_relative_path(str(raw_path))
            if not rel:
                self._send_json(400, {"error": f"unsafe file path: {raw_path!r}"})
                return
            if not isinstance(contents, str):
                self._send_json(400, {"error": f"file {raw_path!r} must be a string"})
                return
            full = (target_root / rel).resolve()
            if target_root not in full.parents and full != target_root:
                self._send_json(400, {"error": f"path escapes eepsite root: {raw_path!r}"})
                return
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_text(contents, encoding="utf-8")
            written.append(rel)

        log.info("published %d file(s) to %s", len(written), target_root)
        self._send_json(200, {
            "eepsite": name,
            "writtenCount": len(written),
            "files": written,
            "diskPath": str(target_root),
        })


def main() -> int:
    ROOT.mkdir(parents=True, exist_ok=True)
    log.info("listening on http://%s:%d  (root: %s)", HOST, PORT, ROOT)
    log.info("hint: configure i2pd to serve %s as your eepsite webroot", ROOT)
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        log.info("shutting down")
    return 0


if __name__ == "__main__":
    sys.exit(main())
