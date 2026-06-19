# Echelon — RTD Token Economics (Formal Specification)

> **Status: v1.1 — locked 2026-06-19.**
> Companion to `design-v2.md`. Where design-v2 explains *why*, this doc
> specifies *exactly what*: formulas, constants, flows, invariants.
> All constants mirror `simulators/echelon-rewards/echelon_rewards/params.py`.

---

## 1. Supply Schedule

**Total hard cap: 100,000,000 RTD. Decimals: 6.**
Zero team pre-allocation. Zero VC allocation. All 100M minted atomically
at deploy time into PDAs. Mint authority transferred to `relay-claim` PDA
immediately after — no human key can ever mint again.

| Allocation | RTD | Lock | Controlled by |
|---|---|---|---|
| PumpSwap LP | 1,000,000 | 6-month on-chain LP lock | Foundation multisig after unlock |
| Emission pool (relay rewards) | 50,000,000 | PDA escrow, 8-year decay | `relay-claim` program |
| Prospective airdrop (Seeker Genesis) | 3,000,000 | 90-day claim window then rolls | `echelon-airdrop` program |
| Retroactive airdrop (v0.1 users) | 7,000,000 | Vests at v0.2 launch | `echelon-airdrop` program |
| Foundation operations | 5,000,000 | 12-month cliff + 24-month linear | 3-of-5 multisig |
| Cross-chain reserve | 5,000,000 | Multisig hold, no vest | 3-of-5 multisig |
| Protocol-owned liquidity reserve | 29,000,000 | Governance-gated deployment | Token-holder governance |
| **Total** | **100,000,000** | | |

**DEX:** PumpSwap (custom SPL token, pool created directly — no pump.fun
bonding curve). This preserves the custom supply cap and controlled
emission. The pump.fun bonding curve is architecturally incompatible with
emission (forces 1B supply, revokes mint authority at graduation).

**Initial LP:** 1,000,000 RTD paired with $500–$1,000 of SOL. Thin at
launch by design — price discovery happens organically. The 29M
liquidity reserve (§6.2) deepens the pool over time as the protocol
generates buy-pressure.

---

## 2. Airdrop Architecture

There are two distinct airdrop pools with different purposes, recipients,
and mechanics. They share the `echelon-airdrop` program but have separate
PDA escrows.

### 2.1 Prospective airdrop — 3M RTD (acquisition)

**Purpose:** Get Seeker/Saga users to install Echelon at v0.2 launch.
The airdrop is the download incentive — you can't claim without connecting
a qualifying wallet through the Echelon app.

**Qualifying wallets:** Hold a Seeker Genesis Token NFT in the connected
wallet at claim time. Verified on-chain by the `echelon-airdrop` program:
the program checks that the signer's wallet holds ≥ 1 token from an
allowlisted mint address set (`QUALIFYING_GENESIS_MINTS`). Initial list =
Seeker Genesis Token mint only.

**Allocation per holder:** Pro-rata across all claimants. If 5,000 Seeker
Genesis holders claim → 600 RTD each. If 15,000 claim → 200 RTD each.
The pool is fixed at 3M RTD regardless of claim count.

**Vesting:**
- 50% unlocked immediately upon claim
- 50% vests linearly over 90 days (claimable daily, no cliff)

**Claim window:** 90 days from v0.2 launch. After 90 days the program
closes the claim PDA. Any unclaimed RTD from uncollected allocations
is transferred to the retroactive airdrop PDA, expanding that pool.

**Why not auto-send:** Requiring app interaction creates a genuine
acquisition event. Every Seeker holder who claims has downloaded Echelon,
connected their wallet, and seen the product. This is worth more than a
token sitting unused in a wallet.

### 2.2 Retroactive airdrop — 7M RTD (retention)

**Purpose:** Reward v0.1 users who used the product before the token
existed. Signals that Echelon rewards early believers retroactively, not
just speculators.

**Qualifying actions (accumulate airdrop weight during v0.1):**

```
weight(W) =
    sum_over_subscription_periods(months_paid × tier_multiplier)
    + (template_pack_purchased ? 5 : 0)
    + min(eepgen_tokens_used / 1_000_000 × 2, 20)
    + min(eepsites_published, 5)

weight(W) *= seeker_boost(W)

tier_multiplier:  Plus = 4, Privacy = 12, Operator = 40

seeker_boost(W):  holds Seeker Genesis Token at snapshot = 2.0, else = 1.0
```

**Distribution:** `share(W) = weight(W) / total_weight × 7_000_000_RTD`

Weight is stored on-chain in `SubscriptionPDA[W]` during v0.1 — no
off-chain database, no foundation trust required. Anyone can recompute
their share.

**Snapshot:** 7 days before v0.2 launch day (anti-farming: prevents
last-minute subscription farming when launch is announced).

**Plus any unclaimed prospective RTD** rolls into this pool after the
90-day claim window closes, so the retroactive pool is ≥ 7M RTD.

**Vesting:** None. Retroactive = immediate claim. These users took real
risk paying USDC for an unproven product; they earn the full unlock.

---

## 3. Emission Curve

### 3.1 Formula

```
daily_emission(t) = E₀ × e^(−λ × t)

λ = ln(2) / EMISSION_HALF_LIFE_DAYS = ln(2) / 1095 ≈ 0.000633 / day
E₀ = EMISSION_POOL_RTD × λ / (1 − e^(−λ × EMISSION_WINDOW_DAYS)) ≈ 37,530 RTD/day
```

**Half-life: 3 years.** Emission halves every 1,095 days. 50% distributes
in years 1–3; 75% by year 6; ~100% by year 8.

### 3.2 Emission schedule

| Year | Daily emission (approx) | Cumulative % of 50M pool |
|---|---|---|
| 1 | 37,530 → 29,760 | 20% |
| 2 | 29,760 → 23,600 | 36% |
| 3 | 23,600 → 18,710 | 50% |
| 4 | 18,710 → 14,840 | 62% |
| 6 | 11,770 → 9,330 | 80% |
| 8 | 7,380 → 5,870 | ~100% |

### 3.3 Governance choke lever

`actual_emission(t) = daily_emission(t) × emission_rate_bps / 10_000`

- Default: `emission_rate_bps = 10_000` (100%)
- **Decrease**: up to −20% per governance proposal, no cooldown
- **Increase**: up to +5% per proposal, 90-day cooldown between increases
- Floor: `emission_rate_bps ≥ 1_000` (10% minimum)
- Ceiling: `emission_rate_bps ≤ 15_000` (150% maximum)
- All changes execute after 48-hour on-chain timelock

---

## 4. Relay Operator Economics

### 4.1 Bond tiers

| Tier | Min bond (RTD) | Emission multiplier | Routing priority |
|---|---|---|---|
| Tier 1 — Base | 100 | 1.00× | Standard |
| Tier 2 — Enhanced | 1,000 | 1.25× | Priority pool eligible |
| Tier 3 — Anchor | 10,000 | 1.50× | Guaranteed allocation |

Tier determined by effective bonded balance at epoch close. Upgrade by
bonding more RTD at any time.

### 4.2 Reward formula

```
raw_weight(node) = saturation(bond, total_bonded) × uptime_factor × tier_multiplier

saturation(bond, total_bonded):
    sat_point = total_bonded / n_active_relays
    eff_bond  = min(bond, sat_point × β)      # hard cap at β × fair share
    return eff_bond / total_bonded

uptime_factor:
    30-day rolling average of liveness pings
    new nodes: starts at 0.5, climbs to 1.0 over 14 days

node_share = raw_weight(node) / sum(raw_weight, all_active_nodes)
node_daily_reward = actual_emission(t) × node_share
    + (relay_fee_share_usd / rtd_price) × node_share
```

### 4.3 Auto-compounding

Operators can set `auto_compound = true`. Epoch rewards add to bond
balance instead of transferring to wallet. Reduces circulating sell
pressure; increases tier weight for the next epoch.

### 4.4 APR projection (aggressive-choke, emission_rate_bps = 10_000)

| Bond pool (% of 100M supply) | Year 1 APR |
|---|---|
| 0.5% | ~2,100% |
| 1% | ~1,050% |
| 5% | ~210% |
| 10% | ~105% |
| 30% | ~35% |
| 50% (mature) | ~21% |

APR declines as more operators join — the sybil-resistance mechanism
working correctly. Early bootstrap operators earn extraordinary returns
for taking on pioneer risk.

---

## 5. Subscriber Token Utility

### 5.1 Payment-lane discount

```
service_cost_in_RTD = base_USDC_price × 0.75 / oracle_RTD_price_USD
```

Oracle: 5-minute TWAP from Pyth Network RTD/USD feed. Fallback to
PumpSwap's on-chain TWAP (60-minute window) if Pyth is stale (>60s).

Minimum floor: RTD payment can never translate to less than $0.30 on
the dollar (maximum effective discount capped at 70%).

### 5.2 Governance staking (velocity sink)

Lock RTD on-chain to earn governance weight and enhanced discounts.
Locked RTD cannot be transferred.

| Lock duration | Governance weight | Discount | Proposal eligibility |
|---|---|---|---|
| No lock (liquid ≥100 RTD) | 1× | 25% off | Vote only |
| 90-day lock | 1.5× | 27.5% off | Vote only |
| 180-day lock | 2× | 32.5% off | Vote + comment |
| 365-day lock | 3× | 40% off | Vote + propose |

**Early-unlock penalty:** breaking a lock before expiry burns 25% of
the locked balance (to null address, not treasury). This makes
lock-breaking costly for genuine emergencies only.

---

## 6. Deflationary Mechanics

### 6.1 Protocol fee burns

```
on_rtd_treasury_receipt(amount):
    burn(amount × 0.50)           # permanent supply reduction
    treasury_rtd += amount × 0.50
```

All RTD inflows to treasury — whether from service fees, LP fee
collection, or slashing proceeds — trigger the 50% burn immediately.
USDC inflows do not trigger RTD burns but fund buybacks (§6.2).

### 6.2 Protocol-owned liquidity (POL) — the 29M reserve

The 29M reserve is deployed in three tranches via governance:

**Tranche A — LP deepening (10M RTD)**
Added to the PumpSwap LP position after the initial 6-month lock
expires. LP position is permanent (no governance withdrawal path).
Permanently reduces circulating supply and tightens the price spread.

**Tranche B — Stabilization buybacks (10M RTD)**
Deployed automatically (no governance vote per deployment) when RTD
trades below **80% of its 90-day TWAP**:
- Max deployment: 1% of tranche balance per epoch
- Interval: ≥ 1 epoch between deployments
- Bought RTD is converted to LP position (not re-sold) — permanent
  removal from circulating supply

**Tranche C — Ecosystem grants (9M RTD)**
Governance-gated: standard proposal → 72h comment → 48h vote → 48h
timelock → execute. Covers auditors, ecosystem devs, cross-chain
integrations, growth programs. Unused C tranche never goes to
individuals — sits in PDA indefinitely until governance directs it.

### 6.3 Burn-to-emission ratio target

Long-run target: `annual_burn ≥ annual_emission × 0.80`

At this ratio net circulating supply grows by at most 20% of emission,
decelerating toward net-deflationary as fee volume scales. The
simulator confirms this is reachable by year 3 of v0.2 at 10,000
subscribers.

---

## 7. Slashing

| Trigger | Bond consequence |
|---|---|
| Two conflicting receipts (same epoch + peer pair) | 100% of bond: 1% to slasher, 99% burned |
| Cross-check failure >5% vs. i2pd logs | 10% of bond: 0.1% to slasher, 9.9% burned |
| Three cross-check failures in 30 days | 50% of bond: 0.5% to slasher, 49.5% burned |
| Early governance lock exit | 25% of locked amount burned, no slasher reward |

---

## 8. Governance

### 8.1 Voting weight

```
voting_weight(W) =
    bonded_relay_rtd(W) × bond_tier_multiplier(tier)   # 1.0×, 1.25×, 1.5×
    + staked_90d(W)  × 1.5
    + staked_180d(W) × 2.0
    + staked_365d(W) × 3.0
    + liquid_rtd(W)  × 1.0   (min 100 RTD to participate)
```

### 8.2 Proposal lifecycle

```
1. Propose     → ≥10,000 RTD voting weight required
2. Discussion  → 72h on-chain comment period
3. Vote        → 48h window; quorum = 1% of circulating supply
4. Threshold   → Simple majority (>50%) to pass
5. Timelock    → 48h before execution
6. Veto        → ≥10% of circulating supply signals veto during timelock
                 → blocks for 7 days, can re-submit with modifications
7. Execute     → Permissionless trigger after timelock
```

### 8.3 Governance scope

Can change: emission rate (within bounds), Tranche C grants, program
upgrades (higher quorum), qualifying Genesis Token mint list additions.

**Cannot change:** total supply cap, airdrop weight formula for existing
PDAs, slash mechanics, bond timelock rules.

---

## 9. Fee Flow

```
CLIENT PAYS RTD / USDC / wOCT
         │
         ├─── RTD payment ──► 50% burned immediately
         │                    50% to Treasury PDA
         │
         └─── USDC payment ─► Treasury PDA (held as USDC)

TREASURY PDA distributes per design-v2 §9.3:
  Bandwidth:  5% treasury · 95% → relay emission PDA → operators
  Hosting:   30% treasury · 70% → host operators
  EepGen:    50% treasury · 50% → inference operators
  Templates: 30% treasury · 70% → creators
  Outproxy:  30% treasury · 70% → outproxy operators
  Cover:      0% treasury · 100% → relay emission PDA

PUMPSWAP LP FEES (0.20% of swap volume):
  ~50% in RTD → 50% burned, 50% to treasury_rtd
  ~50% in SOL → treasury_usd
```

---

## 10. Token Launch Sequence

### Timeline

There is **no hard numeric traction gate.** The foundation decides when
to launch RTD based on product readiness and qualitative judgment. The
stated intent is to have real users before launching — not as an
arbitrary rule but because launching with zero users means zero narrative
and a speculative-only token.

```
Day 0:  Mint 100M RTD. Distribute atomically to all PDAs.
        Transfer mint authority to relay-claim PDA. Freeze human mint access.
        Create PumpSwap pool: 1M RTD + $500–$1K SOL.
        Lock initial LP position for 6 months.
        Publish all multisig addresses + LP lock tx on-chain.

Day −7: Retroactive airdrop snapshot (7-day pre-launch exclusion).
        All SubscriptionPDA + TemplatePackPurchasePDA weights frozen.
        Wallets that subscribed in the final 7 days are excluded.

Day 0:  Retroactive airdrop program opens.
        v0.1 users claim their weight-proportional RTD immediately, no vest.

Day 0:  Prospective airdrop claim window opens (90-day window).
        Seeker Genesis Token holders connect Echelon app → verify NFT →
        claim: 50% instant, 50% vests over 90 days.

Day 90: Prospective claim window closes.
        Unclaimed RTD rolls into retroactive pool; retroactive claimants
        receive a pro-rata top-up.

Day 180: Initial LP unlock (Streamflow timelock expires).
         Foundation governance proposes Tranche A (10M RTD LP deepening).
```

---

## 11. Value Accrual Flywheel

```
More subscribers
      │
      ▼
More bandwidth/EepGen/template fees (USDC + RTD)
      │
      ├──► 50% of RTD fees burned immediately
      │
      ├──► USDC funds treasury opex + POL buybacks
      │           │
      │           ▼
      │    RTD bought by POL → added to LP permanently
      │    (supply reduction + deeper liquidity)
      │
      ▼
Circulating RTD supply decreasing relative to demand
      │
      ▼
RTD price support → relay bond USD value higher
      │
      ▼
More operators bond → better relay network
      │
      ▼
Better privacy product → more users trust it → more subscribers
      (loop)
```

The flywheel does not require price appreciation to sustain itself.
By year 2, simulator projects service fee income to operators
exceeding emission income — the network becomes self-sustaining
without any new RTD emission.

---

## 12. Anti-Sybil

**Bond saturation cap:** Single relay earns at most `total_bonded / n_active_relays × β`
worth of weight regardless of bond size. Sybil cost scales linearly —
N× reward requires N× bond.

**Uptime ramp:** New relays earn 50% weight for 14 days. Rotating nodes
to avoid cross-checks costs 50% of potential earnings.

**Cross-check sampling:** 1% of receipts verified against i2pd transit
tunnel logs. >5% discrepancy → 10% slash within ~30 days statistically.

**Hardware gate on prospective airdrop:** Seeker Genesis Token required
hardware purchase (~$500). Non-trivially gates the airdrop against
wallet farming.

---

## 13. Machine-Checkable Invariants

| # | Invariant | Simulator test |
|---|---|---|
| I-1 | Total RTD ever emitted ≤ 50,000,000 | `test_emission_pool_not_exceeded` |
| I-2 | Single node weight ≤ fair_share × β | `test_saturation_hard_cap` |
| I-3 | Uptime factor ∈ [0.5, 1.0] | `test_uptime_bounds` |
| I-4 | Year 2: fee_revenue ≥ emission_value at 10K subs | `test_sustainability_year2` |
| I-5 | Treasury RTD burn = exactly 50% of RTD inflow | `test_burn_is_50_percent_of_rtd_lp_fee_inflow` |
| I-6 | APR at 1% bond pool ≥ 50% in year 1 | `test_apr_bootstrap` |
| I-7 | POL buyback per epoch ≤ 1% of Tranche B balance | `test_pol_epoch_cap` |
| I-8 | Total RTD supply at any time ≤ 100,000,000 | `test_emission_pool_not_exceeded` |
| I-9 | Prospective airdrop total distribution ≤ 3,000,000 | `test_prospective_airdrop_cap` |
| I-10 | Retroactive airdrop: all weights sum to correct pro-rata | `test_retroactive_weights_sum` |

---

*Tokenomics v1.1. Companion to `docs/economy/design-v2.md`.*
*Simulator: `simulators/echelon-rewards/echelon_rewards/params.py`.*
*On-chain constants locked from simulator output before Anchor deploy.*
