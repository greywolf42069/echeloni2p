"""Foundation-node poller for Echelon bandwidth snapshots.

This worker is intentionally read-only. It polls the bandwidth sidecar on
an interval, stores compact daily snapshots, and produces an audit trail
that can later feed airdrop / reward calculations.

It does not need secrets. It simply observes the node metrics that the
sidecar exposes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib
import hmac
import json
import os
import time
import urllib.request

from scripts.bandwidth_attestation import hash_snapshot, _b64url

DEFAULT_URL = 'http://127.0.0.1:7072/status/bandwidth'
DEFAULT_ATTEST_URL = 'http://127.0.0.1:7073'
DEFAULT_OUT = Path.home() / '.echelon' / 'foundation-node'
DEFAULT_SUMMARY = Path.home() / '.echelon' / 'foundation-node-summary'


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _today() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def _url() -> str:
    return os.environ.get('ECHELON_FOUNDATION_BW_URL', DEFAULT_URL)


def _attest_url() -> str:
    return os.environ.get('ECHELON_FOUNDATION_ATTEST_URL', DEFAULT_ATTEST_URL)


def _out_dir() -> Path:
    raw = os.environ.get('ECHELON_FOUNDATION_BW_OUT')
    return Path(raw).expanduser() if raw else DEFAULT_OUT


def _summary_dir() -> Path:
    raw = os.environ.get('ECHELON_FOUNDATION_SUMMARY_OUT')
    return Path(raw).expanduser() if raw else DEFAULT_SUMMARY


def fetch_snapshot(wallet: str | None = None, tier: str = 'free') -> dict[str, Any]:
    url = _url()
    qs = []
    if wallet:
        qs.append(f'wallet={wallet}')
    if tier:
        qs.append(f'tier={tier}')
    if qs:
        url = url + ('&' if '?' in url else '?') + '&'.join(qs)
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def get_challenge(wallet: str) -> dict[str, Any]:
    url = _attest_url() + f'/attest/challenge?wallet={wallet}'
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def sign_snapshot(challenge: str, snapshot_hash: str, secret: str) -> str:
    digest = hmac.new(secret.encode('utf-8'), (challenge + '|' + snapshot_hash).encode('utf-8'), hashlib.sha256).digest()
    return _b64url(digest)


def submit_attestation(payload: dict[str, Any]) -> dict[str, Any]:
    url = _attest_url() + '/attest/submit'
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def append_daily_snapshot(record: dict[str, Any]) -> Path:
    out_dir = _out_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    day = _today()
    path = out_dir / f'{day}.jsonl'
    with path.open('a', encoding='utf-8') as f:
        f.write(json.dumps(record, ensure_ascii=False) + '\n')
    return path


def write_daily_summary(record: dict[str, Any]) -> Path:
    summary_dir = _summary_dir()
    summary_dir.mkdir(parents=True, exist_ok=True)
    day = _today()
    path = summary_dir / f'{day}.json'
    payload = {
        'day': day,
        'last_record': record,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    return path


def poll_once(wallet: str | None = None, tier: str = 'free') -> dict[str, Any]:
    payload = fetch_snapshot(wallet, tier)
    record = {
        'captured_at': _now_iso(),
        'wallet': wallet,
        'tier': tier,
        'payload': payload,
    }
    if wallet:
        challenge = get_challenge(wallet)
        snapshot_hash = hash_snapshot(payload)
        secret = os.environ.get('ECHELON_FOUNDATION_SIGNING_SECRET', 'dev-only-secret')
        sig = sign_snapshot(challenge['challenge'], snapshot_hash, secret)
        att = submit_attestation({
            'wallet': wallet,
            'issued_at': challenge['issued_at'],
            'nonce': challenge['nonce'],
            'ttl_sec': challenge.get('ttl_sec', 300),
            'snapshot': payload,
            'signature': sig,
        })
        record['attestation'] = att
    append_daily_snapshot(record)
    write_daily_summary(record)
    return record


def run_forever(interval_s: float = 300.0, wallet: str | None = None, tier: str = 'free') -> None:
    while True:
        try:
            poll_once(wallet, tier)
        except Exception:
            pass
        time.sleep(interval_s)


if __name__ == '__main__':
    interval = float(os.environ.get('ECHELON_FOUNDATION_BW_INTERVAL_S', '300'))
    wallet = os.environ.get('ECHELON_FOUNDATION_BW_WALLET') or None
    tier = os.environ.get('ECHELON_FOUNDATION_BW_TIER', 'free')
    run_forever(interval_s=interval, wallet=wallet, tier=tier)

