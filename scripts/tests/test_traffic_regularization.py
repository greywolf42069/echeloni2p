"""
Tests for the Tamaraw-style traffic regularization WF defense.

The headline test is not "does it pad" — it's the FORMAL PROPERTY that
defeats website fingerprinting: the observable traffic shape is a function
ONLY of the anonymity-set bucket, never of the exact payload length. We
test that property directly, plus a simulated-adversary test showing a
classifier cannot distinguish two sites that land in the same bucket.
"""
from __future__ import annotations

import pytest

from scripts.traffic_regularization import (
    RegularizationParams,
    emit_paced,
    iter_cells,
    overhead_report,
    pad_payload,
    regularize,
    same_anonymity_set,
    unpad_payload,
)


class TestCellPadding:
    def test_small_payload_is_at_least_one_bucket(self):
        s = regularize(1)
        # 1 byte → 1 cell → padded up to length_multiple cells
        assert s.cells == RegularizationParams().length_multiple
        assert s.padded_bytes == s.cells * RegularizationParams().cell_size

    def test_zero_and_empty_handled(self):
        assert regularize(0).cells == RegularizationParams().length_multiple
        assert regularize(-5).cells == RegularizationParams().length_multiple

    def test_cells_monotonic_in_buckets(self):
        p = RegularizationParams(cell_size=512, length_multiple=100)
        # 100 cells = 51200 bytes per bucket step
        bucket1 = regularize(40_000, p)   # ~79 cells → bucket 100
        bucket2 = regularize(60_000, p)   # ~118 cells → bucket 200
        assert bucket1.cells == 100
        assert bucket2.cells == 200
        assert bucket2.cells > bucket1.cells


class TestAnonymitySetInvariance:
    """THE core WF-defense property: observable shape depends only on the
    bucket, not the exact length."""

    def test_two_lengths_in_same_bucket_are_identical_on_wire(self):
        p = RegularizationParams(cell_size=512, length_multiple=100)
        # Both fall in the first 100-cell bucket (< 51200 bytes).
        a = regularize(1483, p)
        b = regularize(20_000, p)
        assert a.cells == b.cells
        assert a.padded_bytes == b.padded_bytes
        assert a.schedule_ms == b.schedule_ms
        # ...which is exactly what same_anonymity_set asserts.
        assert same_anonymity_set(1483, 20_000, p)

    def test_observable_is_pure_function_of_bucket(self):
        """For a sweep of lengths, the observable (cells,bytes,schedule)
        takes only as many distinct values as there are buckets — never
        one-per-length. That collapse IS the anonymity set."""
        p = RegularizationParams(cell_size=512, length_multiple=100)
        observables = set()
        for length in range(1, 200_000, 137):   # 1459 distinct lengths
            s = regularize(length, p)
            observables.add((s.cells, s.padded_bytes, tuple(s.schedule_ms)))
        # 200000 bytes / 512 / 100 ≈ 4 buckets. Distinct observables must
        # be tiny vs the 1459 inputs — proving the length is hidden.
        assert len(observables) <= 6, f"too many observable classes: {len(observables)}"

    def test_neighboring_buckets_are_distinguishable(self):
        # The defense hides WITHIN a bucket, not across — adjacent buckets
        # differ (that's the residual, bounded leak).
        p = RegularizationParams(cell_size=512, length_multiple=100)
        assert not same_anonymity_set(40_000, 60_000, p)


class TestConstantRateSchedule:
    def test_schedule_is_fixed_interval(self):
        p = RegularizationParams(rate_interval_ms=20, length_multiple=10, cell_size=512)
        s = regularize(5000, p)  # ~10 cells → bucket 10
        # cumulative times: 20, 40, ..., 200
        assert s.schedule_ms == [20 * i for i in range(1, s.cells + 1)]

    def test_timing_carries_no_length_info(self):
        """Same bucket ⇒ identical schedule ⇒ inter-packet timing leaks
        nothing about which of the bucketed sites it was."""
        p = RegularizationParams()
        s1 = regularize(1000, p)
        s2 = regularize(2000, p)
        assert s1.schedule_ms == s2.schedule_ms


class TestPadUnpadRoundTrip:
    def test_roundtrip_preserves_data(self):
        for payload in [b"", b"x", b"hello world", b"A" * 1483, b"B" * 99_999]:
            padded = pad_payload(payload)
            assert unpad_payload(padded) == payload

    def test_padded_length_is_a_bucket_multiple(self):
        p = RegularizationParams(cell_size=512, length_multiple=100)
        padded = pad_payload(b"Z" * 5000, p)
        assert len(padded) % (p.cell_size) == 0
        assert (len(padded) // p.cell_size) % p.length_multiple == 0

    def test_two_different_payloads_same_bucket_pad_to_same_length(self):
        p = RegularizationParams(cell_size=512, length_multiple=100)
        a = pad_payload(b"A" * 1000, p)
        b = pad_payload(b"B" * 30_000, p)
        # Same bucket ⇒ identical on-wire LENGTH (content differs but is encrypted).
        assert len(a) == len(b)

    def test_unpad_rejects_corrupt_header(self):
        with pytest.raises(ValueError):
            unpad_payload(b"\xff\xff\xff\xff" + b"short")
        with pytest.raises(ValueError):
            unpad_payload(b"\x00")


class TestSimulatedAdversary:
    """A passive observer sees only the regularized shape. We model the
    strongest such observer as: 'group traces by their observable shape.'
    If two sites share a bucket, the adversary's best guess is a coin flip
    among the bucket members — accuracy bounded by 1/anonymity_set_size."""

    def test_adversary_cannot_separate_same_bucket_sites(self):
        p = RegularizationParams(cell_size=512, length_multiple=100)
        # Five "sites" with different real page sizes, all < one bucket.
        site_lengths = {"a": 1200, "b": 8000, "c": 19000, "d": 33000, "e": 50000}
        # Adversary observes the shape of each.
        observed = {name: regularize(L, p) for name, L in site_lengths.items()}
        # Group by observable.
        buckets: dict = {}
        for name, shp in observed.items():
            key = (shp.cells, shp.padded_bytes, tuple(shp.schedule_ms))
            buckets.setdefault(key, []).append(name)
        # All five collapse into ONE observable bucket → the adversary
        # cannot tell them apart; best accuracy = 1/5.
        assert len(buckets) == 1
        anonymity_set = len(next(iter(buckets.values())))
        assert anonymity_set == 5
        best_attacker_accuracy = 1.0 / anonymity_set
        assert best_attacker_accuracy <= 0.2

    def test_without_defense_lengths_are_unique(self):
        """Contrast: raw lengths are all distinct → a trivial adversary
        gets 100%. This is what we're defending against."""
        site_lengths = [1200, 8000, 19000, 33000, 50000]
        assert len(set(site_lengths)) == len(site_lengths)  # all unique = fingerprintable


class TestOverheadTradeoff:
    def test_overhead_report_shape(self):
        r = overhead_report(1000)
        assert r["realBytes"] == 1000
        assert r["paddedBytes"] >= 1000
        assert r["overheadBytes"] == r["paddedBytes"] - 1000
        assert r["cells"] == r["bucket"]

    def test_larger_length_multiple_means_bigger_anonymity_set_and_overhead(self):
        small_L = RegularizationParams(length_multiple=10)
        big_L = RegularizationParams(length_multiple=500)
        # Bigger L = coarser buckets = stronger anonymity but more overhead.
        s_small = regularize(1000, small_L)
        s_big = regularize(1000, big_L)
        assert s_big.padded_bytes >= s_small.padded_bytes

    def test_params_validation(self):
        with pytest.raises(ValueError):
            RegularizationParams(cell_size=0)
        with pytest.raises(ValueError):
            RegularizationParams(length_multiple=0)
        with pytest.raises(ValueError):
            RegularizationParams(rate_interval_ms=-1)


class TestRealTransport:
    """Sprint C: the body is ACTUALLY framed/paced, not just reported."""

    def test_iter_cells_all_uniform_size(self):
        cells = list(iter_cells(b"x" * 1000))
        p = RegularizationParams()
        assert all(len(c) == p.cell_size for c in cells)

    def test_iter_cells_count_equals_bucket(self):
        data = b"y" * 3000
        cells = list(iter_cells(data))
        assert len(cells) == regularize(len(data) + 4).bucket

    def test_iter_cells_recovers_exact_payload(self):
        for n in (0, 1, 511, 512, 513, 5000, 51000):
            data = bytes(range(256)) * (n // 256) + bytes(range(n % 256))
            assert unpad_payload(b"".join(iter_cells(data))) == data

    def test_same_bucket_identical_onwire_cells(self):
        # Two DIFFERENT payload lengths in the same bucket must produce the
        # identical observable: same cell count, same cell sizes.
        a = b"a" * 1000
        b = b"b" * 2000
        assert same_anonymity_set(len(a) + 4, len(b) + 4)
        ca = [len(c) for c in iter_cells(a)]
        cb = [len(c) for c in iter_cells(b)]
        assert ca == cb  # indistinguishable write sequence

    def test_emit_paced_schedule_is_constant_rate(self):
        writes, sleeps = [], []
        n = emit_paced(b"z" * 2000, writes.append, sleeps.append)
        p = RegularizationParams()
        # n-1 inter-cell sleeps, each exactly the rate interval
        assert len(sleeps) == n - 1
        assert all(abs(s - p.rate_interval_ms / 1000.0) < 1e-9 for s in sleeps)
        # bytes written recover the original
        assert unpad_payload(b"".join(writes)) == b"z" * 2000

    def test_emit_paced_two_lengths_same_observable(self):
        wa, sa = [], []
        wb, sb = [], []
        emit_paced(b"a" * 1000, wa.append, sa.append)
        emit_paced(b"b" * 2000, wb.append, sb.append)
        # identical number of writes, identical sizes, identical schedule
        assert [len(c) for c in wa] == [len(c) for c in wb]
        assert sa == sb

    def test_emit_paced_records_identical_timestamps_same_bucket(self):
        """Inject a fake clock that advances by each sleep(). Two DIFFERENT
        same-bucket payloads must emit cells at byte-identical AND
        timestamp-identical points — the constant-rate timing proof, not
        just a header claim."""
        def run(data):
            clock = {"t": 0.0}
            stamps = []
            sizes = []

            def write(cell):
                stamps.append(clock["t"])   # timestamp at emission
                sizes.append(len(cell))

            def sleep(secs):
                clock["t"] += secs          # fake clock advances by the sleep

            emit_paced(data, write, sleep)
            return stamps, sizes

        # Two different lengths that fall in the same bucket.
        assert same_anonymity_set(len(b"a" * 1000) + 4, len(b"b" * 2000) + 4)
        stamps_a, sizes_a = run(b"a" * 1000)
        stamps_b, sizes_b = run(b"b" * 2000)
        assert sizes_a == sizes_b           # identical byte sequence
        assert stamps_a == stamps_b         # identical emission schedule
        # and the schedule is genuinely constant-rate (monotonic, fixed step)
        p = RegularizationParams()
        step = p.rate_interval_ms / 1000.0
        deltas = [round(stamps_a[i + 1] - stamps_a[i], 9) for i in range(len(stamps_a) - 1)]
        assert all(d == step for d in deltas)

    def test_emit_paced_exact_unpad_recovery(self):
        """The framed+paced bytes recover the EXACT original payload."""
        for data in (b"", b"x", b"<html>hi</html>", bytes(range(256)) * 40):
            written = []
            emit_paced(data, written.append, lambda _s: None)
            assert unpad_payload(b"".join(written)) == data
