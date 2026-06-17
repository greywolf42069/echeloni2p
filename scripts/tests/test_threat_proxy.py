"""
Tests for scripts/threat_proxy.py — the filtering HTTP forward proxy.

Real loopback for both the proxy AND a fake upstream HTTP server.
We send requests through urllib's ProxyHandler (the same shape any
HTTP client uses) so the behaviour is end-to-end.
"""
from __future__ import annotations

import contextlib
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
from typing import Generator

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.threat_events import BlockEventBuffer  # noqa: E402
from scripts.threat_proxy import (  # noqa: E402
    BlocklistCache,
    FilteringProxyHandler,
    start_filter_proxy,
)


# ─── helpers ─────────────────────────────────────────────────────────────


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _UpstreamHandler(BaseHTTPRequestHandler):
    """Minimal real upstream HTTP server used by tests."""
    server_version = "TestUpstream/1.0"

    def log_message(self, format, *args):
        return

    def _respond(self, status: int = 200, body: bytes = b"hello", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        if self.path == "/echo/host":
            host = self.headers.get("Host", "<missing>").encode("utf-8")
            self._respond(200, host)
            return
        if self.path == "/echo/method":
            self._respond(200, b"GET")
            return
        if self.path == "/echo/headers":
            via = self.headers.get("Via", "<missing>").encode("utf-8")
            self._respond(200, via, extra={
                "X-Test-Custom": "preserved",
                "Transfer-Encoding": "identity",  # hop-by-hop; should be stripped on its way out
            })
            return
        if self.path == "/slow":
            time.sleep(2)
            self._respond(200, b"slow")
            return
        if self.path == "/big":
            # 4 MiB response — under cap but big enough to test streaming.
            self._respond(200, b"x" * (4 * 1024 * 1024))
            return
        if self.path == "/proxy-auth-leak":
            # Echo Proxy-Authorization to detect leakage; should be empty.
            leaked = self.headers.get("Proxy-Authorization", "").encode("utf-8")
            self._respond(200, leaked)
            return
        self._respond(404, b"not found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else b""
        self._respond(200, body)

    def do_HEAD(self):
        self._respond(200, b"hello")  # body suppressed automatically by handler


@pytest.fixture
def upstream() -> Generator[tuple[str, int], None, None]:
    port = _free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), _UpstreamHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        yield "127.0.0.1", port
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture
def proxy_with_blocklist():
    """Spawn the filter proxy with an injected static blocklist + event buffer."""
    cache = BlocklistCache()
    buf = BlockEventBuffer(cap=50)
    port = _free_port()
    cache.set_static(set())  # default empty; tests can replace
    server, thread = start_filter_proxy(host="127.0.0.1", port=port, cache=cache, buffer=buf)
    # Tiny wait to let the server start accepting.
    time.sleep(0.05)
    try:
        yield ("127.0.0.1", port, cache, buf)
    finally:
        server.shutdown()
        server.server_close()


def _open_via_proxy(proxy_host, proxy_port, url, *, method="GET", data=None, headers=None, timeout=5):
    """Send an HTTP request through the filter proxy and return the response.

    Uses urllib's ProxyHandler so the request goes through with an
    absolute-URI request line — exactly what a real HTTP client does.
    """
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    handler = urllib.request.ProxyHandler({"http": f"http://{proxy_host}:{proxy_port}"})
    opener = urllib.request.build_opener(handler)
    return opener.open(req, timeout=timeout)


def _open_via_proxy_or_error(proxy_host, proxy_port, url, **kw):
    """Like _open_via_proxy but always returns (status, body, headers)
    even on HTTPError so we can assert on 4xx/5xx."""
    try:
        resp = _open_via_proxy(proxy_host, proxy_port, url, **kw)
        return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


# ─── tests ───────────────────────────────────────────────────────────────


class TestForwarding:
    def test_simple_get_is_forwarded(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, _cache, _buf = proxy_with_blocklist

        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/echo/method",
        )
        assert status == 200
        assert body == b"GET"

    def test_host_header_is_set_to_upstream(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, _cache, _buf = proxy_with_blocklist

        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/echo/host",
        )
        assert status == 200
        # Upstream sees Host: <upstream_host>:<upstream_port>
        assert body.decode().startswith("127.0.0.1")

    def test_via_header_is_set(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, _cache, _buf = proxy_with_blocklist

        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/echo/headers",
        )
        assert status == 200
        # Body is the Via we sent upstream.
        assert b"echelon-filter-proxy" in body

    def test_post_body_round_trips(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, _cache, _buf = proxy_with_blocklist

        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/anything",
            method="POST",
            data=b"hello-from-client",
            headers={"Content-Type": "text/plain"},
        )
        # _UpstreamHandler.do_POST echoes the body.
        assert status == 200
        assert body == b"hello-from-client"

    def test_large_response_streamed_back(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, _cache, _buf = proxy_with_blocklist

        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/big", timeout=15,
        )
        assert status == 200
        assert len(body) == 4 * 1024 * 1024


class TestBlocking:
    def test_blocked_domain_returns_403(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, cache, buf = proxy_with_blocklist
        cache.set_static({up_host})  # block the upstream host outright

        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/echo/method",
        )
        assert status == 403
        assert b"blocklist" in body
        # And an event was emitted.
        evts = buf.all()
        assert len(evts) == 1
        assert evts[0].domain == up_host

    def test_subdomain_is_blocked(self, upstream, proxy_with_blocklist):
        # We can't easily DNS-resolve a sub-domain to our local upstream,
        # so we test the in-memory decision directly with a fake host
        # mapping: the proxy uses the request's Host as-is.
        p_host, p_port, cache, buf = proxy_with_blocklist
        cache.set_static({"badcorp.example"})

        # Use the proxy with a Host that resolves to nothing — the request
        # should be blocked BEFORE any DNS lookup is attempted.
        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, "http://ads.badcorp.example/path",
        )
        assert status == 403
        assert b"blocklist" in body
        assert buf.all()[0].domain == "ads.badcorp.example"

    def test_unrelated_domain_passes_through_then_fails_at_dns(self, proxy_with_blocklist):
        p_host, p_port, cache, _buf = proxy_with_blocklist
        cache.set_static({"different.example"})

        # The proxy will try to forward to a non-resolvable host; we expect
        # 504 (upstream unreachable), NOT 403 (which would be a false positive).
        status, _body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, "http://nonexistent.invalid./",
            timeout=10,
        )
        assert status in (502, 504)

    def test_proper_subdomain_only_does_not_block_partial_suffix(self, proxy_with_blocklist):
        p_host, p_port, cache, buf = proxy_with_blocklist
        cache.set_static({"badcorp.example"})
        # 'mybadcorp.example' is NOT a subdomain — must NOT be blocked.
        status, _body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, "http://mybadcorp.example/", timeout=5,
        )
        assert status in (502, 504)
        # No block events emitted.
        assert buf.all() == []

    def test_cache_invalidate_picks_up_new_blocklist(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, cache, _buf = proxy_with_blocklist

        # First request: upstream not blocked, succeeds.
        status, _body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/echo/method",
        )
        assert status == 200

        # Block the upstream + invalidate cache.
        cache.set_static({up_host})
        cache.invalidate()
        cache.set_static({up_host})

        status2, _b2, _h2 = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/echo/method",
        )
        assert status2 == 403


class TestSafetyRails:
    def test_connect_returns_501(self, proxy_with_blocklist):
        p_host, p_port, _cache, _buf = proxy_with_blocklist
        # Make a raw CONNECT request — urllib doesn't expose CONNECT, so
        # we craft one over a socket.
        sock = socket.create_connection((p_host, p_port), timeout=5)
        try:
            sock.sendall(b"CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n")
            data = sock.recv(4096)
        finally:
            sock.close()
        assert b"501" in data
        assert b"CONNECT" in data or b"HTTPS" in data

    def test_disallowed_method_returns_501(self, proxy_with_blocklist):
        # TRACE / arbitrary methods get 501 from BaseHTTPRequestHandler's
        # default. RFC 7231 §6.6.2: 501 Not Implemented is the correct
        # status when the server doesn't support the method.
        p_host, p_port, _cache, _buf = proxy_with_blocklist
        sock = socket.create_connection((p_host, p_port), timeout=5)
        try:
            sock.sendall(b"TRACE / HTTP/1.1\r\nHost: example.com\r\n\r\n")
            data = sock.recv(4096)
        finally:
            sock.close()
        # Either 405 or 501 is acceptable — both communicate "no".
        assert b"501" in data or b"405" in data

    def test_proxy_authorization_header_is_stripped(self, upstream, proxy_with_blocklist):
        up_host, up_port = upstream
        p_host, p_port, _cache, _buf = proxy_with_blocklist
        # Upstream's /proxy-auth-leak echoes whatever Proxy-Authorization
        # the upstream received. Should be empty (stripped by proxy).
        status, body, _hdrs = _open_via_proxy_or_error(
            p_host, p_port, f"http://{up_host}:{up_port}/proxy-auth-leak",
            headers={"Proxy-Authorization": "Basic dGVzdDp0ZXN0"},
        )
        assert status == 200
        assert body == b""

    def test_refuses_to_bind_to_non_loopback(self):
        # `start_filter_proxy` should refuse a non-loopback host outright.
        cache = BlocklistCache()
        with pytest.raises(ValueError, match="non-loopback"):
            start_filter_proxy(
                host="0.0.0.0", port=_free_port(), cache=cache,
            )

    def test_invalid_host_header_returns_400(self, proxy_with_blocklist):
        p_host, p_port, _cache, _buf = proxy_with_blocklist
        sock = socket.create_connection((p_host, p_port), timeout=5)
        try:
            # Empty Host + non-absolute path → can't extract target.
            sock.sendall(b"GET /no-host HTTP/1.1\r\n\r\n")
            data = sock.recv(4096)
        finally:
            sock.close()
        assert b"400" in data


class TestBlocklistCache:
    def test_lazy_compile_from_store(self):
        from scripts.threat_filters import SubscriptionStore

        # Empty store → empty blocklist.
        store = SubscriptionStore(root=Path("/tmp/_no_such_dir_for_cache_test"))
        cache = BlocklistCache(store=store)
        assert cache.get() == set()

    def test_set_static_overrides_store(self):
        cache = BlocklistCache()
        cache.set_static({"a.com", "b.com"})
        assert cache.get() == {"a.com", "b.com"}

    def test_invalidate_clears_cache(self):
        cache = BlocklistCache()
        cache.set_static({"a.com"})
        assert cache.get() == {"a.com"}
        # Without a store to recompile from, invalidate empties the cache.
        cache.invalidate()
        assert cache.get() == set()
