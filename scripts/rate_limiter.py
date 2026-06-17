"""Simple token bucket rate limiter for local daemons.

No external dependencies. Thread-safe. Uses a sliding window approach
with per-IP buckets. Designed for loopback-only servers where the
"IP" is always 127.0.0.1 — so this effectively limits per-connection.
"""
from __future__ import annotations

import threading
import time
from typing import Dict


class TokenBucket:
    """A single token bucket for one client."""

    def __init__(self, rate: float, capacity: int):
        self.rate = rate          # tokens per second
        self.capacity = capacity  # max burst size
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()
        self._lock = threading.Lock()

    def consume(self, tokens: int = 1) -> bool:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last_refill = now
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False


class RateLimiter:
    """Per-client rate limiter with automatic cleanup of stale buckets."""
    
    def __init__(self, rate: float = 10.0, capacity: int = 20, cleanup_interval: float = 60.0):
        self.rate = rate
        self.capacity = capacity
        self.cleanup_interval = cleanup_interval
        self._buckets: Dict[str, TokenBucket] = {}
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()
    
    def _get_bucket(self, client_id: str) -> TokenBucket:
        with self._lock:
            if client_id not in self._buckets:
                self._buckets[client_id] = TokenBucket(self.rate, self.capacity)
                # Periodic cleanup of stale buckets
                now = time.monotonic()
                if now - self._last_cleanup > self.cleanup_interval:
                    self._cleanup(now)
            return self._buckets[client_id]
    
    def _cleanup(self, now: float) -> None:
        """Remove buckets that haven't been used recently."""
        stale = [
            cid for cid, b in self._buckets.items()
            if now - b.last_refill > self.cleanup_interval * 2
        ]
        for cid in stale:
            del self._buckets[cid]
        self._last_cleanup = now
    
    def allow(self, client_id: str, tokens: int = 1) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        bucket = self._get_bucket(client_id)
        return bucket.consume(tokens)
