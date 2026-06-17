"""Tests for ed25519 wallet-ownership verification on EepGen requests.

Uses real ed25519 keypairs (pynacl) + base58-encodes the pubkey to a
Solana-style address, so the verification path is exercised with
genuine signatures rather than mocks.
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from nacl.signing import SigningKey

from scripts import eepgen_proxy
from scripts.eepgen_proxy import (
    EepGenError,
    build_challenge,
    handle_request,
    verify_wallet_signature,
)


# Base58 encode (mirror of the decode in eepgen_proxy) for test setup.
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(b: bytes) -> str:
    num = int.from_bytes(b, "big")
    out = ""
    while num > 0:
        num, rem = divmod(num, 58)
        out = _B58[rem] + out
    pad = 0
    for byte in b:
        if byte == 0:
            pad += 1
        else:
            break
    return "1" * pad + out


@pytest.fixture
def keypair():
    sk = SigningKey.generate()
    pubkey_b58 = b58encode(bytes(sk.verify_key))
    return sk, pubkey_b58


def sign_challenge(sk: SigningKey, wallet: str, issued_at: int) -> str:
    msg = build_challenge(wallet, issued_at).encode("utf-8")
    sig = sk.sign(msg).signature
    return b58encode(sig)


def _ok_transport(completion="ok", tokens=5):
    import json

    def t(url, headers, body, timeout):
        return 200, json.dumps({
            "choices": [{"message": {"content": completion}}],
            "usage": {"total_tokens": tokens},
        }).encode()
    return t


class TestVerifyWalletSignature:
    def test_valid_signature_passes(self, keypair):
        sk, wallet = keypair
        now = int(time.time())
        sig = sign_challenge(sk, wallet, now)
        # Should not raise.
        verify_wallet_signature(wallet, sig, now, now=now)

    def test_wrong_key_signature_rejected(self, keypair):
        sk, wallet = keypair
        other = SigningKey.generate()
        now = int(time.time())
        # Sign the right message but with the WRONG key.
        msg = build_challenge(wallet, now).encode()
        bad_sig = b58encode(other.sign(msg).signature)
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, bad_sig, now, now=now)
        assert exc.value.status == 401

    def test_tampered_message_rejected(self, keypair):
        sk, wallet = keypair
        now = int(time.time())
        # Sign issued_at=now but claim a different issued_at on verify.
        sig = sign_challenge(sk, wallet, now)
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, sig, now + 1, now=now)
        assert exc.value.status == 401

    def test_expired_challenge_rejected(self, keypair):
        sk, wallet = keypair
        old = int(time.time()) - (eepgen_proxy.CHALLENGE_MAX_AGE_SEC + 10)
        sig = sign_challenge(sk, wallet, old)
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, sig, old, now=int(time.time()))
        assert exc.value.status == 401
        assert "expired" in str(exc.value).lower()

    def test_future_challenge_rejected(self, keypair):
        sk, wallet = keypair
        future = int(time.time()) + (eepgen_proxy.CHALLENGE_MAX_AGE_SEC + 10)
        sig = sign_challenge(sk, wallet, future)
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, sig, future, now=int(time.time()))
        assert exc.value.status == 401

    def test_garbage_signature_rejected(self, keypair):
        sk, wallet = keypair
        now = int(time.time())
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, "not-base58-!!!", now, now=now)
        assert exc.value.status == 401

    def test_wrong_length_signature_rejected(self, keypair):
        sk, wallet = keypair
        now = int(time.time())
        short = b58encode(b"\x01\x02\x03")
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, short, now, now=now)
        assert exc.value.status == 401

    def test_invalid_wallet_pubkey_rejected(self):
        now = int(time.time())
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature("0OIl-invalid", "x", now, now=now)
        assert exc.value.status == 401

    def test_non_int_issued_at_rejected(self, keypair):
        sk, wallet = keypair
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(wallet, "x", "not-an-int", now=0)  # type: ignore[arg-type]
        assert exc.value.status == 401

    def test_signature_for_one_wallet_not_valid_for_another(self, keypair):
        sk, wallet = keypair
        other = SigningKey.generate()
        other_wallet = b58encode(bytes(other.verify_key))
        now = int(time.time())
        # sk signs ITS challenge; we present it claiming other_wallet.
        sig = sign_challenge(sk, wallet, now)
        with pytest.raises(EepGenError) as exc:
            verify_wallet_signature(other_wallet, sig, now, now=now)
        assert exc.value.status == 401


class TestHandleRequestSignatureGate:
    def test_signed_request_passes(self, tmp_path, keypair, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        sk, wallet = keypair
        now = int(time.time())
        sig = sign_challenge(sk, wallet, now)
        result = handle_request(
            tmp_path,
            {
                "wallet": wallet,
                "tier": "plus",
                "messages": [{"role": "user", "content": "hi"}],
                "signature": sig,
                "issued_at": now,
            },
            transport=_ok_transport(),
            now_epoch=now,
        )
        assert result["ok"] is True

    def test_missing_signature_rejected_by_default(self, tmp_path, keypair, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        _sk, wallet = keypair
        with pytest.raises(EepGenError) as exc:
            handle_request(
                tmp_path,
                {
                    "wallet": wallet,
                    "tier": "plus",
                    "messages": [{"role": "user", "content": "hi"}],
                },
                transport=_ok_transport(),
            )
        assert exc.value.status == 401

    def test_forged_wallet_claim_rejected(self, tmp_path, keypair, monkeypatch):
        """The whole point: you can't claim a wallet you don't control."""
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        sk, wallet = keypair
        victim = b58encode(bytes(SigningKey.generate().verify_key))
        now = int(time.time())
        # Sign with our key but claim the victim's wallet.
        sig = sign_challenge(sk, wallet, now)
        with pytest.raises(EepGenError) as exc:
            handle_request(
                tmp_path,
                {
                    "wallet": victim,
                    "tier": "operator",
                    "messages": [{"role": "user", "content": "hi"}],
                    "signature": sig,
                    "issued_at": now,
                },
                transport=_ok_transport(),
                now_epoch=now,
            )
        assert exc.value.status == 401

    def test_require_signature_false_skips_gate(self, tmp_path, keypair, monkeypatch):
        monkeypatch.setenv("DEEPINFRA_API_KEY", "fake")
        _sk, wallet = keypair
        result = handle_request(
            tmp_path,
            {
                "wallet": wallet,
                "tier": "plus",
                "messages": [{"role": "user", "content": "hi"}],
            },
            transport=_ok_transport(),
            require_signature=False,
        )
        assert result["ok"] is True
