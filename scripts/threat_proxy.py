"""
Filtering HTTP forward proxy for Echelon.

Listens on 127.0.0.1:<port> by default. Each incoming HTTP request:
  1. its target host is extracted (from the absolute-URI request line
     when used as a proper proxy, or from the Host header for plain
     requests),
  2. checked against the compiled blocklist,
  3. either: blocked → 403 + a `BlockEvent` is appended to the
     process-wide event buffer, OR forwarded upstream and the
     response is streamed back.

Hard limits — these are not configurable from the wire, only from
process-level constants:

  - bind host: 127.0.0.1 (loopback only)
  - HTTPS / CONNECT: refused with 501. A hostile or buggy HTTPS
    interceptor here is the canonical doxx-via-proxy bug.
  - request body cap: 32 MB
  - response body cap: 64 MB (streamed in 64 KiB chunks)
  - upstream timeout: 15 s
  - method allowlist: GET, HEAD, POST, PUT, DELETE, OPTIONS, PATCH
  - hop-by-hop request headers (Proxy-Authorization, Connection, TE,
    Upgrade, etc.) are stripped before forwarding
"""
from __future__ import annotations

import http.client
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable
from urllib.parse import urlparse

from scripts.threat_events import BlockEventBuffer, get_global_buffer
from scripts.threat_filters import (
    SubscriptionStore,
    compile_blocklist,
    is_domain_blocked,
    is_safe_domain,
)

# ─── Constants (intentionally module-level, not request-controlled) ──────

DEFAULT_PROXY_HOST = "127.0.0.1"
DEFAULT_PROXY_PORT = 7072

ALLOWED_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"})

REQUEST_BODY_CAP = 32 * 1024 * 1024
RESPONSE_BODY_CAP = 64 * 1024 * 1024
UPSTREAM_TIMEOUT_SEC = 15.0
RESPONSE_CHUNK = 64 * 1024

# Hop-by-hop request headers we strip before forwarding upstream.
# https://www.rfc-editor.org/rfc/rfc7230#section-6.1
HOP_BY_HOP_HEADERS = frozenset(
    h.lower() for h in (
        "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
        "te", "trailer", "transfer-encoding", "upgrade", "proxy-connection",
    )
)


# ─── Blocklist cache (thread-safe) ───────────────────────────────────────


class BlocklistCache:
    """Lazy + invalidatable wrapper around `compile_blocklist(store)`.

    The proxy thread reads from this on every request. The daemon thread
    invalidates it whenever subscriptions change. Recompilation happens on
    the next read after invalidate().
    """

    def __init__(self, store: SubscriptionStore | None = None):
        self._store = store
        self._cached: frozenset[str] | None = None
        self._sources: dict[str, str] = {}   # domain -> subscription name (best-effort)
        self._lock = threading.Lock()

    def set_store(self, store: SubscriptionStore | None) -> None:
        with self._lock:
            self._store = store
            self._cached = None
            self._sources = {}

    def set_static(self, blocklist: set[str], sources: dict[str, str] | None = None) -> None:
        """Used by tests: pin the blocklist directly without a store."""
        with self._lock:
            self._cached = frozenset(blocklist)
            self._sources = dict(sources or {})

    def invalidate(self) -> None:
        with self._lock:
            self._cached = None

    def get(self) -> frozenset[str]:
        with self._lock:
            if self._cached is None:
                if self._store is None:
                    self._cached = frozenset()
                else:
                    self._cached = frozenset(compile_blocklist(self._store))
                    # We don't reverse-map domain -> source list here for
                    # perf reasons; future enhancement.
            return self._cached

    def source_for(self, domain: str) -> str:
        with self._lock:
            return self._sources.get(domain, "(filter)")


# ─── Request handler ─────────────────────────────────────────────────────


class FilteringProxyHandler(BaseHTTPRequestHandler):
    """HTTP forward proxy with blocklist filtering."""

    # Class-level injection points — the daemon (or tests) sets these
    # before starting the server.
    blocklist_cache: BlocklistCache = BlocklistCache()
    event_buffer: BlockEventBuffer = get_global_buffer()

    server_version = ""
    protocol_version = "HTTP/1.1"

    # Suppress the default verbose access log; tests rely on stderr being clean.
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    # ─── method dispatch ────────────────────────────────────────────────

    def do_GET(self):     self._dispatch()  # noqa: N802
    def do_HEAD(self):    self._dispatch()  # noqa: N802
    def do_POST(self):    self._dispatch()  # noqa: N802
    def do_PUT(self):     self._dispatch()  # noqa: N802
    def do_DELETE(self):  self._dispatch()  # noqa: N802
    def do_OPTIONS(self): self._dispatch()  # noqa: N802
    def do_PATCH(self):   self._dispatch()  # noqa: N802

    def do_CONNECT(self):  # noqa: N802
        # Plain HTTPS interception is OUT — would require either MITM
        # (terrible idea) or pure tunnelling (which can't filter content).
        # Cleaner: refuse, document the limitation, let the client decide.
        self._error_html(501, "HTTPS / CONNECT proxying is not supported by this filter proxy.")

    # ─── core flow ──────────────────────────────────────────────────────

    def _dispatch(self) -> None:
        if self.command not in ALLOWED_METHODS:
            self._error_html(405, f"method {self.command!r} not allowed")
            return

        target = self._extract_target()
        if target is None:
            self._error_html(400, "could not extract target host from request")
            return
        scheme, host, port, path = target

        if scheme not in ("http",):
            self._error_html(400, f"only http:// is supported, not {scheme!r}")
            return

        if not is_safe_domain(host) and not _is_loopback_host(host):
            # Loopback hosts are allowed for testability + because a process
            # using this proxy could reach 127.0.0.1 directly anyway.
            self._error_html(400, "invalid target host")
            return

        # Block decision.
        blocklist = self.blocklist_cache.get()
        if is_domain_blocked(host, blocklist):
            self.event_buffer.append(
                domain=host,
                list_source=self.blocklist_cache.source_for(host),
                request_kind=self.command.lower(),
            )
            self._error_html(403, f"{host} is on a configured threat / ad blocklist")
            return

        # Forward.
        try:
            self._forward(host, port, path)
        except (TimeoutError, OSError) as e:
            self._error_html(504, f"upstream unreachable: {e}")
        except http.client.HTTPException as e:
            self._error_html(502, f"upstream HTTP error: {e}")
        except Exception as e:  # noqa: BLE001
            self._error_html(502, f"unexpected upstream error: {e}")

    # ─── target extraction ──────────────────────────────────────────────

    def _extract_target(self) -> tuple[str, str, int, str] | None:
        """Returns (scheme, host, port, path-with-query)."""
        path = self.path
        if path.startswith("http://") or path.startswith("https://"):
            parsed = urlparse(path)
            scheme = parsed.scheme
            host = (parsed.hostname or "").rstrip(".")
            port = parsed.port or (443 if scheme == "https" else 80)
            target_path = parsed.path or "/"
            if parsed.query:
                target_path += "?" + parsed.query
            return scheme, host.lower(), port, target_path

        # Plain (non-absolute) request — must rely on Host header.
        host_hdr = self.headers.get("Host")
        if not host_hdr:
            return None
        host_only, _, port_part = host_hdr.partition(":")
        try:
            port = int(port_part) if port_part else 80
        except ValueError:
            return None
        if port < 1 or port > 65535:
            return None
        return "http", host_only.strip().rstrip(".").lower(), port, path or "/"

    # ─── forwarding ─────────────────────────────────────────────────────

    def _read_request_body(self) -> bytes | None:
        """Returns the request body, or None to signal an error already sent."""
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self._error_html(400, "invalid Content-Length")
            return None
        if length < 0 or length > REQUEST_BODY_CAP:
            self._error_html(413, "request body too large")
            return None
        if length == 0:
            return b""
        try:
            return self.rfile.read(length)
        except OSError as e:
            self._error_html(400, f"could not read request body: {e}")
            return None

    def _sanitised_headers(self) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        for name, value in self.headers.items():
            if name.lower() in HOP_BY_HOP_HEADERS:
                continue
            out.append((name, value))
        return out

    def _forward(self, host: str, port: int, path: str) -> None:
        body = self._read_request_body()
        if body is None:
            return

        # Build outbound headers (dict — http.client wants string mapping).
        out_headers = {name: value for name, value in self._sanitised_headers()}
        # Ensure Host is correct for the upstream server.
        out_headers["Host"] = f"{host}:{port}" if port not in (80,) else host
        out_headers["Connection"] = "close"
        # Tag the request so loops are detectable. Don't expose port.
        out_headers.setdefault("Via", "1.1 echelon-filter-proxy")

        conn = http.client.HTTPConnection(host, port, timeout=UPSTREAM_TIMEOUT_SEC)
        try:
            conn.request(self.command, path, body=body, headers=out_headers)
            resp = conn.getresponse()
            self._stream_response(resp)
        finally:
            conn.close()

    def _stream_response(self, resp: http.client.HTTPResponse) -> None:
        # Status line.
        self.send_response_only(resp.status, resp.reason)

        # Header pass-through, with hop-by-hop strip.
        for hk, hv in resp.getheaders():
            if hk.lower() in HOP_BY_HOP_HEADERS:
                continue
            self.send_header(hk, hv)
        # We always close the connection upstream; mirror that to client so
        # we don't have to compute Content-Length when streaming.
        self.send_header("Connection", "close")
        self.end_headers()

        if self.command == "HEAD":
            return  # no body for HEAD

        total = 0
        while True:
            chunk = resp.read(RESPONSE_CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > RESPONSE_BODY_CAP:
                # Truncate. The connection's already past the point we can
                # send a fresh status, so we just stop writing — client will
                # see a short body.
                break
            try:
                self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                # Client went away.
                break

    # ─── error helpers ──────────────────────────────────────────────────

    def _error_html(self, status: int, reason: str) -> None:
        body = f"Echelon filter proxy: {reason}\n".encode("utf-8")
        try:
            self.send_response_only(status, reason[:80])
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


# ─── helpers ─────────────────────────────────────────────────────────────


def _is_loopback_host(host: str) -> bool:
    return host in ("127.0.0.1", "localhost", "::1")


# ─── public start helper ─────────────────────────────────────────────────


def start_filter_proxy(
    *,
    host: str = DEFAULT_PROXY_HOST,
    port: int = DEFAULT_PROXY_PORT,
    cache: BlocklistCache,
    buffer: BlockEventBuffer | None = None,
) -> tuple[ThreadingHTTPServer, threading.Thread]:
    """Start the filter proxy in a daemon thread and return (server, thread).

    Caller is responsible for calling `server.shutdown()` + `server.server_close()`
    when finished.
    """
    if host != DEFAULT_PROXY_HOST and host not in ("127.0.0.1", "::1", "localhost"):
        # Hard-fail rather than silently bind to a non-loopback address.
        raise ValueError(
            f"filter proxy refuses to bind to non-loopback address {host!r}; "
            "exposing the proxy on a LAN/WAN-routable host is unsafe"
        )

    # Build a per-server handler subclass so multiple proxies (e.g. tests)
    # don't share class attrs and stomp on each other's blocklist.
    # Note: explicit `is None` check rather than `or` — BlockEventBuffer
    # has __len__, so an empty buffer is falsy and the `or` would silently
    # fall back to the global singleton. Caught the hard way by tests.
    chosen_buffer = buffer if buffer is not None else get_global_buffer()

    class _Handler(FilteringProxyHandler):
        blocklist_cache = cache
        event_buffer = chosen_buffer

    server = ThreadingHTTPServer((host, port), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="echelon-filter-proxy")
    thread.start()
    return server, thread
