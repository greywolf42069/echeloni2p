"""CSRF / cross-origin write-guard tests.

The daemon binds loopback, but a malicious clearnet page can still make
the browser POST to 127.0.0.1. CORS hides the response, not the side
effect. The write guard rejects the REQUEST on write routes unless it's
same-origin-ish (Origin allowlisted or absent) AND JSON content-type.
"""
from __future__ import annotations

from scripts import auth as auth_mod

# A stand-in for the daemon's CORS allowlist matcher.
ALLOW = lambda o: o in (  # noqa: E731
    "http://localhost:5173", "http://127.0.0.1:7079", "capacitor://localhost",
)


class TestWriteGuardUnit:
    def test_no_origin_allowed(self):
        # curl / same-device tooling sends no Origin.
        assert auth_mod.write_request_rejection(
            origin=None, content_type="application/json", method="POST", allow_match=ALLOW) is None

    def test_allowlisted_origin_json_allowed(self):
        assert auth_mod.write_request_rejection(
            origin="http://localhost:5173", content_type="application/json",
            method="POST", allow_match=ALLOW) is None

    def test_clearnet_origin_refused(self):
        v = auth_mod.write_request_rejection(
            origin="https://evil.com", content_type="application/json",
            method="POST", allow_match=ALLOW)
        assert v is not None and v[0] == 403

    def test_non_json_post_refused(self):
        for ct in ("text/plain", "application/x-www-form-urlencoded",
                   "multipart/form-data", None):
            v = auth_mod.write_request_rejection(
                origin=None, content_type=ct, method="POST", allow_match=ALLOW)
            assert v is not None and v[0] == 415, ct

    def test_simple_request_csrf_blocked(self):
        # The classic CSRF shape: a form POST (no preflight) from a clearnet page.
        v = auth_mod.write_request_rejection(
            origin="https://evil.com", content_type="text/plain",
            method="POST", allow_match=ALLOW)
        assert v is not None and v[0] in (403, 415)

    def test_delete_no_body_allowed(self):
        assert auth_mod.write_request_rejection(
            origin=None, content_type=None, method="DELETE", allow_match=ALLOW) is None

    def test_delete_clearnet_origin_refused(self):
        v = auth_mod.write_request_rejection(
            origin="https://evil.com", content_type=None, method="DELETE", allow_match=ALLOW)
        assert v is not None and v[0] == 403

    def test_content_type_with_charset_ok(self):
        assert auth_mod.content_type_is_json("application/json; charset=utf-8")
        assert not auth_mod.content_type_is_json("text/plain")
        assert not auth_mod.content_type_is_json(None)


class TestWriteGuardEndToEnd:
    """Through the live daemon: a forged clearnet Origin can't mutate state."""

    def test_post_with_clearnet_origin_refused(self, client):
        daemon_client, _ = client
        status, _, _ = daemon_client.request(
            "/filters/refresh", method="POST", body={},
            headers={"Origin": "https://evil.com"})
        assert status == 403

    def test_post_text_plain_refused(self, client):
        # Simple-request CSRF: text/plain bypasses preflight. Must 415.
        import urllib.request, urllib.error
        base = client[0].base
        req = urllib.request.Request(
            f"{base}/filters/refresh", data=b"{}", method="POST",
            headers={"Content-Type": "text/plain"})
        try:
            urllib.request.urlopen(req, timeout=5)
            assert False, "should have been rejected"
        except urllib.error.HTTPError as e:
            assert e.code == 415

    def test_delete_with_clearnet_origin_refused(self, client):
        daemon_client, _ = client
        status, _, _ = daemon_client.request(
            "/eepsite/example.i2p", method="DELETE",
            headers={"Origin": "https://evil.com"})
        assert status == 403

    def test_apply_safe_config_clearnet_origin_refused(self, client):
        daemon_client, _ = client
        status, _, _ = daemon_client.request(
            "/network/apply-safe-config", method="POST", body={"fixes": []},
            headers={"Origin": "https://evil.com"})
        assert status == 403

    def test_legitimate_localhost_origin_allowed(self, client):
        daemon_client, _ = client
        status, _, _ = daemon_client.request(
            "/filters/refresh", method="POST", body={},
            headers={"Origin": "http://localhost:5173"})
        assert status == 200

    def test_preflight_allows_auth_header(self, client):
        """CORS preflight must list X-Echelon-Auth in Allow-Headers,
        otherwise the browser blocks the token from reaching the daemon."""
        daemon_client, _ = client
        # The daemon's do_OPTIONS → _send_json(204, {}) sets CORS headers.
        # We verify the header is present on any response (the preflight
        # path shares _send_json's header logic).
        import urllib.request
        base = daemon_client.base
        req = urllib.request.Request(f"{base}/health", method="GET")
        resp = urllib.request.urlopen(req, timeout=5)
        allow = resp.headers.get("Access-Control-Allow-Headers", "")
        assert "X-Echelon-Auth" in allow, (
            f"CORS Allow-Headers missing X-Echelon-Auth: {allow}"
        )
