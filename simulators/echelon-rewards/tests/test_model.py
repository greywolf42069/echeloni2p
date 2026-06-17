"""Tests for echelon_rewards.model — the pure math primitives.

These tests assert mathematical properties of the saturation, emission,
and fee-distribution functions. If these go red, the on-chain constants
derived from this simulator are not trustworthy.
"""
from __future__ import annotations

import math

import pytest

from echelon_rewards import model as M
from echelon_rewards import params as P


# ─── saturation_reward ───────────────────────────────────────────────────


class TestSaturationReward:
    def test_zero_total_stake_returns_zero(self):
        assert M.saturation_reward(pledge=0, delegated=0, total_stake=0) == 0.0

    def test_zero_performance_returns_baseline_no_work(self):
        # Even with 0 performance, the σ (delegated baseline) component is
        # paid; what's gated by performance is the work-bonus term.
        s = M.saturation_reward(
            pledge=100, delegated=200, total_stake=1000, performance=0.0
        )
        assert s > 0  # baseline of σ + λα still pays

    def test_full_performance_pays_more_than_zero(self):
        s_zero = M.saturation_reward(100, 200, 1000, performance=0.0)
        s_full = M.saturation_reward(100, 200, 1000, performance=1.0)
        assert s_full > s_zero

    def test_monotonic_in_pledge(self):
        # More pledge → more reward, with all else held constant.
        s_low = M.saturation_reward(pledge=100, delegated=0, total_stake=10000)
        s_med = M.saturation_reward(pledge=500, delegated=0, total_stake=10000)
        s_high = M.saturation_reward(pledge=1000, delegated=0, total_stake=10000)
        assert s_low < s_med < s_high

    def test_concave_past_saturation(self):
        # Doubling pledge past saturation point (β × total_stake) should NOT
        # double the reward — diminishing returns.
        ts = 1000.0
        beta = 1.0
        # Past saturation: pledge > total_stake (so >100%)
        s1 = M.saturation_reward(pledge=ts * 1.5, delegated=0, total_stake=ts, beta=beta)
        s2 = M.saturation_reward(pledge=ts * 3.0, delegated=0, total_stake=ts, beta=beta)
        # 2x stake should NOT yield 2x reward
        assert s2 < 2 * s1, f"saturation broken: {s1=}, {s2=}"

    def test_invalid_performance_raises(self):
        with pytest.raises(ValueError, match="performance"):
            M.saturation_reward(100, 100, 1000, performance=1.5)
        with pytest.raises(ValueError, match="performance"):
            M.saturation_reward(100, 100, 1000, performance=-0.1)

    def test_pure_function_same_inputs_same_output(self):
        # Determinism: same inputs always produce same output (no rng inside).
        a = M.saturation_reward(123, 456, 999, performance=0.7)
        b = M.saturation_reward(123, 456, 999, performance=0.7)
        assert a == b


class TestSaturationPoint:
    def test_basic_calculation(self):
        # 100M total stake, 1000 target nodes → 100K per node
        sp = M.saturation_point(total_stake=100_000_000, n_target_nodes=1000)
        assert sp == 100_000

    def test_invalid_target(self):
        with pytest.raises(ValueError):
            M.saturation_point(total_stake=1000, n_target_nodes=0)


# ─── emission_for_epoch ──────────────────────────────────────────────────


class TestEmissionDecay:
    def test_negative_epoch_returns_zero(self):
        assert M.emission_for_epoch(-1) == 0.0

    def test_past_window_returns_zero(self):
        assert M.emission_for_epoch(P.EMISSION_WINDOW_DAYS) == 0.0
        assert M.emission_for_epoch(P.EMISSION_WINDOW_DAYS + 100) == 0.0

    def test_strictly_decreasing(self):
        # Each epoch's emission should be ≤ previous (exponential decay)
        prev = M.emission_for_epoch(0)
        for epoch in [1, 30, 100, 365, 1000, 2000]:
            cur = M.emission_for_epoch(epoch)
            assert cur < prev, f"not decreasing at epoch {epoch}"
            prev = cur

    def test_total_emission_integrates_to_pool(self):
        # Sum of emissions over the window should ≈ EMISSION_POOL_RTD.
        total = M.cumulative_emission(P.EMISSION_WINDOW_DAYS - 1)
        # Tolerance: discrete sum vs continuous integral, expect <1% drift.
        rel_err = abs(total - P.EMISSION_POOL_RTD) / P.EMISSION_POOL_RTD
        assert rel_err < 0.01, (
            f"emission integral off by {rel_err:.2%}: {total=}, "
            f"target={P.EMISSION_POOL_RTD}"
        )

    def test_year_1_emission_share_in_target_range(self):
        # Year 1 should emit roughly 30% of total (per design-v2 §9.5).
        # Actual value depends on decay_factor; with default k=4 we expect
        # somewhere around 25-40% in year 1.
        year_1 = M.cumulative_emission(364)  # epochs 0..364 = 365 days
        share = year_1 / P.EMISSION_POOL_RTD
        assert 0.20 <= share <= 0.45, f"year-1 share out of target: {share:.2%}"

    def test_year_8_emission_share_small(self):
        # Year 8 (last year) should emit a small fraction.
        start = P.EMISSION_WINDOW_DAYS - 365
        year_8 = M.cumulative_emission(P.EMISSION_WINDOW_DAYS - 1) - M.cumulative_emission(start - 1)
        share = year_8 / P.EMISSION_POOL_RTD
        assert share < 0.05, f"year-8 share too high: {share:.2%}"


# ─── distribute_fees ─────────────────────────────────────────────────────


class TestDistributeFees:
    def test_bandwidth_split_5_95(self):
        result = M.distribute_fees(100.0, "bandwidth")
        assert math.isclose(result.treasury, 5.0)
        assert math.isclose(result.relays, 95.0)
        assert math.isclose(result.total(), 100.0)

    def test_hosting_split_30_70(self):
        result = M.distribute_fees(100.0, "hosting")
        assert math.isclose(result.treasury, 30.0)
        assert math.isclose(result.operators, 70.0)
        assert math.isclose(result.total(), 100.0)

    def test_template_creator_70_30(self):
        result = M.distribute_fees(100.0, "template_creator")
        assert math.isclose(result.creators, 70.0)
        assert math.isclose(result.treasury, 30.0)

    def test_template_echelon_100_treasury(self):
        result = M.distribute_fees(100.0, "template_echelon")
        assert math.isclose(result.treasury, 100.0)
        assert math.isclose(result.creators, 0.0)

    def test_eepgen_50_50(self):
        result = M.distribute_fees(100.0, "eepgen")
        assert math.isclose(result.treasury, 50.0)
        assert math.isclose(result.operators, 50.0)

    def test_outproxy_30_70(self):
        result = M.distribute_fees(100.0, "outproxy")
        assert math.isclose(result.treasury, 30.0)
        assert math.isclose(result.operators, 70.0)

    def test_enterprise_30_70(self):
        result = M.distribute_fees(100.0, "enterprise")
        assert math.isclose(result.treasury, 30.0)
        assert math.isclose(result.operators, 70.0)

    def test_cover_traffic_100_relays(self):
        result = M.distribute_fees(100.0, "cover_traffic")
        assert math.isclose(result.relays, 100.0)
        assert math.isclose(result.treasury, 0.0)

    @pytest.mark.parametrize("kind", [
        "bandwidth", "hosting", "template_creator", "template_echelon",
        "eepgen", "outproxy", "enterprise", "cover_traffic",
    ])
    def test_zero_fee_splits_to_zero(self, kind):
        result = M.distribute_fees(0.0, kind)
        assert result.total() == 0.0

    @pytest.mark.parametrize("kind", [
        "bandwidth", "hosting", "template_creator", "template_echelon",
        "eepgen", "outproxy", "enterprise", "cover_traffic",
    ])
    def test_split_conserves_total(self, kind):
        # Every legitimate split must preserve the original fee amount.
        result = M.distribute_fees(123.45, kind)
        assert math.isclose(result.total(), 123.45)

    def test_negative_fee_rejected(self):
        with pytest.raises(ValueError):
            M.distribute_fees(-1.0, "bandwidth")

    def test_unknown_kind_rejected(self):
        with pytest.raises(ValueError, match="unknown fee_kind"):
            M.distribute_fees(100, "tip_jar")


# ─── burn_rate ───────────────────────────────────────────────────────────


class TestBurnRate:
    def test_50_50_split(self):
        kept, burned = M.burn_rate(100.0)
        assert math.isclose(kept, 50.0)
        assert math.isclose(burned, 50.0)

    def test_zero_inflow(self):
        kept, burned = M.burn_rate(0.0)
        assert kept == 0.0 and burned == 0.0

    def test_negative_rejected(self):
        with pytest.raises(ValueError):
            M.burn_rate(-1.0)

    def test_total_preserved(self):
        kept, burned = M.burn_rate(987.65)
        assert math.isclose(kept + burned, 987.65)


# ─── usd_cents_to_currency ───────────────────────────────────────────────


class TestUsdCentsToCurrency:
    def test_usdc_baseline(self):
        # $9.00 → 9.00 USDC (1.00× multiplier)
        assert M.usd_cents_to_currency(900, "USDC", rtd_price_usd=0.10) == 9.00

    def test_rtd_25_percent_discount(self):
        # $9.00 with RTD discount → $9.00 × 0.75 = $6.75
        # At RTD price $0.10/RTD → 67.5 RTD
        result = M.usd_cents_to_currency(900, "RTD", rtd_price_usd=0.10)
        assert math.isclose(result, 67.5)

    def test_oct_13_percent_discount(self):
        # $9.00 with OCT discount → $9.00 × 0.87 = $7.83
        result = M.usd_cents_to_currency(900, "OCT", rtd_price_usd=0.10, oct_price_usd=0.50)
        assert math.isclose(result, 7.83 / 0.50)

    def test_bnb_equivalent_framing(self):
        # User stated "USDC is 33% more than RTD". Verify the math:
        rtd_cost = M.usd_cents_to_currency(1000, "RTD", rtd_price_usd=0.10)  # 75 RTD
        # 75 RTD × $0.10 = $7.50; USDC equivalent of same price would be $10.00
        # Premium: ($10.00 - $7.50) / $7.50 = 33.3%
        rtd_usd_value = rtd_cost * 0.10
        usdc_cost = M.usd_cents_to_currency(1000, "USDC", rtd_price_usd=0.10)
        premium = (usdc_cost - rtd_usd_value) / rtd_usd_value
        assert math.isclose(premium, 1 / 3, abs_tol=0.01)  # 33.3%

    def test_negative_cents_rejected(self):
        with pytest.raises(ValueError):
            M.usd_cents_to_currency(-100, "USDC", rtd_price_usd=0.10)

    def test_invalid_rtd_price(self):
        with pytest.raises(ValueError):
            M.usd_cents_to_currency(900, "RTD", rtd_price_usd=0.0)


# ─── plausibility cap derivation ─────────────────────────────────────────


class TestMaxBytesPerRtdPerEpoch:
    def test_default_yields_reasonable_cap(self):
        cap = M.max_bytes_per_rtd_per_epoch()
        # Default: 50 GB/day × 1.5 margin = 75 GiB / 200 RTD = ~0.375 GiB/RTD
        # Convert to bytes: ~402 MiB/RTD
        assert 300 * 1024**2 < cap < 500 * 1024**2, f"cap out of range: {cap}"

    def test_higher_throughput_target_increases_cap(self):
        small = M.max_bytes_per_rtd_per_epoch(
            target_termux_relay_throughput_gb_per_day=10.0,
        )
        large = M.max_bytes_per_rtd_per_epoch(
            target_termux_relay_throughput_gb_per_day=100.0,
        )
        assert large > small

    def test_higher_bond_decreases_per_rtd_cap(self):
        # If we expect more bond per relay, per-RTD cap should drop
        small_bond = M.max_bytes_per_rtd_per_epoch(target_termux_relay_bond_rtd=100.0)
        large_bond = M.max_bytes_per_rtd_per_epoch(target_termux_relay_bond_rtd=1000.0)
        assert small_bond > large_bond

    def test_per_relay_cap_scales_with_bond(self):
        cap_100 = M.per_relay_epoch_cap(100)
        cap_1000 = M.per_relay_epoch_cap(1000)
        assert math.isclose(cap_1000, cap_100 * 10, rel_tol=0.01)
