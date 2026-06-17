"""Smoke test confirming the test fixtures actually boot a daemon."""
from __future__ import annotations


def test_health(client):
    api, root = client
    code, _hdrs, body = api.request("/health")
    assert code == 200
    assert body["status"] == "ok"
    # Root path no longer exposed in /health (security hardening).
