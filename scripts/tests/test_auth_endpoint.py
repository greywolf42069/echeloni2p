"""End-to-end test: daemon respects ECHELON_REQUIRE_AUTH and the
X-Echelon-Auth header on protected routes.
"""
from __future__ import annotations

from pathlib import Path

import pytest


# ── Fixtures: re-boot the daemon WITH auth enforced ─────────────────


@pytest.fixture
def auth_secret(tmp_path, monkeypatch):
    secret_file = tmp_path / "secret"
    monkeypatch.setenv("ECHELON_SECRET_PATH", str(secret_file))
    monkeypatch.setenv("ECHELON_REQUIRE_AUTH", "1")
    return secret_file


def test_health_unauthed_when_require_auth_on(client, auth_secret):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/health")
    assert status == 200
    assert body["status"] == "ok"


def test_auth_info_unauthed(client, auth_secret):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/auth/info")
    assert status == 200
    assert body["requireAuth"] is True
    assert body["secretPath"] is not None
    assert "cat" in body["instructions"]


def test_protected_get_rejected_without_token(client, auth_secret):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/list")
    assert status == 401
    assert "X-Echelon-Auth" in body["error"]


def test_protected_get_rejected_with_wrong_token(client, auth_secret):
    daemon_client, _ = client
    status, _, body = daemon_client.request(
        "/list",
        headers={"X-Echelon-Auth": "definitely-not-the-real-token"},
    )
    assert status == 401


def test_protected_get_passes_with_correct_token(client, auth_secret):
    daemon_client, _ = client
    # Trigger secret creation
    from scripts import auth as auth_mod
    secret = auth_mod.load_or_create_secret(auth_secret)
    status, _, body = daemon_client.request(
        "/list",
        headers={"X-Echelon-Auth": secret},
    )
    assert status == 200
    assert "eepsites" in body


def test_protected_post_rejected_without_token(client, auth_secret):
    daemon_client, _ = client
    status, _, _body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "test", "files": {}},
    )
    assert status == 401


def test_protected_post_passes_with_correct_token(client, auth_secret):
    daemon_client, root = client
    from scripts import auth as auth_mod
    secret = auth_mod.load_or_create_secret(auth_secret)
    status, _, body = daemon_client.request(
        "/publish",
        method="POST",
        body={"eepsite": "test-site", "files": {"index.html": "<h1>hi</h1>"}},
        headers={"X-Echelon-Auth": secret},
    )
    assert status == 200
    # eepsite name gets .i2p appended by sanitise_eepsite_name
    assert (root / "test-site.i2p" / "index.html").exists()


def test_no_require_auth_legacy_mode(client, monkeypatch):
    """When ECHELON_REQUIRE_AUTH is not set, all routes work without a token."""
    monkeypatch.delenv("ECHELON_REQUIRE_AUTH", raising=False)
    daemon_client, _ = client
    status, _, _body = daemon_client.request("/list")
    assert status == 200


def test_protected_delete_rejected_without_token(client, auth_secret):
    daemon_client, _ = client
    status, _, _body = daemon_client.request(
        "/eepsites/anything",
        method="DELETE",
    )
    assert status == 401


def test_auth_info_when_require_auth_off(client, monkeypatch):
    monkeypatch.delenv("ECHELON_REQUIRE_AUTH", raising=False)
    daemon_client, _ = client
    status, _, body = daemon_client.request("/auth/info")
    assert status == 200
    assert body["requireAuth"] is False
    assert body["secretPath"] is None
