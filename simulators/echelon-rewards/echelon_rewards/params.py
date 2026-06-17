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


# ─── design-v2 anchors (do not modify without updating design-v2.md) ──────

# Total supply cap. design-v2 §9.5
TOTAL_SUPPLY_RTD: int = 100_000_000

# Pump.fun fair-launch share. design-v2 §9.1+§9.5
LAUNCH_SUPPLY_RTD: int = 60_000_000

# Reserved for relay-emission contract. design-v2 §9.5
EMISSION_POOL_RTD: int = TOTAL_SUPPLY_RTD - LAUNCH_SUPPLY_RTD  # 40M

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

# Pump.fun creator fee. design-v2 §9.2 / §9.3
PUMPFUN_CREATOR_FEE: float = 0.0095   # 0.95% of every RTD trade post-graduation

# Slasher reward — answered in v2 §12 Q4
SLASHER_REWARD_FRACTION: float = 0.01  # 1% of slashed bond to slasher
                                       # 99% burned

# Bond minimum — design-v2 §7
MIN_BOND_RTD: int = 100

# Plausibility caps — initial guesses, REFINED by sim output. design-v2 §5.3
INITIAL_MAX_BYTES_PER_RECEIPT: int = 1 * 1024 ** 3   # 1 GiB hard ceiling per receipt

# Cross-check threshold (slash if >5% discrepancy). design-v2 §5.3
CROSS_CHECK_DISCREPANCY_THRESHOLD: float = 0.05


# ─── Real-world calibration data (sourced, cited) ────────────────────────

# Helium / Nym typical APR for DePIN with mature emission.
# design-v2 §9.6 — target trajectory.
TARGET_YEAR_1_APR: float = 0.24    # 24%
TARGET_YEAR_4_APR: float = 0.07    # 7%
TARGET_YEAR_8_APR: float = 0.015   # 1.5%

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

    # Pump.fun trade volume (USD/day) — assumption for treasury creator-fee
    # income. Reasonable early-stage assumption: $250K/day at modest volume.
    pumpfun_daily_volume_usd: float = 250_000

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
