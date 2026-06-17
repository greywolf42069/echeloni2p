"""Echelon bandwidth accounting.

This module reconciles i2pd's node-level transit counters with Echelon-
managed user traffic so we can distinguish:

- gross node throughput (all bytes i2pd carried)
- Echelon-attributed bytes (browser, publish, AI, exports)
- unattributed/native relay bytes (other I2P traffic)

The intent is not to perfectly fingerprint every packet (we cannot do
that from the browser), but to produce an honest accounting model that
can support:

- bandwidth classes (L/O/P/X)
- relay rewards
- quota enforcement
- node capability reporting

The model is intentionally conservative: if attribution is uncertain, we
leave bytes in the unattributed bucket rather than falsely claiming them.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, replace
from pathlib import Path
from typing import Any, Dict, Optional
import json
import os
import tempfile


@dataclass
class BandwidthSnapshot:
    """Single poll of the node's throughput counters."""
    captured_at: str
    total_received_bytes: int = 0
    total_sent_bytes: int = 0
    total_transit_bytes: int = 0
    received_bps: int = 0
    sent_bps: int = 0
    transit_bps: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BandwidthCounters:
    """Reconciled counters for a node or wallet-bound session."""
    wallet: Optional[str]
    day_ymd: str
    node_bandwidth_class: str = 'L'
    gross_transit_bytes: int = 0
    echelon_attributed_bytes: int = 0
    native_relay_bytes: int = 0
    unattributed_bytes: int = 0
    last_total_transit_bytes: int = 0
    last_total_received_bytes: int = 0
    last_total_sent_bytes: int = 0
    updated_at: str = ''

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def fresh(cls, wallet: Optional[str], day_ymd: str, node_bandwidth_class: str, now_iso: str) -> 'BandwidthCounters':
        return cls(
            wallet=wallet,
            day_ymd=day_ymd,
            node_bandwidth_class=node_bandwidth_class,
            updated_at=now_iso,
        )


BANDWIDTH_CLASS_LIMITS_BPS: Dict[str, int] = {
    'L': 32 * 1024,
    'O': 256 * 1024,
    'P': 2 * 1024 * 1024,
    'X': 0,  # unlimited / no cap
}


SERVICE_SOURCE_WEIGHTS: Dict[str, float] = {
    'browser': 1.0,
    'publish': 1.5,
    'export': 0.5,
    'ai': 0.25,
    'quota-query': 0.0,
}


class BandwidthAccountant:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, wallet: Optional[str], day_ymd: str) -> Path:
        name = wallet or 'node'
        return self.root / f'{name}-{day_ymd}.json'

    def load(self, wallet: Optional[str], day_ymd: str, node_bandwidth_class: str, now_iso: str) -> BandwidthCounters:
        path = self._path(wallet, day_ymd)
        if not path.exists():
            return BandwidthCounters.fresh(wallet, day_ymd, node_bandwidth_class, now_iso)
        try:
            raw = json.loads(path.read_text(encoding='utf-8'))
            return BandwidthCounters(
                wallet=raw.get('wallet', wallet),
                day_ymd=raw.get('day_ymd', day_ymd),
                node_bandwidth_class=raw.get('node_bandwidth_class', node_bandwidth_class),
                gross_transit_bytes=int(raw.get('gross_transit_bytes', 0)),
                echelon_attributed_bytes=int(raw.get('echelon_attributed_bytes', 0)),
                native_relay_bytes=int(raw.get('native_relay_bytes', 0)),
                unattributed_bytes=int(raw.get('unattributed_bytes', 0)),
                last_total_transit_bytes=int(raw.get('last_total_transit_bytes', 0)),
                last_total_received_bytes=int(raw.get('last_total_received_bytes', 0)),
                last_total_sent_bytes=int(raw.get('last_total_sent_bytes', 0)),
                updated_at=raw.get('updated_at', now_iso),
            )
        except Exception:
            return BandwidthCounters.fresh(wallet, day_ymd, node_bandwidth_class, now_iso)

    def save(self, rec: BandwidthCounters) -> None:
        path = self._path(rec.wallet, rec.day_ymd)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix='.tmp-', dir=str(path.parent))
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(rec.to_dict(), f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def reconcile_snapshot(
        self,
        rec: BandwidthCounters,
        snapshot: BandwidthSnapshot,
        attributed_delta_bytes: int = 0,
        native_delta_bytes: int = 0,
    ) -> BandwidthCounters:
        gross_delta = max(0, snapshot.total_transit_bytes - rec.last_total_transit_bytes)
        attrib = max(0, attributed_delta_bytes)
        native = max(0, native_delta_bytes)
        accounted = attrib + native
        unattributed = max(0, gross_delta - accounted)
        return replace(
            rec,
            gross_transit_bytes=rec.gross_transit_bytes + gross_delta,
            echelon_attributed_bytes=rec.echelon_attributed_bytes + attrib,
            native_relay_bytes=rec.native_relay_bytes + native,
            unattributed_bytes=rec.unattributed_bytes + unattributed,
            last_total_transit_bytes=snapshot.total_transit_bytes,
            last_total_received_bytes=snapshot.total_received_bytes,
            last_total_sent_bytes=snapshot.total_sent_bytes,
            updated_at=snapshot.captured_at,
        )

    def set_bandwidth_class(self, rec: BandwidthCounters, node_bandwidth_class: str) -> BandwidthCounters:
        return replace(rec, node_bandwidth_class=node_bandwidth_class)

    def limit_bps(self, rec: BandwidthCounters) -> int:
        return BANDWIDTH_CLASS_LIMITS_BPS.get(rec.node_bandwidth_class.upper(), 32 * 1024)

    def can_transmit(self, rec: BandwidthCounters, requested_bps: int) -> bool:
        limit = self.limit_bps(rec)
        return True if limit == 0 else requested_bps <= limit

    def classify_source(self, source: str) -> float:
        return SERVICE_SOURCE_WEIGHTS.get(source, 1.0)
