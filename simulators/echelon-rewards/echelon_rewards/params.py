"""
Echelon simulator parameters.

EVERY parameter has a comment explaining (a) what it represents and (b) its
provenance: which design-v2 section locks it, or what real-world anchor (Bell
Labs, Helium, Nym) it derives from. No magic constants.

Conventions:
- All token amounts are in *whole RTD* (not lamports / micro-units).
  Conversion to on-chain micro-units happens at the program boundary.
- All time spans are in *epochs*. 1 epoch = 1 day per design-v2 §5.1.
- All bandwidth amounts are in *bytes* unless suffixed.
- All USD amounts are in *cents* (integer) to avoid float drift.

Random seeds: every stochastic value uses `numpy.random.Generator`. Seed
defaults to `42` in scenarios to make runs reproducible.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# ─── tokenomics v1.0 anchors ─────────────────────────────────────────────────
# DEX: PumpSwap (custom SPL token → pool created directly, no pump.fun bonding
# curve). This preserves controlled emission and custom supply cap.

# Total supply cap. tokenomics.md §1
TOTAL_SUPPLY_RTD: int = 100_000_000

# Allocation breakdown (sums to TOTAL_SUPPLY_RTD). tokenomics.md §1
PUMPSWAP_LP_RTD:             int = 1_000_000    # initial PumpSwap pool (6-month LP lock)
EMISSION_POOL_RTD:           int = 50_000_000   # relay rewards, 8-year decay curve
PROSPECTIVE_AIRDROP_RTD:     int = 3_000_000    # Seeker Genesis Token holders (claim via app)
RETROACTIVE_AIRDROP_RTD:     int = 7_000_000    # v0.1 power users (usage-weighted, claim v0.2)
FOUNDATION_OPS_RTD:          int = 5_000_000    # 12mo cliff + 24mo vest, multisig
CROSS_CHAIN_RESERVE_RTD:     int = 5_000_000    # future OCTRA / own-chain (multisig, no vest)
LIQUIDITY_RESERVE_RTD:       int = 29_000_000   # protocol-owned liquidity (governance-gated)

# Prospective airdrop mechanics — tokenomics.md §2.1
PROSPECTIVE_AIRDROP_INSTANT_FRACTION: float = 0.50   # 50% unlocked immediately on claim
PROSPECTIVE_AIRDROP_VEST_DAYS:        int = 90        # remaining 50% vests linearly over 90 days
PROSPECTIVE_AIRDROP_CLAIM_WINDOW_DAYS: int = 90       # unclaimed after 90 days → retroactive pool

# Emission window — 8 years. design-v2 §9.5
EMISSION_WINDOW_DAYS: int = 8 * 365

# Empirical bandwidth wholesale anchor: 12¢/GB (Bell Labs / Mysterium 2022).
# design-v2 §6.2 / §2.5. We pay relays 8¢/GB and charge 16¢/GB retail.
WHOLESALE_BANDWIDTH_USD_CENTS_PER_GB: int = 8
RETAIL_BANDWIDTH_USD_CENTS_PER_GB: int = 16

# Currency multipliers — design-v2 §8.1
RTD_DISCOUNT: float = 0.75   # RTD payment = 0.75× USDC equivalent
OCT_DISCOUNT: float = 0.87   # OCT payment = 0.87× USDC equivalent
USDC_BASELINE: float = 1.00

# Saturation parameters — Diaz "Reward Sharing for Mixnets"
SATURATION_ALPHA: float = 0.30   # Sybil-protection premium for larger pledge
SATURATION_BETA: float = 1.00    # Stake fraction needed to fully saturate

# Fee splits — design-v2 §9.3
BANDWIDTH_FEE_TO_TREASURY: float = 0.05         # 5% to treasury
BANDWIDTH_FEE_TO_RELAYS: float = 0.95           # 95% to relay emission pool
HOSTING_FEE_TO_TREASURY: float = 0.30
HOSTING_FEE_TO_HOSTS: float = 0.70
TEMPLATE_CREATOR_TO_TREASURY: float = 0.30
TEMPLATE_CREATOR_TO_CREATOR: float = 0.70
TEMPLATE_ECHELON_TO_TREASURY: float = 1.00      # Echelon-authored: 100% to treasury
EEPGEN_TO_TREASURY: float = 0.50                # Inference revenue split
EEPGEN_TO_INFERENCE_OPERATORS: float = 0.50
OUTPROXY_TO_TREASURY: float = 0.30
OUTPROXY_TO_OPERATORS: float = 0.70
ENTERPRISE_TO_TREASURY: float = 0.30
ENTERPRISE_TO_OPERATORS: float = 0.70
COVER_TRAFFIC_TO_RELAYS: float = 1.00           # 100% to relays — privacy infra

# RTD burn on treasury inflow — design-v2 §9.3
TREASURY_RTD_BURN_RATE: float = 0.50

# PumpSwap LP fee. PumpSwap charges 0.25% per swap: 0.20% to LPs, 0.05% to protocol.
# The LP-side fee (0.20%) accrues to our LP position; protocol fee goes to pump.fun.
PUMPSWAP_LP_FEE_TO_LP: float = 0.0020       # 0.20% — what our LP position earns
PUMPSWAP_PROTOCOL_FEE: float = 0.0005       # 0.05% — goes to pump.fun treasury (not ours)

# Slasher reward — answered in v2 §12 Q4
SLASHER_REWARD_FRACTION: float = 0.01  # 1% of slashed bond to slasher
                                       # 99% burned

# Bond tier thresholds — tokenomics.md §4 (relay operator tiers).
# Tier determines the emission multiplier and routing priority.
MIN_BOND_RTD: int = 100           # Tier 1 (base relay, 1.0× multiplier)
TIER2_BOND_RTD: int = 1_000      # Tier 2 (enhanced relay, 1.25× multiplier)
TIER3_BOND_RTD: int = 10_000     # Tier 3 (anchor relay, 1.5× multiplier)

BOND_TIER_MULTIPLIERS = {1: 1.00, 2: 1.25, 3: 1.50}

# Emission decay half-life — 3 years. tokenomics.md §3.
# λ = ln(2) / half_life_days; daily_emission(t) = E₀ × e^(−λt)
# E₀ is calibrated so ∫₀^EMISSION_WINDOW_DAYS E₀ × e^(−λt) dt = EMISSION_POOL_RTD.
EMISSION_HALF_LIFE_DAYS: int = 3 * 365   # 1095 days

# Protocol-owned liquidity (POL) buyback trigger. tokenomics.md §6.2.
# Treasury deploys buybacks when RTD trades below this fraction of its
# 90-day TWAP. Deployment capped at 1% of LIQUIDITY_RESERVE_RTD per epoch.
POL_BUYBACK_TRIGGER_FRACTION: float = 0.80   # trigger at 20% drawdown from 90d TWAP
POL_BUYBACK_EPOCH_CAP_FRACTION: float = 0.01  # max 1% of reserve deployed per day

# Plausibility caps — initial guesses, REFINED by sim output. design-v2 §5.3
INITIAL_MAX_BYTES_PER_RECEIPT: int = 1 * 1024 ** 3   # 1 GiB hard ceiling per receipt

# Cross-check threshold (slash if >5% discrepancy). design-v2 §5.3
CROSS_CHECK_DISCREPANCY_THRESHOLD: float = 0.05


# ─── Real-world calibration data (sourced, cited) ────────────────────────

# Target APR corridor per design-v2.1 §9.6 (aggressive-choke setting).
# Governance adjusts emission rate to hold APR inside the corridor.
# These are TARGETS, not guarantees; actual APR depends on bond pool size.
TARGET_APR_YEAR_1_MIN: float = 0.50    # 50%  — bootstrap phase lower bound
TARGET_APR_YEAR_1_MAX: float = 2.00    # 200% — bootstrap phase upper bound
TARGET_APR_YEAR_3_MIN: float = 0.15    # 15%
TARGET_APR_YEAR_3_MAX: float = 0.40    # 40%
TARGET_APR_MATURE_MIN: float = 0.05    # 5%   — long-run floor (fees dominant)
TARGET_APR_MATURE_MAX: float = 0.15    # 15%  — long-run ceiling

# Termux / mobile node uptime profile. Industry typical for "always-on but
# OS-killable phone background services" is 60-80% uptime. We use 70% mean
# with σ=15% as a starting estimate. To be revised when real telemetry lands.
TERMUX_UPTIME_MEAN: float = 0.70
TERMUX_UPTIME_STDDEV: float = 0.15

# Server / dedicated-node uptime profile (residential VPS, datacenter).
# Typical 95-99%. Use 97% mean, σ=2%.
SERVER_UPTIME_MEAN: float = 0.97
SERVER_UPTIME_STDDEV: float = 0.02

# Subscription tier mix. Reasonable starting estimate: most users on Plus,
# fewer on Privacy, very few on Operator. To be calibrated against real
# conversion data once we have any.
TIER_MIX = {
    "free":     0.55,   # 55% on the free wedge (no revenue, but they're users)
    "plus":     0.30,
    "privacy":  0.12,
    "operator": 0.025,
    "enterprise": 0.005,
}

# Currency-of-payment mix at launch. We assume RTD-aware DePIN early adopters
# go for the discount; casual users default to USDC.
CURRENCY_MIX = {
    "RTD":  0.55,   # discount-takers
    "USDC": 0.40,   # casuals
    "OCT":  0.05,   # privacy-aligned (light at launch since OCT integration is post-launch)
}


# ─── The tier price table (USD-cent baseline; multiplier applied per currency) ──

# design-v2 §4 derivation. Numbers in USD cents.
TIER_PRICE_USD_CENTS_PER_MONTH = {
    "free":         0,
    "plus":         900,    # $9
    "privacy":      2900,   # $29
    "operator":     9900,   # $99
    "enterprise":   500_00, # $500/mo (low end of enterprise band)
}


# ─── Configurable parameters (per-scenario overridable) ──────────────────


@dataclass
class Params:
    """All knobs that vary between scenarios.

    Anything in this dataclass IS a scenario input. Anything imported as a
    module constant above is design-v2-locked and not scenario-tunable.
    """

    # Network size
    n_relays: int = 1000              # Number of bonded relay nodes
    n_subscribers: int = 10_000       # Total subscriber count (any tier)

    # Time
    n_epochs: int = 365               # Default 1-year run

    # Stake distribution at start
    fraction_initial_relays_with_min_bond: float = 0.70   # 70% of relays start at MIN_BOND
    fraction_relays_termux_mobile: float = 0.65           # 65% mobile, 35% server

    # Total RTD bonded across all relays at sim start
    initial_total_bonded_rtd: int = 1_000_000   # 1M RTD = 1% of supply at start

    # Token price assumption (USD per RTD, for fee→USDC conversions). To
    # explore sensitivity: a single sim is at ONE price; sweep across prices
    # for sensitivity analysis.
    rtd_price_usd: float = 0.10       # $0.10 / RTD as a starting assumption

    # Daily bandwidth demand per subscriber tier (in GB/day average)
    daily_bandwidth_gb_per_subscriber: dict = field(default_factory=lambda: {
        "free":       0.03,    # 1 GB/mo / 30 days
        "plus":       1.7,     # 50 GB/mo / 30 days
        "privacy":    6.7,     # 200 GB/mo
        "operator":   33.3,    # 1 TB/mo
        "enterprise": 333,     # 10 TB/mo
    })

    # PumpSwap volume (USD/day) — for LP fee revenue projection.
    # Conservative assumption at $50K/day (thin market, post-launch).
    pumpswap_daily_volume_usd: float = 50_000

    # Random seed
    seed: int = 42

    # ─── Output knobs ─────────────────────────────────────────────────────

    # Whether to record per-epoch full snapshots (memory-heavy at 100K+ relays)
    record_full_history: bool = True


# ─── EpochResult dataclass — the output shape per epoch ──────────────────


@dataclass
class EpochResult:
    """Snapshot of network state at the end of an epoch."""
    epoch: int
    total_bonded_rtd: float
    total_emission_this_epoch: float
    total_fees_this_epoch_usd: float
    total_burned_rtd_this_epoch: float
    treasury_balance_rtd: float
    treasury_balance_usd: float
    operator_earnings_total_rtd: float
    operator_earnings_total_usd: float
    avg_apr_annualized: float
    sustainability_invariant: bool   # year-2+: fees ≥ operator costs
    n_active_relays: int
