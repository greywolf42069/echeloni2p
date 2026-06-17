"""Daemon-side bandwidth meter.

The daemon polls i2pd stats and stores reconciled counters so Echelon can
reason about:
- gross node throughput
- Echelon-attributed traffic
- native relay traffic
- unattributed traffic
- bandwidth class policy

This is intentionally conservative and file-backed so it can be used on
small devices without a database.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
import os

from scripts.bandwidth_accounting import (
    BandwidthAccountant,
    BandwidthSnapshot,
)
from scripts.i2pd_stats import fetch_i2pd_stats


DEFAULT_BW_ROOT = Path.home() / '.echelon' / 'bandwidth'


def _bw_root() -> Path:
    raw = os.environ.get('ECHELON_BANDWIDTH_ROOT')
    if raw:
        return Path(raw).expanduser()
    return DEFAULT_BW_ROOT


def _today_ymd() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _class_from_tier(tier: str) -> str:
    tier = (tier or 'free').lower()
    if tier == 'operator':
        return 'X'
    if tier == 'privacy':
        return 'P'
    if tier == 'plus':
        return 'O'
    return 'L'


def bandwidth_store() -> BandwidthAccountant:
    return BandwidthAccountant(_bw_root())


def snapshot_node(host: str = '127.0.0.1', port: int = 7070, timeout: float = 5.0) -> BandwidthSnapshot:
    stats = fetch_i2pd_stats(host, port, timeout)
    return BandwidthSnapshot(
        captured_at=_now_iso(),
        total_received_bytes=int(stats.get('totalReceivedBytes', 0)),
        total_sent_bytes=int(stats.get('totalSentBytes', 0)),
        total_transit_bytes=int(stats.get('totalTransitBytes', 0)),
        received_bps=int(stats.get('receivedBps', 0)),
        sent_bps=int(stats.get('sentBps', 0)),
        transit_bps=int(stats.get('transitBps', 0)),
    )


def poll_and_record(wallet: Optional[str], tier: str, echelon_attributed_bytes: int = 0, native_delta_bytes: int = 0) -> dict[str, Any]:
    """Poll i2pd and persist reconciled counters."""
    now_iso = _now_iso()
    day = _today_ymd()
    cls = _class_from_tier(tier)
    store = bandwidth_store()
    rec = store.load(wallet, day, cls, now_iso)
    snap = snapshot_node()
    rec = store.set_bandwidth_class(rec, cls)
    rec = store.reconcile_snapshot(
        rec,
        snap,
        attributed_delta_bytes=echelon_attributed_bytes,
        native_delta_bytes=native_delta_bytes,
    )
    store.save(rec)
    return {
        'snapshot': snap.to_dict(),
        'counters': rec.to_dict(),
        'limit_bps': store.limit_bps(rec),
        'bandwidth_class': cls,
    }
