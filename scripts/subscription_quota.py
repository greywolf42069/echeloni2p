"""Stage 1 subscription/quota state for Echelon.

This module is intentionally small and durable: it stores the current
entitlements and usage counters that the daemon enforces.

The data model is simple enough to live locally for now, but it is
structured so it can later be migrated to an on-chain PDA or a signed
server-side record without changing the semantics.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Literal, Optional
import fcntl
import json
import time

Tier = Literal['free', 'plus', 'privacy', 'operator']

SECONDS_PER_DAY = 86_400

DEFAULT_QUOTAS: Dict[Tier, Dict[str, int]] = {
    'free': {
        'daily_page_views': 25,
        'concurrent_tabs': 3,
        'hosted_eepsites': 1,
        'max_eepsite_bytes': 10 * 1024 * 1024,
        'daily_publish_bytes': 10 * 1024 * 1024,
        'daily_ai_tokens': 0,
        'daily_bandwidth_bytes': 1 * 1024 * 1024 * 1024,
        'api_burst_per_sec': 3,
        'device_identities': 1,
        'installations': 1,
        'outproxy': 0,
        'priority_routing': 0,
        'cover_traffic': 0,
    },
    'plus': {
        'daily_page_views': 250,
        'concurrent_tabs': 10,
        'hosted_eepsites': 5,
        'max_eepsite_bytes': 50 * 1024 * 1024,
        'daily_publish_bytes': 100 * 1024 * 1024,
        'daily_ai_tokens': 100_000,
        'daily_bandwidth_bytes': 50 * 1024 * 1024 * 1024,
        'api_burst_per_sec': 10,
        'device_identities': 2,
        'installations': 2,
        'outproxy': 0,
        'priority_routing': 0,
        'cover_traffic': 0,
    },
    'privacy': {
        'daily_page_views': 1000,
        'concurrent_tabs': 20,
        'hosted_eepsites': 10,
        'max_eepsite_bytes': 100 * 1024 * 1024,
        'daily_publish_bytes': 500 * 1024 * 1024,
        'daily_ai_tokens': 1_000_000,
        'daily_bandwidth_bytes': 200 * 1024 * 1024 * 1024,
        'api_burst_per_sec': 25,
        'device_identities': 3,
        'installations': 3,
        'outproxy': 1,
        'priority_routing': 1,
        'cover_traffic': 1,
    },
    'operator': {
        'daily_page_views': 5000,
        'concurrent_tabs': 50,
        'hosted_eepsites': 25,
        'max_eepsite_bytes': 250 * 1024 * 1024,
        'daily_publish_bytes': 2 * 1024 * 1024 * 1024,
        'daily_ai_tokens': 5_000_000,
        'daily_bandwidth_bytes': 1 * 1024 * 1024 * 1024 * 1024,
        'api_burst_per_sec': 50,
        'device_identities': 5,
        'installations': 5,
        'outproxy': 1,
        'priority_routing': 1,
        'cover_traffic': 1,
    },
}

@dataclass
class Entitlement:
    wallet: str
    tier: Tier = 'free'
    device_key: str = ''
    relay_score: int = 0
    page_views_today: int = 0
    publish_bytes_today: int = 0
    ai_tokens_today: int = 0
    bandwidth_bytes_today: int = 0
    active_tabs: int = 0
    eepsites_hosted: int = 0
    device_identities: int = 1
    installations: int = 1
    outproxy_enabled: bool = False
    priority_enabled: bool = False
    cover_traffic_enabled: bool = False
    day_start: int = 0
    last_updated: int = 0

    def quotas(self) -> Dict[str, int]:
        return DEFAULT_QUOTAS[self.tier]

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)

    @staticmethod
    def from_dict(data: Dict[str, object]) -> 'Entitlement':
        return Entitlement(
            wallet=str(data.get('wallet', '')),
            tier=str(data.get('tier', 'free')),
            device_key=str(data.get('device_key', '')),
            relay_score=int(data.get('relay_score', 0)),
            page_views_today=int(data.get('page_views_today', 0)),
            publish_bytes_today=int(data.get('publish_bytes_today', 0)),
            ai_tokens_today=int(data.get('ai_tokens_today', 0)),
            bandwidth_bytes_today=int(data.get('bandwidth_bytes_today', 0)),
            active_tabs=int(data.get('active_tabs', 0)),
            eepsites_hosted=int(data.get('eepsites_hosted', 0)),
            device_identities=int(data.get('device_identities', 1)),
            installations=int(data.get('installations', 1)),
            outproxy_enabled=bool(data.get('outproxy_enabled', False)),
            priority_enabled=bool(data.get('priority_enabled', False)),
            cover_traffic_enabled=bool(data.get('cover_traffic_enabled', False)),
            day_start=int(data.get('day_start', 0)),
            last_updated=int(data.get('last_updated', 0)),
        )

class QuotaStore:
    def __init__(self, root: Optional[Path] = None):
        self.root = root or Path.home() / '.echelon' / 'entitlements'
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: Dict[str, tuple] = {}  # wallet -> (lock_fd, lock_path)

    def _path(self, wallet: str) -> Path:
        return self.root / f'{wallet}.json'

    def _lock_path(self, wallet: str) -> Path:
        return self.root / f'.{wallet}.lock'

    def _acquire_lock(self, wallet: str) -> None:
        lp = self._lock_path(wallet)
        fd = open(lp, 'w')
        fcntl.flock(fd, fcntl.LOCK_EX)
        self._locks[wallet] = (fd, lp)

    def _release_lock(self, wallet: str) -> None:
        if wallet in self._locks:
            fd, lp = self._locks[wallet]
            fcntl.flock(fd, fcntl.LOCK_UN)
            fd.close()
            try:
                lp.unlink()
            except OSError:
                pass
            del self._locks[wallet]

    def _reset_if_needed(self, ent: Entitlement, now: Optional[int] = None) -> Entitlement:
        now = now or int(time.time())
        day = now - (now % SECONDS_PER_DAY)
        if ent.day_start != day:
            ent.page_views_today = 0
            ent.publish_bytes_today = 0
            ent.ai_tokens_today = 0
            ent.bandwidth_bytes_today = 0
            ent.active_tabs = 0
            ent.day_start = day
        ent.last_updated = now
        return ent

    def _get_unlocked(self, wallet: str) -> Entitlement:
        """Read entitlement without locking. Caller must hold the lock."""
        p = self._path(wallet)
        if not p.exists():
            now = int(time.time())
            return Entitlement(wallet=wallet, day_start=now - (now % SECONDS_PER_DAY), last_updated=now)
        data = json.loads(p.read_text(encoding='utf-8'))
        ent = Entitlement.from_dict(data)
        return self._reset_if_needed(ent)

    def _save_unlocked(self, ent: Entitlement) -> None:
        """Write entitlement without locking. Caller must hold the lock."""
        ent = self._reset_if_needed(ent)
        self._path(ent.wallet).write_text(json.dumps(ent.to_dict(), indent=2, sort_keys=True), encoding='utf-8')

    def get(self, wallet: str) -> Entitlement:
        self._acquire_lock(wallet)
        try:
            return self._get_unlocked(wallet)
        finally:
            self._release_lock(wallet)

    def save(self, ent: Entitlement) -> None:
        try:
            self._save_unlocked(ent)
        finally:
            self._release_lock(ent.wallet)

    def ensure(self, wallet: str) -> Entitlement:
        self._acquire_lock(wallet)
        try:
            ent = self._get_unlocked(wallet)
            self._save_unlocked(ent)
            return ent
        finally:
            self._release_lock(wallet)

    def set_tier(self, wallet: str, tier: Tier) -> Entitlement:
        self._acquire_lock(wallet)
        try:
            ent = self._get_unlocked(wallet)
            ent.tier = tier
            q = ent.quotas()
            ent.outproxy_enabled = bool(q['outproxy'])
            ent.priority_enabled = bool(q['priority_routing'])
            ent.cover_traffic_enabled = bool(q['cover_traffic'])
            self._save_unlocked(ent)
            return ent
        finally:
            self._release_lock(wallet)

    def can(self, ent: Entitlement, action: str, amount: int = 1) -> tuple[bool, str]:
        q = ent.quotas()
        if action == 'browse':
            return (ent.page_views_today + amount <= q['daily_page_views'], 'daily_page_views')
        if action == 'publish':
            return (ent.publish_bytes_today + amount <= q['daily_publish_bytes'], 'daily_publish_bytes')
        if action == 'ai':
            return (ent.ai_tokens_today + amount <= q['daily_ai_tokens'], 'daily_ai_tokens')
        if action == 'tabs':
            return (ent.active_tabs + amount <= q['concurrent_tabs'], 'concurrent_tabs')
        if action == 'outproxy':
            return (bool(q['outproxy']), 'outproxy')
        return (True, '')

    def increment(self, wallet: str, action: str, amount: int = 1) -> Entitlement:
        self._acquire_lock(wallet)
        try:
            ent = self._get_unlocked(wallet)
            if action == 'browse':
                ent.page_views_today += amount
            elif action == 'publish':
                ent.publish_bytes_today += amount
            elif action == 'ai':
                ent.ai_tokens_today += amount
            elif action == 'bandwidth':
                ent.bandwidth_bytes_today += amount
            elif action == 'tabs':
                ent.active_tabs += amount
            elif action == 'hosted_site':
                ent.eepsites_hosted += amount
            self._save_unlocked(ent)
            return ent
        finally:
            self._release_lock(wallet)
