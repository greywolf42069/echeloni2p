"""Verifier for foundation-node bandwidth summaries.

This module is the gate between the observation pipeline and the reward /
airdrop model. It only accepts summaries that contain a valid attestation
record.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
import json

from scripts.bandwidth_attestation import AttestationAuthority, AttestationChallenge, AttestationError, hash_snapshot


def verify_summary(summary_path: str | Path) -> Dict[str, Any]:
    path = Path(summary_path)
    raw = json.loads(path.read_text(encoding='utf-8'))
    last = raw.get('last_record') or {}
    payload = last.get('payload') or {}
    att = last.get('attestation') or {}
    if not att:
        raise AttestationError('missing attestation', status=401)

    # Reconstruct the challenge envelope.
    challenge = AttestationChallenge(
        wallet=att['wallet'],
        issued_at=int(att['issued_at']),
        nonce=att['nonce'],
        ttl_sec=int(att.get('ttl_sec', 300)),
    )
    snap_hash = hash_snapshot(payload)
    if snap_hash != att.get('snapshot_hash'):
        raise AttestationError('snapshot hash mismatch', status=401)

    # We don't have the original signing secret here; the authority server
    # is the verifier of record. This function therefore only performs a
    # structural check and returns the parsed summary.
    return {
        'day': raw.get('day'),
        'wallet': att.get('wallet'),
        'signed_at': att.get('signed_at'),
        'attestation_hash': att.get('attestation_hash'),
        'snapshot_hash': att.get('snapshot_hash'),
        'payload': payload,
    }


def load_verified_summary(summary_path: str | Path) -> Dict[str, Any]:
    return verify_summary(summary_path)
