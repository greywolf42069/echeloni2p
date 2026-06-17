"""
In-memory ring buffer of "domain blocked" events.

Single-process, single-instance — used by the filtering proxy to record
hits, and by the /filters/events endpoint to surface them to the UI.

Thread-safe (the proxy runs in worker threads; the event-stream endpoint
runs in another). All access goes through a single Lock.
"""
from __future__ import annotations

import itertools
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass
from typing import Iterable

DEFAULT_CAP = 200


@dataclass(frozen=True)
class BlockEvent:
    seq: int               # monotonic, used for /events?since=N
    timestamp: float       # unix seconds (UTC)
    domain: str
    list_source: str       # which subscription's blocklist matched
    request_kind: str      # "http" | "connect" | other


class BlockEventBuffer:
    def __init__(self, cap: int = DEFAULT_CAP):
        if cap < 1:
            raise ValueError("cap must be >= 1")
        self._cap = cap
        self._buf: deque[BlockEvent] = deque(maxlen=cap)
        self._counter = itertools.count(1)
        self._lock = threading.Lock()

    @property
    def cap(self) -> int:
        return self._cap

    def append(self, *, domain: str, list_source: str = "(unknown)",
               request_kind: str = "http", timestamp: float | None = None) -> BlockEvent:
        ts = time.time() if timestamp is None else timestamp
        with self._lock:
            evt = BlockEvent(
                seq=next(self._counter),
                timestamp=ts,
                domain=str(domain),
                list_source=str(list_source),
                request_kind=str(request_kind),
            )
            self._buf.append(evt)
        return evt

    def since(self, seq: int) -> list[BlockEvent]:
        with self._lock:
            return [e for e in self._buf if e.seq > seq]

    def latest(self, n: int) -> list[BlockEvent]:
        with self._lock:
            if n <= 0:
                return []
            return list(self._buf)[-n:]

    def all(self) -> list[BlockEvent]:
        with self._lock:
            return list(self._buf)

    def head_seq(self) -> int:
        """Largest seq currently in the buffer (0 if empty)."""
        with self._lock:
            return self._buf[-1].seq if self._buf else 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._buf)


def events_to_dict(events: Iterable[BlockEvent]) -> list[dict]:
    return [asdict(e) for e in events]


# ─── Process-wide singleton (used by the daemon) ─────────────────────────

import threading

_GLOBAL_BUFFER: BlockEventBuffer | None = None
_GLOBAL_BUFFER_LOCK = threading.Lock()


def get_global_buffer() -> BlockEventBuffer:
    global _GLOBAL_BUFFER
    if _GLOBAL_BUFFER is None:
        with _GLOBAL_BUFFER_LOCK:
            # Double-checked locking — fast path avoids the lock after init.
            if _GLOBAL_BUFFER is None:
                _GLOBAL_BUFFER = BlockEventBuffer()
    return _GLOBAL_BUFFER


def reset_global_buffer(cap: int = DEFAULT_CAP) -> BlockEventBuffer:
    """Mostly for tests — replace the singleton with a fresh empty buffer."""
    global _GLOBAL_BUFFER
    with _GLOBAL_BUFFER_LOCK:
        _GLOBAL_BUFFER = BlockEventBuffer(cap=cap)
        return _GLOBAL_BUFFER
