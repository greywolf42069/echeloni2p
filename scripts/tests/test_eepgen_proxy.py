"""Tests for scripts/eepgen_proxy.py.

The DeepInfra HTTP forwarder is exercised via the `transport` test
seam — no real network calls.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from scripts import eepgen_proxy
from scripts.eepgen_proxy import (
    EepGenError,
    QuotaRecord,
    TIER_QUOTAS,
    forward_to_deepinfra,
    handle_request,
    increment_quota,
    load_quota,
    quota_for_tier,
    remaining_today,
    save_quota,
    validate_request,
)


VALID_WALLET = "9oG2Aw3Kw7VXTrqJL3rfwBcRsM5jq6N7gW8aBcDeFgHj"
TODAY = "2026-05-28"
NOW = "2026-05-28T12:00:00+00:00"


@pytest.fixture
def root(tmp_path: Path) -> Path:
    return tmp_path


def _ok_transport(completion: str = "hi there", total_tokens: int = 12):
    """Transport seam returning a synthetic OpenAI-shaped response."""

    def transport(url: str, headers: dict, body: bytes, timeout: float):
        del url, headers, body, timeout  # unused
        payload = {
            "id": "fake",
            "choices": [{"message": {"role": "assistant", "content": completion}}],
            "usage": {"total_tokens": total_tokens},
        }
        return 200, json.dumps(payload).encode("utf-8")

    return transport


# ── validate_request ─────────────────────────────────────────────────


class TestValidateRequest:
    def test_happy_path(self):
        wallet, tier, msgs, mt = validate_request({
            "wallet": VALID_WALLET,
            "tier": "plus",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 256,
        })
        assert wallet == VALID_WALLET
        assert tier == "plus"
        assert msgs == [{"role": "user", "content": "hi"}]
        assert mt == 256

    def test_default_max_tokens(self):
        _, _, _, mt = validate_request({
            "wallet": VALID_WALLET,
            "tier": "plus",
            "messages": [{"role": "user", "content": "hi"}],
        })
        assert mt == 512

    def test_rejects_non_object_body(self):
        with pytest.raises(EepGenError) as exc:
            validate_request("not a dict")  # type: ignore[arg-type]
        assert exc.value.status == 400

    @pytest.mark.parametrize("bad_wallet", [
        "", "short", "0OoIl_invalid", None, 123, "x" * 200,
    ])
    def test_rejects_bad_wallet(self, bad_wallet):
        with pytest.raises(EepGenError):
            validate_request({
                "wallet": bad_wallet,
                "tier": "plus",
                "messages": [{"role": "user", "content": "hi"}],
            })

    def test_rejects_unknown_tier(self):
        with pytest.raises(EepGenError) as exc:
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "vip",
                "messages": [{"role": "user", "content": "hi"}],
            })
        assert "tier" in str(exc.value)

    def test_rejects_free_tier(self):
        with pytest.raises(EepGenError) as exc:
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "free",
                "messages": [{"role": "user", "content": "hi"}],
            })
        assert "BYOK" in str(exc.value)

    def test_rejects_empty_messages(self):
        with pytest.raises(EepGenError):
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [],
            })

    def test_rejects_invalid_role(self):
        with pytest.raises(EepGenError):
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [{"role": "evil", "content": "hi"}],
            })

    def test_rejects_non_string_content(self):
        with pytest.raises(EepGenError):
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [{"role": "user", "content": 42}],
            })

    @pytest.mark.parametrize("bad_max", [0, -5, 5000, "lots", None])
    def test_rejects_bad_max_tokens(self, bad_max):
        with pytest.raises(EepGenError):
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": bad_max,
            })

    def test_rejects_oversize_prompt(self):
        big = "x" * (eepgen_proxy.MAX_PROMPT_TOKENS_ESTIMATE * 4 + 1)
        with pytest.raises(EepGenError) as exc:
            validate_request({
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [{"role": "user", "content": big}],
            })
        assert exc.value.status == 413


# ── Quota math ───────────────────────────────────────────────────────


class TestQuota:
    def test_quota_for_tier(self):
        assert quota_for_tier("plus") == TIER_QUOTAS["plus"]
        assert quota_for_tier("privacy") == TIER_QUOTAS["privacy"]
        assert quota_for_tier("operator") == TIER_QUOTAS["operator"]

    def test_quota_for_unknown_tier(self):
        with pytest.raises(EepGenError):
            quota_for_tier("vip")

    def test_remaining_today(self):
        rec = QuotaRecord.fresh(VALID_WALLET, "plus", TODAY, NOW)
        assert remaining_today(rec) == TIER_QUOTAS["plus"]
        used = increment_quota(rec, 1234, NOW)
        assert remaining_today(used) == TIER_QUOTAS["plus"] - 1234

    def test_remaining_today_clamps_to_zero(self):
        rec = QuotaRecord.fresh(VALID_WALLET, "plus", TODAY, NOW)
        # Pretend we used way more than the daily cap (shouldn't happen but defensive)
        used = increment_quota(rec, TIER_QUOTAS["plus"] + 999, NOW)
        assert remaining_today(used) == 0

    def test_increment_quota_negative_rejected(self):
        rec = QuotaRecord.fresh(VALID_WALLET, "plus", TODAY, NOW)
        with pytest.raises(EepGenError):
            increment_quota(rec, -1, NOW)


# ── Persistence ──────────────────────────────────────────────────────


class TestPersistence:
    def test_load_creates_fresh_when_missing(self, root: Path):
        rec = load_quota(root, VALID_WALLET, "plus", TODAY, NOW)
        assert rec.wallet == VALID_WALLET
        assert rec.tokens_used_today == 0
        assert rec.day_ymd == TODAY
        assert rec.tier == "plus"

    def test_round_trip_save_load_same_day(self, root: Path):
        rec = load_quota(root, VALID_WALLET, "plus", TODAY, NOW)
        rec = increment_quota(rec, 500, NOW)
        save_quota(root, rec)
        loaded = load_quota(root, VALID_WALLET, "plus", TODAY, NOW)
        assert loaded.tokens_used_today == 500
        assert loaded.total_tokens_used == 500

    def test_day_rollover_resets_today_keeps_total(self, root: Path):
        rec = load_quota(root, VALID_WALLET, "plus", TODAY, NOW)
        rec = increment_quota(rec, 999, NOW)
        save_quota(root, rec)
        # Next day
        next_day = "2026-05-29"
        next_now = "2026-05-29T01:00:00+00:00"
        loaded = load_quota(root, VALID_WALLET, "plus", next_day, next_now)
        assert loaded.day_ymd == next_day
        assert loaded.tokens_used_today == 0
        assert loaded.total_tokens_used == 999

    def test_corrupt_file_yields_fresh_record(self, root: Path):
        path = eepgen_proxy._quota_path(root, VALID_WALLET)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("not-json")
        rec = load_quota(root, VALID_WALLET, "plus", TODAY, NOW)
        assert rec.tokens_used_today == 0
        assert rec.total_tokens_used == 0

    def test_atomic_write_temp_files_cleaned(self, root: Path):
        rec = QuotaRecord.fresh(VALID_WALLET, "plus", TODAY, NOW)
        save_quota(root, rec)
        # No leftover .tmp- files
        for p in eepgen_proxy.quota_dir(root).iterdir():
            assert not p.name.startswith(".tmp-")

    def test_invalid_wallet_rejected_at_path_resolution(self, root: Path):
        with pytest.raises(EepGenError):
            load_quota(root, "../etc/passwd", "plus", TODAY, NOW)


# ── DeepInfra forwarding ─────────────────────────────────────────────


class TestForward:
    def test_happy_path(self, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake-key")
        completion, tokens = forward_to_deepinfra(
            [{"role": "user", "content": "hi"}],
            64,
            transport=_ok_transport("hello!", 22),
        )
        assert completion == "hello!"
        assert tokens == 22

    def test_missing_api_key_raises_503(self, monkeypatch):
        monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
        with pytest.raises(EepGenError) as exc:
            forward_to_deepinfra(
                [{"role": "user", "content": "hi"}],
                64,
                transport=_ok_transport(),
            )
        assert exc.value.status == 503

    def test_non_2xx_raises_502(self, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        def transport(url, headers, body, timeout):
            return 429, b'{"error":"rate-limited"}'
        with pytest.raises(EepGenError) as exc:
            forward_to_deepinfra(
                [{"role": "user", "content": "hi"}],
                64,
                transport=transport,
            )
        assert exc.value.status == 502

    def test_invalid_json_raises_502(self, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        def transport(url, headers, body, timeout):
            return 200, b"<not-json>"
        with pytest.raises(EepGenError) as exc:
            forward_to_deepinfra(
                [{"role": "user", "content": "hi"}],
                64,
                transport=transport,
            )
        assert exc.value.status == 502

    def test_missing_choices_raises_502(self, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        def transport(url, headers, body, timeout):
            return 200, b'{"unexpected":"shape"}'
        with pytest.raises(EepGenError) as exc:
            forward_to_deepinfra(
                [{"role": "user", "content": "hi"}],
                64,
                transport=transport,
            )
        assert exc.value.status == 502

    def test_url_and_model_overridable_via_env(self, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        monkeypatch.setenv("DEEPINFRA_BASE_URL", "https://custom/openai/chat")
        monkeypatch.setenv("DEEPINFRA_MODEL", "custom-model")
        captured: dict = {}

        def transport(url, headers, body, timeout):
            captured["url"] = url
            captured["body"] = json.loads(body.decode())
            return 200, _ok_transport()(None, None, None, None)[1]  # type: ignore

        forward_to_deepinfra(
            [{"role": "user", "content": "hi"}],
            64,
            transport=transport,
        )
        assert captured["url"] == "https://custom/openai/chat"
        assert captured["body"]["model"] == "custom-model"


# ── End-to-end handle_request ────────────────────────────────────────


class TestHandleRequest:
    def test_happy_path(self, root: Path, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        result = handle_request(
            root,
            {
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 64,
            },
            transport=_ok_transport("ok!", 11),
            today_ymd=TODAY,
            now_iso=NOW,
            require_signature=False,
        )
        assert result["ok"] is True
        assert result["completion"] == "ok!"
        assert result["tokens_used"] == 11
        assert result["tokens_used_today"] == 11
        assert result["quota_today"] == TIER_QUOTAS["plus"]
        assert result["quota_remaining_today"] == TIER_QUOTAS["plus"] - 11
        assert result["tier"] == "plus"

    def test_quota_carries_across_calls(self, root: Path, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        for i in range(3):
            res = handle_request(
                root,
                {
                    "wallet": VALID_WALLET,
                    "tier": "plus",
                    "messages": [{"role": "user", "content": f"hi {i}"}],
                    "max_tokens": 64,
                },
                transport=_ok_transport("x", 100),
                today_ymd=TODAY,
                now_iso=NOW,
                require_signature=False,
            )
            assert res["tokens_used_today"] == 100 * (i + 1)

    def test_blocks_when_over_quota(self, root: Path, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        # Pre-stage a record at the cap
        cap = TIER_QUOTAS["plus"]
        rec = QuotaRecord(
            wallet=VALID_WALLET,
            day_ymd=TODAY,
            tokens_used_today=cap,
            total_tokens_used=cap,
            tier="plus",
            updated_at=NOW,
        )
        save_quota(root, rec)
        with pytest.raises(EepGenError) as exc:
            handle_request(
                root,
                {
                    "wallet": VALID_WALLET,
                    "tier": "plus",
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 64,
                },
                transport=_ok_transport(),
                today_ymd=TODAY,
                now_iso=NOW,
                require_signature=False,
            )
        assert exc.value.status == 402

    def test_clamps_max_tokens_to_remaining_quota(self, root: Path, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        cap = TIER_QUOTAS["plus"]
        # Pre-stage one token of headroom
        rec = QuotaRecord(
            wallet=VALID_WALLET,
            day_ymd=TODAY,
            tokens_used_today=cap - 1,
            total_tokens_used=cap - 1,
            tier="plus",
            updated_at=NOW,
        )
        save_quota(root, rec)
        captured: dict = {}

        def transport(url, headers, body, timeout):
            captured["body"] = json.loads(body.decode())
            return 200, json.dumps({
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"total_tokens": 1},
            }).encode()

        result = handle_request(
            root,
            {
                "wallet": VALID_WALLET,
                "tier": "plus",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 4096,
            },
            transport=transport,
            today_ymd=TODAY,
            now_iso=NOW,
            require_signature=False,
        )
        assert captured["body"]["max_tokens"] == 1
        assert result["ok"] is True

    def test_validation_error_propagates(self, root: Path, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        with pytest.raises(EepGenError) as exc:
            handle_request(
                root,
                {"wallet": "bad", "tier": "plus", "messages": [{"role": "user", "content": "hi"}]},
                transport=_ok_transport(),
                require_signature=False,
            )
        assert exc.value.status == 400

    def test_missing_api_key_propagates(self, root: Path, monkeypatch):
        monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
        with pytest.raises(EepGenError) as exc:
            handle_request(
                root,
                {
                    "wallet": VALID_WALLET,
                    "tier": "plus",
                    "messages": [{"role": "user", "content": "hi"}],
                },
                transport=_ok_transport(),
                require_signature=False,
            )
        assert exc.value.status == 503
