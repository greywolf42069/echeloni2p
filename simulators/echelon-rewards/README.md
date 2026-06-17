# Echelon Rewards Simulator

Reward + emission + fee + burn simulator for the Echelon meshnet token economy.
The output of this simulator becomes program constants in the on-chain Anchor
relay-claim program. **Source of truth for every economic parameter.**

This is the tool referenced as **D.0.5** in [`ROADMAP.md`](../../ROADMAP.md)
and is the prerequisite for D.3 (Anchor program).

---

## What it computes

1. **Plausibility caps** for the on-chain claim program:
   `MAX_BYTES_PER_RECEIPT`, `MAX_BYTES_PER_RTD_PER_EPOCH`, `SATURATION_POINT_RTD`.
2. **Realistic APR trajectories** at 1K / 10K / 100K subscriber scales.
3. **Sustainability invariant** check: by year 2, do bandwidth fees ≥ operator
   wholesale costs without depending on RTD price appreciation? (design-v2 §10)
4. **Treasury accumulation** from pump.fun creator fees + protocol fees + RTD
   burn (50% of every RTD treasury inflow per design-v2 §9.3).

## What it doesn't model (yet)

- Adaptive bonding behavior: in reality, high APR attracts more bonders, which
  dilutes APR back toward equilibrium. The current sim takes `initial_total_bonded_rtd`
  as a static input. This is the single biggest gap; see open work below.
- Slashing events: the sim runs honest nodes only.
- Real RTD market price movement (treats `rtd_price_usd` as constant per scenario).
- Coconut credentials / anonymous payment: post-v2 work.

## Math foundations

The reward saturation function is adapted from [Diaz "Reward Sharing for
Mixnets"](https://www.research.ed.ac.uk/en/publications/reward-sharing-for-mixnets)
(Univ. Edinburgh, 2022) with one Echelon-specific modification: a **hard cap on
effective stake at the saturation point** rather than just soft saturation on
the work-bonus term. Echelon v0.1 is bond-only (no delegation), so the original
soft saturation would let a whale with 10× stake earn 10× rewards. We add an
explicit `min(stake, saturation)` clip. Documented in `model.py` docstring.

Reference Python implementation we did **not** copy:
[`nymtech/rewardsharing-simulator`](https://github.com/nymtech/rewardsharing-simulator)
(Apache-2.0 by Claudia Diaz). We re-implement the same mathematical model from
the published paper rather than fork their code so we have a clean license
boundary and can extend freely.

## Repository layout

```
simulators/echelon-rewards/
├── pyproject.toml
├── README.md                     ← this file
├── echelon_rewards/
│   ├── __init__.py               ← public API
│   ├── params.py                 ← every parameter, sourced + commented
│   ├── model.py                  ← pure math primitives
│   ├── agents.py                 ← Node class + initial population
│   ├── network.py                ← time-evolution simulator
│   └── scenarios.py              ← runner + scenario library
├── tests/
│   ├── test_model.py             ← saturation / emission / fees / burn
│   ├── test_agents.py            ← Node behavior + uptime distributions
│   └── test_network.py           ← integration / determinism / invariants
└── outputs/                      ← gitignored; sim outputs land here
    ├── constants.json            ← the program-constant values
    ├── summary.json
    ├── report_baseline_*.json    ← per-scenario summaries
    └── timeseries_baseline_*.csv ← per-epoch full state history
```

## How to run

```bash
# From repo root:
cd simulators/echelon-rewards
pip install -e .
pytest                            # runs the test suite (80 tests)
python -m echelon_rewards.scenarios   # runs all scenarios, writes outputs/
```

## Design assumptions baked in (locked from `docs/economy/design-v2.md`)

| Constant | Value | Source |
|---|---|---|
| `TOTAL_SUPPLY_RTD` | 100,000,000 | design-v2 §9.5 |
| `LAUNCH_SUPPLY_RTD` (pump.fun fair launch) | 60,000,000 | design-v2 §9.1 |
| `EMISSION_POOL_RTD` | 40,000,000 | design-v2 §9.5 |
| `EMISSION_WINDOW_DAYS` | 2,920 (8 yr) | design-v2 §9.5 |
| `WHOLESALE_BANDWIDTH_¢/GB` | 8 | Bell Labs / Mysterium 2022 (12 ¢/GB anchor scaled to mobile cost basis) |
| `RETAIL_BANDWIDTH_¢/GB` | 16 | design-v2 §6.2 (100% margin) |
| `RTD_DISCOUNT` | 0.75 (= 25% off USDC) | design-v2 §8.1 |
| `OCT_DISCOUNT` | 0.87 (= 13% off USDC) | design-v2 §8.1 |
| `BANDWIDTH_FEE_TO_TREASURY` | 0.05 | design-v2 §9.3 |
| `HOSTING_FEE_TO_TREASURY` | 0.30 | design-v2 §9.3 |
| `TREASURY_RTD_BURN_RATE` | 0.50 | design-v2 §9.3 |
| `SATURATION_ALPHA` | 0.30 | Diaz paper / Nym config |
| `SATURATION_BETA` | 1.00 | Diaz paper / Nym config |
| `SLASHER_REWARD_FRACTION` | 0.01 | design-v2 §12 Q4 |
| `MIN_BOND_RTD` | 100 | design-v2 §7 |

## Scenario knobs (per-scenario inputs)

These vary between simulation runs — they're inputs, not constants:

- `n_relays`, `n_subscribers`, `n_epochs`
- `initial_total_bonded_rtd` (bond pool size; key sensitivity)
- `rtd_price_usd` (oracle price, treated as constant per scenario)
- `pumpfun_daily_volume_usd` (treasury creator-fee income assumption)
- `seed` (numpy RNG seed; runs are deterministic)

## Reproducibility

All scenarios use `seed=42` by default. Re-running with the same seed produces
byte-identical timeseries CSVs. This is asserted in `tests/test_network.py`.

The constants file (`outputs/constants.json`) is checked into the repo at
release time and consumed by the Rust Anchor crate to generate `consts.rs`
from JSON — single source of truth.

## Findings from initial runs (2026-05-28)

Run with default parameters produced these high-level findings:

1. **Year-1 APR is much higher than design-v2 §9.6's "24% target"** at realistic
   early-stage bond fractions. With 1.5M RTD bonded against ~$26K/day in fee
   revenue plus 33K RTD/day average year-1 emission, year-1 APR sits in the
   500–2000% range depending on subscriber count.
   - **Implication**: design-v2 §9.6's "24% year-1 target" was unrealistic.
     The honest answer is that early-stage DePIN APR is high (Helium hit >100%
     in early days), naturally compressing as bond pools grow. Either revise
     the target or design an emission curve that's flatter early.
2. **Sustainability invariant is achievable** at all three scales tested:
   bandwidth fees alone exceed wholesale operator costs by 25–50× at 10K+
   subscribers. The "fees ≥ operator costs by year 2" target is comfortably met.
3. **Pump.fun creator fee is meaningful**: at $250K/day RTD trade volume,
   creator fee is ~$2,375/day USD-equivalent → ~9 RTD/day in treasury (post-burn).
   Modest but real.

## Open work

- **Sensitivity analysis on bond fraction**: how does APR change as
  `initial_total_bonded_rtd` varies from 1% to 50% of supply? Currently encoded
  in `tests/test_network.py::test_apr_falls_over_time` but should have its own
  scenario script.
- **Adaptive bonding model**: stub in `agents.py` for `should_increase_bond(apr)`.
  Today the bond pool is static throughout the run.
- **Real i2pd transit-tunnel data**: the Termux uptime profile (μ=70%, σ=15%) is
  a guess. Needs telemetry from real Echelon nodes once we have them.
- **Slashing simulation**: model X% of nodes attempting to fabricate receipts;
  measure slash-burn rate vs honest-node earnings.
- **Sweep `decay_factor`** in `emission_for_epoch`: see how a flatter (k=2) vs.
  steeper (k=6) decay curve affects year-1 APR.

## License

Code: Apache-2.0 (matching Nym's license for the math model we adapted).
The simulator's outputs (constants.json) are released into the public domain.
