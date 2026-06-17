"""Adapter from verified foundation summaries into the reward simulator.

The simulator consumes normalized bandwidth data rather than raw sidecar
records. This keeps the reward layer decoupled from the collector layer.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict
import json

from scripts.foundation_summary_verifier import load_verified_summary


@dataclass
class VerifiedBandwidthSnapshot:
    day: str
    wallet: str | None
    tier: str | None
    payload: Dict[str, Any]
    attestation_hash: str | None
    snapshot_hash: str | None


def load_bandwidth_snapshot(summary_path: str | Path) -> VerifiedBandwidthSnapshot:
    data = load_verified_summary(summary_path)
    return VerifiedBandwidthSnapshot(
        day=data['day'],
        wallet=data.get('wallet'),
        tier=data.get('payload', {}).get('tier'),
        payload=data.get('payload', {}),
        attestation_hash=data.get('attestation_hash'),
        snapshot_hash=data.get('snapshot_hash'),
    )


def to_reward_input(verified: VerifiedBandwidthSnapshot) -> Dict[str, Any]:
    payload = verified.payload
    counters = payload.get('counters') or {}
    snapshot = payload.get('snapshot') or {}
    return {
        'day': verified.day,
        'wallet': verified.wallet,
        'tier': verified.tier,
        'bandwidth_class': payload.get('bandwidth_class'),
        'limit_bps': payload.get('limit_bps'),
        'gross_transit_bytes': counters.get('gross_transit_bytes', 0),
        'echelon_attributed_bytes': counters.get('echelon_attributed_bytes', 0),
        'native_relay_bytes': counters.get('native_relay_bytes', 0),
        'unattributed_bytes': counters.get('unattributed_bytes', 0),
        'received_bps': snapshot.get('received_bps', 0),
        'sent_bps': snapshot.get('sent_bps', 0),
        'transit_bps': snapshot.get('transit_bps', 0),
        'attestation_hash': verified.attestation_hash,
        'snapshot_hash': verified.snapshot_hash,
    }
