"""Bandwidth attestation service primitives.

This module mirrors the challenge/verify shape used by EepGen, but for
bandwidth snapshots. The server issues a challenge, the local collector
submits a signed snapshot hash, and the server returns a signed attestation
record.

Security goals:
- freshness (short TTL)
- replay resistance (nonce)
- integrity (hash of the snapshot payload)
- source binding (wallet / device identity)
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

ATTEST_PREFIX = 'echelon-bandwidth-attest'
CHALLENGE_TTL_SEC = 5 * 60
NONCE_BYTES = 16


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode('ascii').rstrip('=')


def _b64url_decode(s: str) -> bytes:
    pad = '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _now() -> int:
    return int(time.time())


def build_challenge(wallet: str, issued_at: int, nonce: str) -> str:
    return f'{ATTEST_PREFIX}:{wallet}:{issued_at}:{nonce}'


def challenge_hash(challenge: str, snapshot_hash: str) -> str:
    h = hashlib.sha256()
    h.update(challenge.encode('utf-8'))
    h.update(b'|')
    h.update(snapshot_hash.encode('utf-8'))
    return h.hexdigest()


@dataclass
class AttestationChallenge:
    wallet: str
    issued_at: int
    nonce: str
    ttl_sec: int = CHALLENGE_TTL_SEC

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @property
    def challenge(self) -> str:
        return build_challenge(self.wallet, self.issued_at, self.nonce)

    @property
    def expires_at(self) -> int:
        return self.issued_at + self.ttl_sec


@dataclass
class AttestationRecord:
    wallet: str
    issued_at: int
    nonce: str
    snapshot_hash: str
    attestation_hash: str
    signed_at: int
    signature_b64: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AttestationError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _state_dir() -> str:
    return os.environ.get('ECHELON_ATTEST_STATE_DIR', str(Path.home() / '.echelon' / 'attest'))


def _state_file() -> Path:
    return Path(_state_dir()) / 'used_nonces.json'


def _load_json_dict(path: Path) -> Dict[str, float]:
    """Load nonce->expiry dict from JSON. Handles legacy list format."""
    try:
        if not path.exists():
            return {}
        raw = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(raw, dict):
            return {str(k): float(v) for k, v in raw.items()}
        # Legacy format: list of strings — convert with default 24h TTL
        if isinstance(raw, list):
            expiry = time.time() + 86400
            return {str(n): expiry for n in raw}
        return {}
    except Exception:
        return {}


def _save_json_dict(path: Path, values: Dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(values), encoding='utf-8')
    tmp.replace(path)


class AttestationAuthority:
    """Server-side attestation authority.

    For now this uses a server secret to sign the attestation envelope.
    In a future deployment this can be replaced with a proper Ed25519
    signing key or HSM-backed signer.
    """

    def __init__(self, secret: Optional[str] = None):
        raw = (secret or os.environ.get('ECHELON_ATTEST_SECRET') or '').encode('utf-8')
        self.secret = raw if raw else secrets.token_bytes(32)
        self._nonce_file = _state_file()
        self._used_nonces: Dict[str, float] = _load_json_dict(self._nonce_file)

    def prune(self) -> None:
        """Remove expired nonces from the store."""
        now = time.time()
        self._used_nonces = {n: exp for n, exp in self._used_nonces.items() if exp > now}
        _save_json_dict(self._nonce_file, self._used_nonces)

    def issue_challenge(self, wallet: str) -> AttestationChallenge:
        return AttestationChallenge(
            wallet=wallet,
            issued_at=_now(),
            nonce=_b64url(secrets.token_bytes(NONCE_BYTES)),
        )

    def verify_submission(self, challenge: AttestationChallenge, snapshot_hash: str, signature_b64: str) -> AttestationRecord:
        now = _now()
        if now - challenge.issued_at > challenge.ttl_sec:
            raise AttestationError('challenge expired', status=401)
        # Prune expired nonces before checking
        self.prune()
        if challenge.nonce in self._used_nonces:
            raise AttestationError('challenge already used', status=401)
        expected_sig = hmac.new(
            self.secret,
            challenge_hash(challenge.challenge, snapshot_hash).encode('utf-8'),
            hashlib.sha256,
        ).digest()
        try:
            submitted_sig = _b64url_decode(signature_b64)
        except Exception as exc:
            raise AttestationError(f'invalid signature encoding: {exc}', status=401) from exc
        if not hmac.compare_digest(expected_sig, submitted_sig):
            raise AttestationError('invalid attestation signature', status=401)
        # Store nonce with expiry = challenge expiry time
        self._used_nonces[challenge.nonce] = challenge.expires_at
        _save_json_dict(self._nonce_file, self._used_nonces)
        attestation_hash = hashlib.sha256(
            (challenge_hash(challenge.challenge, snapshot_hash) + '|' + str(now)).encode('utf-8')
        ).hexdigest()
        server_sig = hmac.new(self.secret, attestation_hash.encode('utf-8'), hashlib.sha256).digest()
        return AttestationRecord(
            wallet=challenge.wallet,
            issued_at=challenge.issued_at,
            nonce=challenge.nonce,
            snapshot_hash=snapshot_hash,
            attestation_hash=attestation_hash,
            signed_at=now,
            signature_b64=_b64url(server_sig),
        )


def hash_snapshot(payload: Dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(canonical).hexdigest()

