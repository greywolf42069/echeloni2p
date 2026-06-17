"""
Mathematical primitives for the Echelon reward / emission / fee model.

These functions are PURE (no state, no side effects, no I/O) so they're
trivially testable and reused across the network simulator + the on-chain
program (whose Rust constants come from this module's outputs).

Cross-references:
- saturation_reward: Diaz "Reward Sharing for Mixnets" (2022), Eq. 1
- emission_for_epoch: design-v2 §9.5 (8-year exponential decay)
- distribute_fees: design-v2 §9.3
- burn_rate: design-v2 §9.3 (50% of RTD treasury inflow)
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from . import params as P


# ─── Saturation reward (Nym/Edinburgh formula adapted for Echelon) ───────


def saturation_reward(
    pledge: float,
    delegated: float,
    total_stake: float,
    performance: float = 1.0,
    alpha: float = P.SATURATION_ALPHA,
    beta: float = P.SATURATION_BETA,
) -> float:
    """Compute a node's reward share from a unit reward pool of size 1.

    Adapted from Diaz "Reward Sharing for Mixnets" (Eq. 1) with one
    Echelon-specific modification: a HARD cap on effective stake at the
    saturation point. The original formula gives soft saturation through
    the work-bonus term but otherwise allows reward to grow linearly in
    pledge — that's fine when delegation dominates. Echelon v0.1 is
    bond-only, so a whale with 10× stake would get 10× rewards under the
    pure Nym formula. We add an explicit `min(stake, saturation)` so a
    single node literally cannot exceed its fair share.

    Formula:
        sat = β × total_stake
        eff_pledge    = min(pledge, sat)
        eff_delegated = min(delegated, sat - eff_pledge)    # cumulative cap
        σ = eff_delegated / total_stake
        λ = eff_pledge / total_stake
        work = performance × min(1, (eff_pledge + eff_delegated) / sat)
        share = (σ + λ·α + (σ·λ·α/β)·work) / (1 + α)

    Properties (asserted in tests):
      - Monotonic in (pledge + delegated) up to the saturation point
      - Hard saturation past `β × total_stake`: ANY further stake earns 0
        additional reward
      - performance=0 still pays a baseline (just no work bonus)
      - Pure function: same inputs → same output
    """
    if total_stake <= 0:
        return 0.0
    if performance < 0 or performance > 1:
        raise ValueError(f"performance must be in [0,1], got {performance}")
    saturation = beta * total_stake
    # Hard-cap effective stake at the saturation point.
    eff_pledge = min(pledge, saturation)
    eff_delegated = min(delegated, max(saturation - eff_pledge, 0.0))
    sigma = eff_delegated / total_stake
    lam = eff_pledge / total_stake
    work = performance * min(1.0, (eff_pledge + eff_delegated) / max(saturation, 1e-12))
    work = min(work, 1.0)
    raw = sigma + lam * alpha + (sigma * lam * alpha / beta) * work
    return raw / (1.0 + alpha)


def saturation_point(total_stake: float, n_target_nodes: int, beta: float = P.SATURATION_BETA) -> float:
    """The pledge-equivalent stake at which a single node "fully saturates".

    A network targeting N decentralised nodes wants saturation to kick in
    around `total_stake / N × beta`. Past that point, additional stake to
    one node yields strictly diminishing reward.

    For Echelon: with 100M RTD total supply and a target of 1000 active
    relays, saturation point is ~100K RTD per node. A whale wanting 10× a
    fair share would need 10 nodes to do it, which costs proportionally.
    """
    if n_target_nodes <= 0:
        raise ValueError("n_target_nodes must be positive")
    return (total_stake * beta) / n_target_nodes


# ─── Emission decay (exponential, integrating to EMISSION_POOL_RTD) ──────


def emission_for_epoch(
    epoch: int,
    total_pool: float = P.EMISSION_POOL_RTD,
    window_days: int = P.EMISSION_WINDOW_DAYS,
    decay_factor: float = 4.0,
) -> float:
    """RTD minted in a given epoch from the emission pool.

    Exponential decay so first year emits ~30% of pool, last year ~1%.
    The continuous integral over [0, window_days] equals total_pool.

    e(t) = E_0 × exp(-k × t/window_days)

    where k is chosen so that ∫₀^window e(t)dt = total_pool.

    Closed form: e(0) × (window/k) × (1 - exp(-k)) = total_pool
                 ⇒ e(0) = total_pool × k / (window × (1 - exp(-k)))

    Default decay_factor=4 means the rate drops by ~e^4 ≈ 54× from start
    to end of window — gives ~30% in year 1 (before halving), ~1% in year 8.
    """
    if epoch < 0:
        return 0.0
    if epoch >= window_days:
        return 0.0
    k = decay_factor
    e0 = total_pool * k / (window_days * (1.0 - math.exp(-k)))
    return e0 * math.exp(-k * epoch / window_days)


def cumulative_emission(through_epoch: int, **kwargs) -> float:
    """Total RTD emitted from epoch 0 through `through_epoch` (inclusive)."""
    return sum(emission_for_epoch(i, **kwargs) for i in range(through_epoch + 1))


# ─── Fee distribution per design-v2 §9.3 ─────────────────────────────────


@dataclass
class FeeDistribution:
    """Result of splitting a single fee event."""
    treasury: float
    relays: float
    operators: float          # eepsite hosts / outproxy operators / inference
    creators: float           # template creators
    burned: float = 0.0       # for cover traffic (no burn) and others
    raw_total: float = 0.0    # original fee before splitting

    def total(self) -> float:
        return self.treasury + self.relays + self.operators + self.creators + self.burned


def distribute_fees(
    fee_amount: float,
    fee_kind: str,
) -> FeeDistribution:
    """Split a single fee event according to design-v2 §9.3.

    fee_kind ∈ {
        'bandwidth', 'hosting', 'template_creator', 'template_echelon',
        'eepgen', 'outproxy', 'enterprise', 'cover_traffic',
    }
    """
    if fee_amount < 0:
        raise ValueError("fee_amount cannot be negative")
    if fee_kind == "bandwidth":
        return FeeDistribution(
            treasury=fee_amount * P.BANDWIDTH_FEE_TO_TREASURY,
            relays=fee_amount * P.BANDWIDTH_FEE_TO_RELAYS,
            operators=0, creators=0, raw_total=fee_amount,
        )
    if fee_kind == "hosting":
        return FeeDistribution(
            treasury=fee_amount * P.HOSTING_FEE_TO_TREASURY,
            relays=0,
            operators=fee_amount * P.HOSTING_FEE_TO_HOSTS,
            creators=0, raw_total=fee_amount,
        )
    if fee_kind == "template_creator":
        return FeeDistribution(
            treasury=fee_amount * P.TEMPLATE_CREATOR_TO_TREASURY,
            relays=0, operators=0,
            creators=fee_amount * P.TEMPLATE_CREATOR_TO_CREATOR,
            raw_total=fee_amount,
        )
    if fee_kind == "template_echelon":
        return FeeDistribution(
            treasury=fee_amount * P.TEMPLATE_ECHELON_TO_TREASURY,
            relays=0, operators=0, creators=0, raw_total=fee_amount,
        )
    if fee_kind == "eepgen":
        return FeeDistribution(
            treasury=fee_amount * P.EEPGEN_TO_TREASURY,
            relays=0,
            operators=fee_amount * P.EEPGEN_TO_INFERENCE_OPERATORS,
            creators=0, raw_total=fee_amount,
        )
    if fee_kind == "outproxy":
        return FeeDistribution(
            treasury=fee_amount * P.OUTPROXY_TO_TREASURY,
            relays=0,
            operators=fee_amount * P.OUTPROXY_TO_OPERATORS,
            creators=0, raw_total=fee_amount,
        )
    if fee_kind == "enterprise":
        return FeeDistribution(
            treasury=fee_amount * P.ENTERPRISE_TO_TREASURY,
            relays=0,
            operators=fee_amount * P.ENTERPRISE_TO_OPERATORS,
            creators=0, raw_total=fee_amount,
        )
    if fee_kind == "cover_traffic":
        return FeeDistribution(
            treasury=0,
            relays=fee_amount * P.COVER_TRAFFIC_TO_RELAYS,
            operators=0, creators=0, raw_total=fee_amount,
        )
    raise ValueError(f"unknown fee_kind: {fee_kind!r}")


def burn_rate(rtd_inflow: float) -> tuple[float, float]:
    """Return (kept_for_opex, burned) per design-v2 §9.3.

    50% of every RTD treasury inflow is burned. The other 50% is kept by
    the treasury for opex / grants. (USDC inflow is NOT burned — only RTD.)
    """
    if rtd_inflow < 0:
        raise ValueError("rtd_inflow cannot be negative")
    burned = rtd_inflow * P.TREASURY_RTD_BURN_RATE
    kept = rtd_inflow - burned
    return kept, burned


# ─── Currency conversion ─────────────────────────────────────────────────


def usd_cents_to_currency(
    usd_cents: int,
    currency: str,           # 'RTD' | 'USDC' | 'OCT'
    rtd_price_usd: float,    # current RTD/USD oracle price
    oct_price_usd: float = 1.0,  # placeholder; refined when OCT lights up
) -> float:
    """Convert a USD-cents amount into the target currency using the
    discount table from design-v2 §8.1.

    For RTD/OCT: returns the *number of tokens* equivalent.
    For USDC: returns the *number of USDC tokens* (= cents/100).
    """
    if usd_cents < 0:
        raise ValueError("usd_cents cannot be negative")
    multiplier = {
        "RTD":  P.RTD_DISCOUNT,
        "OCT":  P.OCT_DISCOUNT,
        "USDC": P.USDC_BASELINE,
    }[currency]
    discounted_usd = (usd_cents / 100.0) * multiplier
    if currency == "USDC":
        return discounted_usd
    if currency == "RTD":
        if rtd_price_usd <= 0:
            raise ValueError("rtd_price_usd must be positive")
        return discounted_usd / rtd_price_usd
    if currency == "OCT":
        if oct_price_usd <= 0:
            raise ValueError("oct_price_usd must be positive")
        return discounted_usd / oct_price_usd
    raise ValueError(f"unknown currency: {currency!r}")


# ─── Plausibility-cap derivation (the simulator's main deliverable) ──────


def max_bytes_per_rtd_per_epoch(
    target_termux_relay_throughput_gb_per_day: float = 50.0,
    target_termux_relay_bond_rtd: float = 200.0,
    safety_margin: float = 1.5,
) -> int:
    """Derive the per-relay per-epoch byte cap.

    A relay with bond `B` should be able to claim up to `B × CAP` bytes per
    epoch. We calibrate so a typical Termux mobile relay (heavy day, modest
    bond) fits comfortably inside the cap with safety margin.

    Default: a 200-RTD bonded mobile relay can carry up to 50 GB/day *
    1.5 safety margin = 75 GB/day. CAP = 75 GiB / 200 = 0.375 GiB/RTD.

    The cap exists to bound the impact of a sybil that fakes byte counts:
    an adversary with bond B can claim at most B × CAP bytes/day worth of
    emission, so sybil cost scales linearly with capital.

    Returns: integer bytes per RTD-of-bond per epoch.
    """
    bytes_per_relay = target_termux_relay_throughput_gb_per_day * (1024 ** 3)
    bytes_with_margin = bytes_per_relay * safety_margin
    return int(bytes_with_margin / target_termux_relay_bond_rtd)


def per_relay_epoch_cap(bond_rtd: float) -> int:
    """Convenience: cap (in bytes) for a single relay with the given bond."""
    return int(bond_rtd * max_bytes_per_rtd_per_epoch())
