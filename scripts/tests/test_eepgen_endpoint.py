"""End-to-end test: /eepgen/complete daemon endpoint.

The daemon-side handler delegates to scripts/eepgen_proxy.py, which is
exercised in test_eepgen_proxy.py. These tests cover the HTTP shape
+ env wiring + JSON-error mapping.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest


VALID_WALLET = "9oG2Aw3Kw7VXTrqJL3rfwBcRsM5jq6N7gW8aBcDeFgHj"


def _ok_transport(completion: str = "ok!", total_tokens: int = 5):
    def transport(url, headers, body, timeout):
        return 200, json.dumps({
            "choices": [{"message": {"content": completion}}],
            "usage": {"total_tokens": total_tokens},
        }).encode("utf-8")
    return transport


@pytest.fixture
def eepgen_root(tmp_path, monkeypatch):
    root = tmp_path / "eepgen"
    monkeypatch.setenv("ECHELON_EEPGEN_ROOT", str(root))
    monkeypatch.setenv("DEEPINFRA_API_KEY", "fake-key-for-tests")
    # These endpoint tests exercise the proxy/quota/forward wiring, not
    # the signature gate (which has dedicated unit tests in
    # test_eepgen_proxy.py). Disable the sig requirement here.
    monkeypatch.setenv("ECHELON_EEPGEN_REQUIRE_SIG", "0")
    return root


def test_post_eepgen_complete_happy_path(client, eepgen_root, monkeypatch):
    daemon_client, _ = client

    # Patch the forward function so the daemon doesn't hit real DeepInfra
    from scripts import eepgen_proxy
    original_forward = eepgen_proxy.forward_to_deepinfra

    def fake_forward(messages, max_tokens, *, timeout=30.0, transport=None):
        return original_forward(messages, max_tokens, timeout=timeout, transport=_ok_transport("hello", 17))

    monkeypatch.setattr(eepgen_proxy, "forward_to_deepinfra", fake_forward)

    status, _, body = daemon_client.request("/eepgen/complete", "POST", {
        "wallet": VALID_WALLET,
        "tier": "plus",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 64,
    })
    assert status == 200
    assert body["ok"] is True
    assert body["completion"] == "hello"
    assert body["tokens_used"] == 17
    assert body["tier"] == "plus"
    assert body["quota_today"] == 100_000


def test_post_eepgen_complete_invalid_wallet(client, eepgen_root):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/eepgen/complete", "POST", {
        "wallet": "bad",
        "tier": "plus",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert status == 400
    assert body["ok"] is False
    assert "wallet" in body["error"].lower()


def test_post_eepgen_complete_free_tier_rejected(client, eepgen_root):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/eepgen/complete", "POST", {
        "wallet": VALID_WALLET,
        "tier": "free",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert status == 400
    assert "BYOK" in body["error"]


def test_post_eepgen_complete_missing_api_key(client, eepgen_root, monkeypatch):
    daemon_client, _ = client
    monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
    status, _, body = daemon_client.request("/eepgen/complete", "POST", {
        "wallet": VALID_WALLET,
        "tier": "plus",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert status == 503
    assert body["ok"] is False
    assert "DEEPINFRA_API_KEY" in body["error"]


def test_post_eepgen_complete_non_object_body_rejected(client, eepgen_root):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/eepgen/complete", "POST", ["not", "an", "object"])
    assert status == 400


def test_post_eepgen_complete_quota_persists_across_calls(client, eepgen_root, monkeypatch):
    daemon_client, _ = client
    from scripts import eepgen_proxy
    original_forward = eepgen_proxy.forward_to_deepinfra

    def fake_forward(messages, max_tokens, *, timeout=30.0, transport=None):
        return original_forward(
            messages, max_tokens, timeout=timeout,
            transport=_ok_transport("ok", 100),
        )
    monkeypatch.setattr(eepgen_proxy, "forward_to_deepinfra", fake_forward)

    statuses = []
    for _ in range(3):
        status, _, _body = daemon_client.request("/eepgen/complete", "POST", {
            "wallet": VALID_WALLET,
            "tier": "plus",
            "messages": [{"role": "user", "content": "hi"}],
        })
        statuses.append(status)
    assert statuses == [200, 200, 200]
    # Verify the quota file reflects 300 tokens used
    quota_files = list((eepgen_root / "eepgen-quota").glob("*.json"))
    assert len(quota_files) == 1
    with quota_files[0].open() as f:
        rec = json.load(f)
    assert rec["wallet"] == VALID_WALLET
    assert rec["tokens_used_today"] == 300
