# Echelon — RTD Token Economics (Formal Specification)

> **Status: v1.0 — locked 2026-06-19.**
> This is the machine-readable complement to `design-v2.md`. Where
> `design-v2.md` explains *why*, this document specifies *exactly what*:
> formulas, constants, flows, and invariants. All constants reference
> `simulators/echelon-rewards/echelon_rewards/params.py` as the
> single source of truth.

---

## 1. Supply Schedule

| Allocation | RTD | Lock | Governed by |
|---|---|---|---|
| Raydium CLMM LP | 1,000,000 | 6-month Streamflow LP lock | Foundation multisig after unlock |
| Emission pool (relay rewards) | 50,000,000 | PDA escrow, 8-year decay | `relay-claim` program |
| Retroactive airdrop (v0.1 users) | 10,000,000 | Vests at v0.2 launch day | `echelon-airdrop` program |
| Foundation operations | 5,000,000 | 12-month cliff + 24-month linear vest | 3-of-5 multisig |
| Cross-chain reserve | 5,000,000 | Multisig custody, no vest | 3-of-5 multisig |
| Protocol-owned liquidity reserve | 29,000,000 | Governance-gated deployment | Token-holder governance |
| **Total cap** | **100,000,000** | — | Hard-coded in SPL mint |

**Zero team pre-allocation. Zero VC allocation.** All 100M RTD minted
atomically at deploy time into the PDAs above. Mint authority is then
transferred irrevocably to the `relay-claim` PDA. No human key can mint
again.

**Decimals**: 6 (consistent with USDC on Solana).

---

## 2. Emission Curve

### 2.1 Formula

```
daily_emission(t) = E₀ × e^(−λ × t)

where:
  t              = days since emission genesis (v0.2 launch date)
  λ              = ln(2) / EMISSION_HALF_LIFE_DAYS
               = ln(2) / 1095 ≈ 0.000633 / day
  E₀             = EMISSION_POOL_RTD × λ / (1 − e^(−λ × EMISSION_WINDOW_DAYS))
               ≈ 37,530 RTD / day at genesis
  EMISSION_WINDOW_DAYS = 2,920 (8 years)
```

**Half-life: 3 years.** Emission halves every 3 years. 50% of the
emission pool distributes in the first 3 years; 75% in 6 years; 95%+ by
year 8. Tail emission continues at a declining rate through day 2,920,
after which the PDA stops minting.

### 2.2 Daily emission schedule (representative epochs)

| Day | Year | Daily emission (RTD) | Cumulative % of pool |
|---|---|---|---|
| 1 | 0 | ~37,530 | 0.08% |
| 365 | 1 | ~29,760 | 20% |
| 730 | 2 | ~23,600 | 36% |
| 1,095 | 3 | ~18,710 | 50% |
| 1,460 | 4 | ~14,840 | 62% |
| 2,190 | 6 | ~9,330 | 80% |
| 2,920 | 8 | ~5,870 | ~100% |

### 2.3 Governance choke lever

The governance-controlled `emission_rate_bps` parameter (basis points,
default 10000 = 100%) scales `daily_emission(t)` linearly:

```
actual_emission(t) = daily_emission(t) × emission_rate_bps / 10_000
```

Governance constraints (encoded in `relay-claim` program):
- Emission rate can be **decreased** by governance by up to 20% per
  proposal, no cooldown.
- Emission rate can be **increased** by at most 5% per proposal, with a
  90-day cooldown between increases.
- Hard floor: `emission_rate_bps ≥ 1000` (10% minimum — prevents
  governance attack that starves all relay rewards).
- Hard ceiling: `emission_rate_bps ≤ 15000` (150% — prevents runaway
  inflation via governance).
- Any change executes after a 48-hour on-chain timelock.

---

## 3. Relay Operator Economics (the primary demand driver)

### 3.1 Bond tiers

Running a relay requires bonding RTD. Bond is locked while the relay
is active; slashing burns a portion (§5).

| Tier | Min bond (RTD) | Emission multiplier | Routing priority | Governance eligibility |
|---|---|---|---|---|
| Tier 1 — Base | 100 | 1.00× | Standard | Vote only |
| Tier 2 — Enhanced | 1,000 | 1.25× | Priority pool | Vote + comment |
| Tier 3 — Anchor | 10,000 | 1.50× | Guaranteed allocation | Vote + propose |

Tier is determined at epoch close by the relay's **effective bonded
balance** (bond minus any pending slash). A relay can bond more RTD to
upgrade to a higher tier at any time.

### 3.2 Reward formula

Each epoch (day), the relay-claim program computes each relay's reward:

```
raw_weight(node) = saturation(bond, total_bonded) × uptime_factor × tier_multiplier

saturation(bond, total_bonded):
    sat_point = total_bonded / n_active_relays   # fair per-node share
    eff_bond  = min(bond, sat_point × β)         # hard cap at β × fair share
    return eff_bond / total_bonded               # fraction of total pool

uptime_factor:
    30-day rolling average of measured liveness pings
    new nodes: starts at 0.5, linearly climbs to 1.0 over 14 days

tier_multiplier: see §3.1

node_emission_share = raw_weight(node) / sum(raw_weight, all_nodes)
node_daily_emission = actual_emission(t) × node_emission_share
```

In addition to emission, relay operators receive **fee revenue**:
- 95% of all bandwidth subscription fees flow to the relay-emission
  PDA, distributed pro-rata by the same `node_emission_share` weight
  each epoch.

### 3.3 Auto-compounding option

Relay operators can elect `auto_compound = true` on their bond account.
When set, epoch rewards are automatically added to their bond balance
rather than transferred to their wallet. This:
- Reduces circulating supply (rewards stay locked)
- Increases the operator's tier-weight for the next epoch
- Does NOT extend slash exposure (compounded rewards are bonded at the
  same risk level as the original bond)

### 3.4 Operator APR projection

At various bond-pool-as-%-of-supply levels (using `emission_rate_bps =
10000`, aggressive-choke setting):

| Bond pool (% of 100M supply) | Year 1 APR (approx) |
|---|---|
| 0.5% (500K RTD) | ~2,100% |
| 1% (1M RTD) | ~1,050% |
| 5% (5M RTD) | ~210% |
| 10% (10M RTD) | ~105% |
| 30% (30M RTD) | ~35% |
| 50% (50M RTD, mature) | ~21% |

APR declines as more operators join — this is the sybil-resistance
mechanism working correctly. Early operators earn extraordinary APR
for taking the bootstrap risk; late entrants settle into competitive
equilibrium.

---

## 4. Subscriber Token Utility

RTD holders who are not relay operators can still extract protocol
value through the payment-lane discount and governance staking.

### 4.1 Payment-lane discount

```
service_cost_in_RTD = base_USDC_price × RTD_DISCOUNT × (1 / oracle_RTD_price_USD)

RTD_DISCOUNT = 0.75   # 25% off USDC baseline
```

The oracle price is the **5-minute TWAP from Pyth Network's RTD/USD
feed**. If the Pyth feed is stale (>60 seconds since last update), the
client falls back to Raydium CLMM's on-chain TWAP (60-minute window).

**Manipulation resistance**: a 5-minute TWAP costs significantly more
to manipulate than a spot price. An attacker who briefly crashes RTD
price to get cheap service cannot maintain the manipulation for 5
minutes without enormous capital outlay.

**Minimum service cost floor**: service cost in RTD cannot translate to
less than 30 cents on the dollar (i.e., a maximum effective discount of
70%). This prevents fee-starvation if RTD trades at an extreme premium
relative to oracle price.

### 4.2 Governance staking (velocity sink)

RTD holders can stake (lock) RTD to earn governance weight and
enhanced discounts. Lock-up is enforced on-chain; tokens cannot be
transferred while locked.

| Lock duration | Governance weight | Payment discount | Proposal eligibility |
|---|---|---|---|
| No lock (liquid) | 1× | 25% off (base RTD rate) | Vote only (if holding ≥ 100 RTD) |
| 30-day lock | 1× | 25% off | Vote only |
| 90-day lock | 1.5× | 27.5% off | Vote only |
| 180-day lock | 2× | 32.5% off | Vote + comment |
| 365-day lock | 3× | 40% off | Vote + propose |

The enhanced discounts for 180/365-day lockups are the primary
velocity sink for non-operator RTD holders. A user who commits to a
1-year lock gets meaningful additional discount that justifies holding
rather than immediately selling post-purchase.

**Early unlock penalty**: breaking a lock before expiry burns 25% of
the locked balance (to the protocol's burn address, not to treasury).
The remaining 75% is returned to the wallet. This makes lock-breaking
costly enough that it only happens for genuine emergencies.

---

## 5. Slashing

All slash proceeds burn on-chain. 1% of the slashed amount goes to
the permissionless slasher as a detection bounty; 99% is permanently
burned. See `design-v2.md §12`.

| Slash trigger | Bond consequence |
|---|---|
| Two conflicting receipts (same epoch, pair, different byte_count) | 100% of bond: 1% to slasher, 99% burned |
| Cross-check failure (>5% discrepancy vs. i2pd logs) | 10% of bond: 1% to slasher, 9% burned |
| Three cross-check failures in 30 days | 50% of bond: 1% to slasher, 49% burned |
| Early governance lock exit | 25% of locked amount burned (no slasher reward) |

---

## 6. Deflationary Mechanics

### 6.1 Protocol fee burns

Every RTD payment into the treasury triggers an automatic 50% burn:

```
on_rtd_treasury_receipt(amount):
    burn(amount × 0.50)          # permanently remove from supply
    treasury_balance += amount × 0.50
```

USDC payments do not trigger RTD burns directly, but the USDC flows
into the treasury which periodically converts it to RTD for buybacks
(§6.2) and to pay relay rewards denominated in RTD.

### 6.2 Protocol-owned liquidity (POL) buyback

The 29M RTD **liquidity reserve** is deployed by governance in three
tranches:

**Tranche A — LP deepening (10M RTD)**
Deployed at Raydium CLMM after the initial 6-month LP timelock
expires. Foundation adds to the existing LP position, permanently
widening the price range and reducing slippage for retail users.
Deepening is irreversible (LP position is retained indefinitely, no
withdrawal governance path).

**Tranche B — Price stabilization buyback (10M RTD)**
Deployed automatically (no governance vote required per deployment)
when RTD trades below 80% of its 90-day TWAP, subject to:
- Maximum deployment: 1% of tranche balance per epoch (day)
- Minimum interval between deployments: 1 epoch
- Buybacks are converted to LP positions, NOT sold back — RTD bought
  is added to protocol-owned LP, reducing circulating supply permanently

**Tranche C — Ecosystem grants (9M RTD)**
Governance-gated via standard proposal flow (§7). Use cases:
auditors, ecosystem developers, cross-chain integrations, marketing.
Each grant requires a public on-chain proposal, 72h voting period,
48h timelock. Unused tranche C is never released to any individual —
it either gets granted or sits in the PDA indefinitely.

### 6.3 Burn-to-emission ratio (sustainability invariant)

The protocol targets a long-run steady state where:

```
annual_burn ≥ annual_emission × 0.80
```

At this ratio, net circulating supply grows by at most 0.20× emission
per year, decelerating toward net-deflationary as fees scale. The
economic simulator (`simulators/echelon-rewards/`) confirms this ratio
is achievable by year 3 of v0.2 at 10,000 subscribers.

---

## 7. Governance

Governance controls the emission rate, treasury deployments, and
program upgrade authority. RTD held in the governance-staking program
(§4.2) confers voting weight.

### 7.1 Voting weight

```
voting_weight(wallet) =
    bonded_relay_rtd(wallet)          × bond_governance_multiplier(tier)
    + staked_rtd_90d(wallet)           × 1.5
    + staked_rtd_180d(wallet)          × 2.0
    + staked_rtd_365d(wallet)          × 3.0
    + liquid_rtd_held(wallet)          × 1.0   (≥100 RTD to participate)

bond_governance_multiplier:
    Tier 1 → 1.0×, Tier 2 → 1.25×, Tier 3 → 1.5×
```

### 7.2 Proposal lifecycle

```
1. Propose   → Proposer must have ≥10,000 RTD in voting weight
2. Discussion → 72-hour on-chain comment period (anyone can comment)
3. Vote       → 48-hour voting window
4. Quorum     → ≥1% of TOTAL CIRCULATING supply must vote (abstain counts)
5. Threshold  → Simple majority (>50%) to pass
6. Timelock   → 48-hour execution delay after pass
7. Veto       → During timelock: if ≥10% of circulating supply signals
                veto, proposal is blocked for 7 days; can be re-submitted
                with modifications
8. Execute    → Permissionless trigger after timelock expires
```

### 7.3 What governance can change

| Action | Governance path | Quorum |
|---|---|---|
| Adjust `emission_rate_bps` | Standard proposal | 1% |
| Deploy Tranche C ecosystem grants | Standard proposal | 2% |
| Upgrade relay-claim program | Standard proposal + 7-day timelock | 3% |
| Add qualifying genesis token mint (§9.1.5) | Standard proposal | 2% |
| Pause emission (emergency) | Foundation multisig only (3-of-5) | N/A — emergency |
| Resume paused emission | Standard proposal | 1% |

### 7.4 What governance CANNOT change

- Total supply cap (100M RTD, hard-coded in SPL mint — no authority can change)
- Airdrop weights for existing `SubscriptionPDA` entries (immutable on-chain)
- Slash burn mechanics (99/1 split is immutable in `slash_relay` instruction)
- Bond timelock rules (operators cannot governance-away their own slashing risk)

---

## 8. Fee Flow Summary

```
                        ┌───────────────────────────────────┐
                        │         CLIENT PAYS               │
                        │  RTD / USDC / wOCT for service    │
                        └────────────┬──────────────────────┘
                                     │
                     ┌───────────────┼──────────────────────┐
                     │               │                      │
              pays in RTD     pays in USDC           pays in wOCT
                     │               │                      │
                     ▼               ▼                      ▼
             50% burned to    Treasury PDA         Treasury PDA
             null address     (held as USDC)      (converted to USDC)
             50% to treasury
                     │
        ─────────────┴───────────────────────────────────────────
        │                    TREASURY PDA                       │
        │                                                       │
        │   Service fees flow outward per design-v2 §9.3:      │
        │                                                       │
        │  Bandwidth:  5% treasury, 95% → relay emission PDA   │
        │  Hosting:   30% treasury, 70% → host operators       │
        │  EepGen:    50% treasury, 50% → inference operators  │
        │  Templates: 30% treasury, 70% → creators             │
        │  Outproxy:  30% treasury, 70% → outproxy operators   │
        │  Cover:      0% treasury, 100% → relay emission PDA  │
        └───────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
       Treasury opex           Raydium CLMM
     (pays servers,          POL buyback when
      audits, legal)         RTD < 80% of TWAP
```

---

## 9. Value Accrual Flywheel

```
More users subscribe
        │
        ▼
More USDC/RTD fees flow through protocol
        │
        ▼
More RTD burned (50% of RTD inflow) + more POL buybacks
        │
        ▼
Circulating RTD supply decreases
        │
        ▼
RTD price pressure (supply decrease × demand hold)
        │
        ▼
Higher RTD value → relay bond denominated in USD terms grows
        │
        ▼
More operators join → better relay network → better privacy product
        │
        ▼
More users trust the network, subscribe → (loop)
```

The critical feature of this flywheel: **it does not require RTD
price appreciation to sustain itself**. Relay operators earn real
service fees in RTD (and USDC) from subscription revenue, not just
emission. By year 2, the simulator projects service fee income
exceeding emission income — at that point, the flywheel is
self-sustaining without any emission at all.

---

## 10. Anti-Sybil Properties

Sybil attacks in DePIN mean creating many fake nodes to capture
disproportionate emission.

**Saturation cap**: Echelon uses the Diaz/Nym mixnet reward-sharing
formula with a hard saturation point. No single relay can earn more
than `total_bonded / n_active_relays × β` worth of weight regardless
of how much they bond. Beyond saturation, additional bond earns zero
additional emission. Sybil cost scales linearly with bond: to capture
N times the reward, an attacker must bond N times the RTD.

**Uptime ramp**: new relays earn only 50% weight for the first 14
days. A sybil attacker cycling new nodes to avoid cross-checks
sacrifices 50% of their potential earnings during ramp-up.

**Cross-check sampling**: 1% of receipts are cross-checked against
i2pd's transit tunnel logs. >5% discrepancy triggers a 10% slash.
Three failures in 30 days trigger a 50% slash. A sybil running
phantom receipt pairs will statistically trip this check within
~30 days, losing 50% of their bonded RTD.

**Seeker hardware gate (airdrop only)**: Seeker Genesis Token holders
get a 2× airdrop weight boost. Hardware cost gates the most
aggressively sybil-able part of the protocol (the airdrop).

---

## 11. Token Launch Sequence

### Phase E.1 (v0.2, post-traction)

```
Day 0:  Mint 100M RTD. Distribute to PDAs atomically:
          → 1M + 0.25 SOL to Raydium CLMM initializer
          → 50M to emission PDA
          → 10M to airdrop distributor PDA
          → 5M to foundation vest PDA (12mo cliff)
          → 5M to cross-chain reserve multisig
          → 29M to liquidity reserve multisig
        Transfer mint authority to relay-claim PDA.
        Freeze mint authority (no future minting by humans).
        Lock LP position for 6 months via Streamflow.

Day 0:  Publish multisig addresses + Streamflow LP lock tx hash publicly.

Day 7:  Snapshot for retroactive airdrop (7-day pre-launch exclusion
        window prevents last-minute farming).

Day 7:  Airdrop distributor executes pro-rata distribution to all
        qualifying SubscriptionPDAs per design-v2 §13.

Day 30: Foundation begins disclosing monthly treasury balances on-chain
        (USDC + RTD, purchases + sales, published as Solana memo txns).
```

### Traction gate before v0.2 launch

RTD does not launch until Echelon v0.1 has demonstrated:
- ≥ 500 active paid subscribers (confirmed by SubscriptionPDA count)
- ≥ 50 active hosted eepsites
- ≥ 3 months in production without critical security incidents

This gate is recorded as a public commitment. The foundation will not
launch RTD speculatively — the token narrative must be "here's the
network token for the network you're already using."

---

## 12. Invariants (Machine-Checkable)

The following invariants are tested in `simulators/echelon-rewards/tests/`:

| # | Invariant | Test |
|---|---|---|
| I-1 | Total RTD ever emitted ≤ EMISSION_POOL_RTD | `test_emission_cap` |
| I-2 | Saturation: single node can never earn > fair_share × β | `test_saturation_hard_cap` |
| I-3 | Uptime factor ∈ [0.5, 1.0] for any node | `test_uptime_bounds` |
| I-4 | By year 2: fee_revenue ≥ emission_value at 10K subscribers | `test_sustainability_year2` |
| I-5 | Treasury RTD burn = 50% × RTD inflow, exact | `test_burn_rate` |
| I-6 | APR at 1% bond pool ≥ 50% in year 1 (bootstrap guarantee) | `test_apr_bootstrap` |
| I-7 | POL buyback: per-epoch deployment ≤ 1% of tranche balance | `test_pol_epoch_cap` |
| I-8 | Total supply at any time ≤ 100M RTD | `test_hard_cap` |

---

*Tokenomics v1.0. Companion to `docs/economy/design-v2.md`.*
*Simulation seed: `simulators/echelon-rewards/echelon_rewards/params.py`.*
*On-chain constants derived from simulator output before Anchor deploy.*
