"""Tests for scripts/threat_events.py — in-memory block-event ring buffer."""
from __future__ import annotations

import sys
import threading
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.threat_events import (  # noqa: E402
    BlockEvent,
    BlockEventBuffer,
    events_to_dict,
    get_global_buffer,
    reset_global_buffer,
)


class TestBuffer:
    def test_starts_empty(self):
        b = BlockEventBuffer(cap=10)
        assert len(b) == 0
        assert b.all() == []
        assert b.head_seq() == 0

    def test_append_assigns_monotonic_seq(self):
        b = BlockEventBuffer(cap=10)
        e1 = b.append(domain="a.com", list_source="L")
        e2 = b.append(domain="b.com", list_source="L")
        assert e2.seq == e1.seq + 1

    def test_since_returns_only_newer_events(self):
        b = BlockEventBuffer(cap=10)
        e1 = b.append(domain="a.com")
        e2 = b.append(domain="b.com")
        e3 = b.append(domain="c.com")
        # Since e1.seq → only e2 + e3.
        out = b.since(e1.seq)
        seqs = [e.seq for e in out]
        assert seqs == [e2.seq, e3.seq]

    def test_since_zero_returns_everything(self):
        b = BlockEventBuffer(cap=10)
        b.append(domain="a.com")
        b.append(domain="b.com")
        assert len(b.since(0)) == 2

    def test_latest_n(self):
        b = BlockEventBuffer(cap=10)
        for i in range(5):
            b.append(domain=f"d{i}.com")
        last = b.latest(3)
        assert [e.domain for e in last] == ["d2.com", "d3.com", "d4.com"]

    def test_capacity_drops_oldest(self):
        b = BlockEventBuffer(cap=3)
        for i in range(5):
            b.append(domain=f"d{i}.com")
        assert len(b) == 3
        domains = [e.domain for e in b.all()]
        assert domains == ["d2.com", "d3.com", "d4.com"]

    def test_head_seq_advances(self):
        b = BlockEventBuffer(cap=10)
        assert b.head_seq() == 0
        e = b.append(domain="x.com")
        assert b.head_seq() == e.seq

    def test_invalid_cap_rejected(self):
        with pytest.raises(ValueError, match=">= 1"):
            BlockEventBuffer(cap=0)

    def test_thread_safety_under_concurrent_appends(self):
        """1000 concurrent appends → all sequence numbers are unique."""
        b = BlockEventBuffer(cap=2000)
        errors: list[BaseException] = []

        def worker(start: int):
            try:
                for i in range(100):
                    b.append(domain=f"d{start}-{i}.com")
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == []
        seqs = [e.seq for e in b.all()]
        assert len(set(seqs)) == len(seqs)
        assert sorted(seqs) == seqs  # monotonic in append order


class TestEventsToDict:
    def test_serialises_to_plain_dicts(self):
        b = BlockEventBuffer(cap=2)
        b.append(domain="a.com", list_source="L1", timestamp=1700000000.0)
        out = events_to_dict(b.all())
        assert out[0]["domain"] == "a.com"
        assert out[0]["list_source"] == "L1"
        assert out[0]["timestamp"] == 1700000000.0
        assert "seq" in out[0]


class TestGlobalBuffer:
    def test_get_global_buffer_returns_singleton(self):
        b1 = get_global_buffer()
        b2 = get_global_buffer()
        assert b1 is b2

    def test_reset_global_buffer_replaces(self):
        b1 = reset_global_buffer(cap=5)
        b2 = get_global_buffer()
        assert b1 is b2
        b3 = reset_global_buffer(cap=10)
        assert b3 is not b1
