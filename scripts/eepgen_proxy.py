"""
Hosted EepGen proxy — daemon-side gateway that forwards prompts
to DeepInfra (Gemma 3 4B) and tracks per-wallet daily token quota.

Phase E.5-simplified status:
  - Quota tracking: REAL (file-backed, atomic writes, per-day rollover).
  - DeepInfra forwarding: REAL (httpx-style call, configurable via env).
  - Wallet ownership: REAL (ed25519 signature over a time-bound
    challenge — see verify_wallet_signature). The caller MUST hold the
    wallet's private key; the identity is non-spoofable.
  - Subscription TIER: still trusted in v0.1 (the wallet is proven, but
    "does this proven wallet actually hold tier X" needs the on-chain
    SubscriptionPDA, which lands in v0.2). So a proven wallet can
    over-claim its tier today; the blast radius is bounded by the
    per-wallet daily quota, and v0.2's on-chain check closes it.

Storage layout:

    {root}/eepgen-quota/{wallet_pubkey}.json
        {
            "wallet": "...",
            "day_ymd": "2026-05-28",
            "tokens_used_today": 12345,
            "total_tokens_used": 999999,
            "tier": "plus",   # last-claimed; advisory only in v0.1
            "updated_at": "2026-05-28T15:00:00Z"
        }

Rollover: when a request lands and `day_ymd != today`, the file is
reset to today with `tokens_used_today=0` (and `total_tokens_used` is
incremented, never reset).

Tier quotas (per design-v2 §4):
    free      0       (free tier uses BYOK; this endpoint is N/A)
    plus      100_000 tokens/day
    privacy   1_000_000 tokens/day
    operator  5_000_000 tokens/day
"""
from __future__ import annotations

import dataclasses
import datetime as dt
import json
import os
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# Per-tier daily quotas (tokens). These mirror design-v2 §4.
TIER_QUOTAS: Dict[str, int] = {
    "free": 0,
    "plus": 100_000,
    "privacy": 1_000_000,
    "operator": 5_000_000,
}

# DeepInfra defaults — overridable via env.
DEFAULT_DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai/chat/completions"
DEFAULT_DEEPINFRA_MODEL = "google/gemma-3-4b-it"

# Solana base58 pubkey shape: 32-44 alphanumeric chars (no 0/O/I/l).
WALLET_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

# Bound the prompt size so a single bad request can't waste the day's quota.
MAX_PROMPT_TOKENS_ESTIMATE = 8000   # rough char/4 estimate
MAX_REQUEST_BODY_BYTES = 64 * 1024  # 64KB


class EepGenError(Exception):
    """Domain error reported back to clients via 4xx / 5xx."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status
        self.message = message


@dataclasses.dataclass
class QuotaRecord:
    wallet: str
    day_ymd: str
    tokens_used_today: int
    total_tokens_used: int
    tier: str
    updated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return dataclasses.asdict(self)

    @classmethod
    def fresh(cls, wallet: str, tier: str, today_ymd: str, now_iso: str) -> "QuotaRecord":
        return cls(
            wallet=wallet,
            day_ymd=today_ymd,
            tokens_used_today=0,
            total_tokens_used=0,
            tier=tier,
            updated_at=now_iso,
        )


# ── Quota storage ────────────────────────────────────────────────────


def quota_dir(root: Path) -> Path:
    return root / "eepgen-quota"


def _quota_path(root: Path, wallet: str) -> Path:
    if not WALLET_RE.match(wallet):
        raise EepGenError("invalid wallet address", status=400)
    return quota_dir(root) / f"{wallet}.json"


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load_quota(
    root: Path,
    wallet: str,
    tier: str,
    today_ymd: str,
    now_iso: str,
) -> QuotaRecord:
    """Load (or create) a fresh quota record for the wallet, applying
    day-rollover if the persisted record is from a different day.
    """
    path = _quota_path(root, wallet)
    if not path.exists():
        return QuotaRecord.fresh(wallet, tier, today_ymd, now_iso)
    try:
        with path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError):
        return QuotaRecord.fresh(wallet, tier, today_ymd, now_iso)
    rec = QuotaRecord(
        wallet=raw.get("wallet", wallet),
        day_ymd=raw.get("day_ymd", today_ymd),
        tokens_used_today=int(raw.get("tokens_used_today", 0)),
        total_tokens_used=int(raw.get("total_tokens_used", 0)),
        tier=raw.get("tier", tier),
        updated_at=raw.get("updated_at", now_iso),
    )
    if rec.day_ymd != today_ymd:
        # Rollover: zero today, accumulate total
        rec = QuotaRecord(
            wallet=rec.wallet,
            day_ymd=today_ymd,
            tokens_used_today=0,
            total_tokens_used=rec.total_tokens_used,
            tier=tier,  # accept new claim
            updated_at=now_iso,
        )
    else:
        # Same day — accept the latest tier claim too (will be on-chain
        # verified in v0.2).
        rec = dataclasses.replace(rec, tier=tier, updated_at=now_iso)
    return rec


def save_quota(root: Path, rec: QuotaRecord) -> None:
    path = _quota_path(root, rec.wallet)
    _atomic_write_json(path, rec.to_dict())


def increment_quota(rec: QuotaRecord, tokens: int, now_iso: str) -> QuotaRecord:
    if tokens < 0:
        raise EepGenError("negative tokens", status=500)
    return dataclasses.replace(
        rec,
        tokens_used_today=rec.tokens_used_today + tokens,
        total_tokens_used=rec.total_tokens_used + tokens,
        updated_at=now_iso,
    )


def quota_for_tier(tier: str) -> int:
    if tier not in TIER_QUOTAS:
        raise EepGenError(f"unknown tier: {tier}", status=400)
    return TIER_QUOTAS[tier]


def remaining_today(rec: QuotaRecord) -> int:
    return max(0, quota_for_tier(rec.tier) - rec.tokens_used_today)


# ── Request validation ───────────────────────────────────────────────


# ── Wallet ownership verification (ed25519) ──────────────────────────

# Base58 alphabet (Bitcoin/Solana), used to decode pubkeys + signatures.
_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_INDEX = {c: i for i, c in enumerate(_B58_ALPHABET)}

# A signed challenge older than this is rejected (replay-window bound).
CHALLENGE_MAX_AGE_SEC = 5 * 60
# The exact prefix the client must sign, binding the signature to this
# action so a signature captured elsewhere can't be replayed here.
CHALLENGE_PREFIX = "echelon-eepgen-auth"


def _b58decode(s: str) -> bytes:
    """Minimal, dependency-free base58 decode. Raises ValueError on bad
    input."""
    if not s:
        raise ValueError("empty base58 string")
    num = 0
    for ch in s:
        if ch not in _B58_INDEX:
            raise ValueError(f"invalid base58 char: {ch!r}")
        num = num * 58 + _B58_INDEX[ch]
    # Convert integer to bytes.
    full = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    # Restore leading zero bytes (encoded as leading '1's).
    pad = 0
    for ch in s:
        if ch == "1":
            pad += 1
        else:
            break
    return b"\x00" * pad + full


def build_challenge(wallet: str, issued_at: int) -> str:
    """The canonical message a client signs to prove wallet ownership.
    Binds the action (eepgen-auth) + the wallet + a timestamp."""
    return f"{CHALLENGE_PREFIX}:{wallet}:{issued_at}"


def verify_wallet_signature(
    wallet: str,
    signature_b58: str,
    issued_at: int,
    *,
    now: Optional[int] = None,
) -> None:
    """Verify that `signature_b58` is a valid ed25519 signature, by the
    private key behind `wallet` (a base58 Solana pubkey), over the
    canonical challenge for (wallet, issued_at).

    Raises EepGenError(401) on any failure. Returns None on success.

    This makes the wallet identity NON-SPOOFABLE: a caller can no longer
    claim to be an arbitrary wallet — they must hold its private key.
    (The TIER claim is still trusted in v0.1 pending the on-chain
    SubscriptionPDA in v0.2; ownership of the wallet is now proven.)
    """
    import time as _time
    from nacl.signing import VerifyKey
    from nacl.exceptions import BadSignatureError

    cur = now if now is not None else int(_time.time())
    if not isinstance(issued_at, int):
        raise EepGenError("issued_at must be an integer unix timestamp", status=401)
    age = cur - issued_at
    if age > CHALLENGE_MAX_AGE_SEC:
        raise EepGenError("auth challenge expired — re-sign and retry", status=401)
    if age < -CHALLENGE_MAX_AGE_SEC:
        raise EepGenError("auth challenge timestamp is in the future", status=401)

    try:
        pubkey_bytes = _b58decode(wallet)
    except ValueError as e:
        raise EepGenError(f"invalid wallet pubkey: {e}", status=401) from e
    if len(pubkey_bytes) != 32:
        raise EepGenError("wallet pubkey must decode to 32 bytes", status=401)

    try:
        sig_bytes = _b58decode(signature_b58)
    except ValueError as e:
        raise EepGenError(f"invalid signature encoding: {e}", status=401) from e
    if len(sig_bytes) != 64:
        raise EepGenError("signature must decode to 64 bytes", status=401)

    message = build_challenge(wallet, issued_at).encode("utf-8")
    try:
        VerifyKey(pubkey_bytes).verify(message, sig_bytes)
    except BadSignatureError as e:
        raise EepGenError("wallet ownership signature is invalid", status=401) from e


def validate_request(payload: Dict[str, Any]) -> Tuple[str, str, List[Dict[str, str]], int]:
    """Validate the inbound request body.

    Returns (wallet, tier, messages, max_tokens).
    Raises EepGenError on any malformation.
    """
    if not isinstance(payload, dict):
        raise EepGenError("request body must be a JSON object", status=400)
    wallet = payload.get("wallet")
    tier = payload.get("tier")
    messages = payload.get("messages")
    max_tokens = payload.get("max_tokens", 512)
    if not isinstance(wallet, str) or not WALLET_RE.match(wallet):
        raise EepGenError("wallet field is required and must be a Solana pubkey", status=400)
    if not isinstance(tier, str) or tier not in TIER_QUOTAS:
        raise EepGenError(f"tier must be one of: {sorted(TIER_QUOTAS)}", status=400)
    if tier == "free":
        raise EepGenError("free tier uses BYOK Gemini and does not call this endpoint", status=400)
    if not isinstance(messages, list) or len(messages) == 0:
        raise EepGenError("messages must be a non-empty list", status=400)
    cleaned: List[Dict[str, str]] = []
    for m in messages:
        if not isinstance(m, dict):
            raise EepGenError("each message must be an object", status=400)
        role = m.get("role")
        content = m.get("content")
        if role not in ("system", "user", "assistant"):
            raise EepGenError(f"invalid message role: {role!r}", status=400)
        if not isinstance(content, str):
            raise EepGenError("message content must be a string", status=400)
        cleaned.append({"role": role, "content": content})
    if not isinstance(max_tokens, int) or max_tokens < 1 or max_tokens > 4096:
        raise EepGenError("max_tokens must be an integer in [1, 4096]", status=400)
    # Cheap upper-bound on prompt size so a single request can't drain quota.
    prompt_chars = sum(len(m["content"]) for m in cleaned)
    if prompt_chars > MAX_PROMPT_TOKENS_ESTIMATE * 4:
        raise EepGenError("prompt too long", status=413)
    return wallet, tier, cleaned, max_tokens


# ── DeepInfra forwarding ─────────────────────────────────────────────


def _deepinfra_url() -> str:
    return os.environ.get("DEEPINFRA_BASE_URL", DEFAULT_DEEPINFRA_BASE_URL)


def _deepinfra_model() -> str:
    return os.environ.get("DEEPINFRA_MODEL", DEFAULT_DEEPINFRA_MODEL)


def _deepinfra_api_key() -> str:
    key = os.environ.get("DEEPINFRA_API_KEY", "").strip()
    if not key:
        raise EepGenError(
            "DEEPINFRA_API_KEY is not set on the daemon — hosted EepGen unavailable",
            status=503,
        )
    return key


def forward_to_deepinfra(
    messages: List[Dict[str, str]],
    max_tokens: int,
    *,
    timeout: float = 30.0,
    transport: Optional[Any] = None,
) -> Tuple[str, int]:
    """POST to DeepInfra's chat/completions endpoint. Returns
    (completion_text, total_tokens_used).

    `transport` is an optional callable for tests:
        transport(url, headers, body, timeout) -> (status, body_bytes)
    so we don't hit the network in unit tests.
    """
    body = json.dumps({
        "model": _deepinfra_model(),
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": False,
    }).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {_deepinfra_api_key()}",
        "Content-Type": "application/json",
    }

    if transport is not None:
        status, raw = transport(_deepinfra_url(), headers, body, timeout)
    else:
        req = urllib.request.Request(
            _deepinfra_url(),
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = resp.status
                raw = resp.read()
        except urllib.error.HTTPError as e:
            status = e.code
            try:
                raw = e.read()
            except Exception:
                raw = b""
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise EepGenError(f"DeepInfra unreachable: {e}", status=502) from e

    if status >= 400:
        raise EepGenError(f"DeepInfra returned {status}", status=502)
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise EepGenError(f"DeepInfra response was not JSON: {e}", status=502) from e

    try:
        completion = parsed["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise EepGenError("DeepInfra response missing choices[0].message.content", status=502) from e

    usage = parsed.get("usage") or {}
    tokens_used = int(usage.get("total_tokens", 0))
    return str(completion), tokens_used


# ── Top-level handler ────────────────────────────────────────────────


def _today_ymd_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")


def _now_iso_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def handle_request(
    root: Path,
    payload: Dict[str, Any],
    *,
    transport: Optional[Any] = None,
    today_ymd: Optional[str] = None,
    now_iso: Optional[str] = None,
    require_signature: bool = True,
    now_epoch: Optional[int] = None,
) -> Dict[str, Any]:
    """Validate → verify wallet ownership → check quota → forward →
    increment → save.

    Returns the JSON-serialisable response body. Raises EepGenError on
    any failure that should map to a 4xx/5xx response.

    `transport`, `today_ymd`, `now_iso`, `now_epoch` are test seams.
    `require_signature` defaults True (production): the request must
    carry a valid ed25519 wallet-ownership signature so the wallet
    identity can't be spoofed. Set False only for the legacy/no-auth
    deployment path.
    """
    wallet, tier, messages, max_tokens = validate_request(payload)

    # Prove the caller controls the wallet's private key before we spend
    # quota / forward to the paid model. Non-spoofable identity.
    if require_signature:
        sig = payload.get("signature")
        issued_at = payload.get("issued_at")
        if not isinstance(sig, str) or not sig:
            raise EepGenError("missing wallet-ownership signature", status=401)
        verify_wallet_signature(wallet, sig, issued_at, now=now_epoch)

    today = today_ymd or _today_ymd_utc()
    now = now_iso or _now_iso_utc()

    rec = load_quota(root, wallet, tier, today, now)
    cap = quota_for_tier(rec.tier)
    if rec.tokens_used_today >= cap:
        raise EepGenError(
            f"daily quota exceeded ({rec.tokens_used_today} of {cap} tokens used)",
            status=402,
        )
    # Pre-flight cap so a single request can't blow past the daily limit.
    headroom = cap - rec.tokens_used_today
    effective_max = min(max_tokens, headroom)
    if effective_max < 1:
        raise EepGenError("daily quota exceeded", status=402)

    completion, tokens_used = forward_to_deepinfra(messages, effective_max, transport=transport)
    rec = increment_quota(rec, tokens_used, now)
    save_quota(root, rec)

    return {
        "ok": True,
        "completion": completion,
        "tokens_used": tokens_used,
        "tokens_used_today": rec.tokens_used_today,
        "quota_today": cap,
        "quota_remaining_today": remaining_today(rec),
        "tier": rec.tier,
    }
