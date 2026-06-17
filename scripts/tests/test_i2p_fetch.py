"""
i2p_fetch tests — the eepsite fetch-through-i2pd step.

We don't need a real i2pd; we test URL normalization + host validation
directly, and the HTTP-proxy fetch path against a tiny local stub HTTP
server that stands in for i2pd's proxy (it echoes a canned response for
absolute-URI requests).
"""
from __future__ import annotations

import http.server
import socket
import threading
import time
from contextlib import closing

import pytest

from scripts.i2p_fetch import (
    I2pFetchError,
    fetch_eepsite,
    is_i2p_host,
    normalize_eepsite_url,
)


# ── normalize / host validation (pure) ──────────────────────────────


class TestNormalize:
    def test_bare_host_gets_root_path(self):
        assert normalize_eepsite_url("example.i2p") == "http://example.i2p/"

    def test_strips_scheme(self):
        assert normalize_eepsite_url("http://example.i2p/x") == "http://example.i2p/x"
        assert normalize_eepsite_url("https://example.i2p/x") == "http://example.i2p/x"

    def test_preserves_path(self):
        assert normalize_eepsite_url("example.i2p/a/b?c=d") == "http://example.i2p/a/b?c=d"

    def test_lowercases_host(self):
        assert normalize_eepsite_url("EXAMPLE.i2p") == "http://example.i2p/"

    def test_strips_port(self):
        assert normalize_eepsite_url("example.i2p:8080/x") == "http://example.i2p/x"

    def test_b32_accepted(self):
        out = normalize_eepsite_url("abcd1234.b32.i2p")
        assert out == "http://abcd1234.b32.i2p/"

    def test_clearnet_rejected(self):
        with pytest.raises(I2pFetchError) as exc:
            normalize_eepsite_url("example.com")
        assert exc.value.reason == "bad-host"

    def test_clearnet_with_scheme_rejected(self):
        with pytest.raises(I2pFetchError) as exc:
            normalize_eepsite_url("https://evil.com/x")
        assert exc.value.reason == "bad-host"

    def test_i2p_lookalike_rejected(self):
        # host that merely contains .i2p but isn't an .i2p TLD
        with pytest.raises(I2pFetchError):
            normalize_eepsite_url("example.i2p.evil.com")

    def test_empty_rejected(self):
        with pytest.raises(I2pFetchError):
            normalize_eepsite_url("")

    def test_is_i2p_host(self):
        assert is_i2p_host("a.i2p")
        assert is_i2p_host("x.b32.i2p")
        assert not is_i2p_host("a.com")


# ── fetch through a stub proxy ──────────────────────────────────────


class _StubProxyHandler(http.server.BaseHTTPRequestHandler):
    """Stands in for i2pd's HTTP proxy. Because i2p_fetch sends an
    absolute-URI request line, self.path will be the full URL."""

    # class-level knobs the tests set
    response_status = 200
    response_body = b"<html><body>hi from eepsite</body></html>"
    response_ctype = "text/html"
    extra_headers: dict = {}

    def do_GET(self):  # noqa: N802
        cls = type(self)
        self.send_response(cls.response_status)
        self.send_header("Content-Type", cls.response_ctype)
        for k, v in cls.extra_headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(cls.response_body)))
        self.end_headers()
        if cls.response_body:
            self.wfile.write(cls.response_body)

    def log_message(self, *a):  # silence
        pass


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def stub_proxy():
    # Reset class knobs to defaults each test.
    _StubProxyHandler.response_status = 200
    _StubProxyHandler.response_body = b"<html><body>hi from eepsite</body></html>"
    _StubProxyHandler.response_ctype = "text/html"
    _StubProxyHandler.extra_headers = {}
    port = _free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), _StubProxyHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.05)
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()


class TestFetch:
    def test_happy_path(self, stub_proxy):
        result = fetch_eepsite("example.i2p", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert result.status == 200
        assert b"hi from eepsite" in result.body
        assert "text/html" in result.content_type
        assert result.final_url == "http://example.i2p/"

    def test_captures_x_frame_options(self, stub_proxy):
        _StubProxyHandler.extra_headers = {"X-Frame-Options": "DENY"}
        result = fetch_eepsite("example.i2p", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert result.x_frame_options == "DENY"

    def test_dns_failed_classification(self, stub_proxy):
        _StubProxyHandler.response_status = 404
        _StubProxyHandler.response_body = b"Destination not found"
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("missing.i2p", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert exc.value.reason == "dns-failed"

    def test_real_404_passes_through(self, stub_proxy):
        _StubProxyHandler.response_status = 404
        _StubProxyHandler.response_body = b"<html>real page not found</html>"
        result = fetch_eepsite("example.i2p/missing", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert result.status == 404
        assert b"real page not found" in result.body

    def test_502_is_tunnel_timeout(self, stub_proxy):
        _StubProxyHandler.response_status = 502
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("example.i2p", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert exc.value.reason == "tunnel-timeout"

    def test_503_is_rate_limited(self, stub_proxy):
        _StubProxyHandler.response_status = 503
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("example.i2p", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert exc.value.reason == "rate-limited"

    def test_connection_refused_is_no_i2pd(self):
        # Point at a port nothing is listening on.
        dead_port = _free_port()
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("example.i2p", proxy_host="127.0.0.1", proxy_port=dead_port)
        assert exc.value.reason == "no-i2pd"

    def test_oversize_body_rejected(self, stub_proxy):
        # Set a body larger than the cap (8 MB). Use 9 MB.
        _StubProxyHandler.response_body = b"x" * (9 * 1024 * 1024)
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("example.i2p", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert exc.value.reason == "too-large"

    def test_clearnet_host_refused_before_fetch(self, stub_proxy):
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("evil.com", proxy_host="127.0.0.1", proxy_port=stub_proxy)
        assert exc.value.reason == "bad-host"
