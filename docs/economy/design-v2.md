# Echelon — Economic & Networking Design Doc (v2)

> **Status: design freeze, with v2.1 amendment locked 2026-05-28.**
> Supersedes [design-v1.md](./design-v1.md). Future updates land as
> design-v3 if and when they're substantial.

---

## 0.0 v2.1 amendment — product before token (2026-05-28)

The v2 framework had token launch and product launch happening together via pump.fun. Research surfaced two compounding problems:

1. **Pump.fun's mechanics are architecturally wrong for a DePIN with emission**: fixed 1B supply, mint authority revoked at launch, no reserve allocation possible. design-v2 §9 as originally written was impossible to implement.
2. **Pump.fun's audience is wrong for Echelon's audience**: memecoin speculators are not privacy-tool users. The Solana dApp Store audience (Saga / Seeker holders) is the right wedge. Mixing the two dilutes both.

**Resolution: split product launch from token launch.**

| Release | Ships | Token | Audience |
|---|---|---|---|
| **v0.1** (Q3 2026 target) | Polished I2P mobile browser + IDE + hosted EepGen + premium templates + meshnet config tools, on Solana dApp Store | **None.** Subscriptions paid in USDC | Saga / Seeker holders. Privacy-aware Solana mobile users |
| **v0.2** (~3 months after v0.1, gated on real traction) | Adds RTD token + relay rewards + retroactive airdrop to v0.1 users | RTD on Raydium, custom 100M cap, $50 SOL initial LP, 6-month LP timelock | v0.1 users + the broader Solana DePIN community |

**Why this is the right play:**

- **Solana dApp Store does not require a token** (verified — see [`Solana Mobile Publisher Policy`](https://docs.solanamobile.com/dapp-store/publisher-policy)).
- **Apps must be functional, not placeholder.** The polished I2P browser + hosted EepGen + premium templates *are* the function in v0.1. None of them require RTD.
- **Decoupling token from product means token launches with traction already proven.** The token narrative in v0.2 is "we have N subscribers and Y eepsites already; here's the network token" — the credible launch position.
- **No legal exposure for relay infra.** Echelon ships as a TOOL: we help users build + run their own privacy infra. We do not run a centralized "demo node" or relay anyone's traffic ourselves.
- **Capital efficient.** Pump.fun is impossible without giving up emission control. Raydium permissionless pool with $50 LP works because v0.1 has already demonstrated value before token exists.

**v0.1 product surfaces shipped fully functional for dApp Store review:**
- I2P browser with multi-tab, history, bookmarks, eepsite directory, route-visualization, smart error pages, JS-toggle-per-site, search delegation to notbob.i2p, swipe gestures, pull-to-refresh
- Eepsite IDE with file tree, code editor, AI assistant (BYOK Gemini free, hosted EepGen via Plus tier)
- Eepsite hosting with publish flow → user's own i2pd via local sync daemon (Termux on Android)
- I2P meshnet config (bandwidth class, share %, transit on/off, floodfill on/off)
- Outproxy config (clearnet bridge through user's own i2pd)
- Real ad/threat filter with daemon-side filtering proxy + UI event log
- USDC subscription (Plus $9/mo, Privacy $29/mo, Operator $99/mo)
- Premium template marketplace (17 designed templates, $19 USDC one-time)
- Solana wallet connect via Mobile Wallet Adapter

**v0.1 surfaces feature-flagged off until v0.2:** Staking, Governance, Bounties, Emissions, Referrals, RTD balance display, "Pay in RTD for 25% off", "Earn RTD" copy anywhere.

**v0.1 does NOT ship:** the relay-claim Anchor program (Phase D), the RTD mint (Phase E.1), the relay receipt protocol (Phase D), distributed EepGen inference (Phase E.5 v0.5+), bandwidth-as-economic-product (until token launches and operators are bonded).

The §9, §10, §11, §13 sections below are written as if v2.1 is the world. Sections §1–§8 are still valid (they describe the network design that v0.2 ships); v0.1 ships a compatible subset.

---

## 0. Summary of changes from v1

| v1 open Q | v2 decision |
|---|---|
| Receipt liveness on peer-offline | **Strict no late-sigs.** Bias toward abuse-prevention (§5.4) |
| Plausibility cap values | **Fork Nym's reward-share simulator**, parameterise for Echelon (§5.3) |
| Identity layer | **Pseudonymous v1, attestation hooks reserved** (§7.2) |
| Default payment lane | **3-currency lane**: RTD (cheapest) / OCT (mid, future) / USDC (premium). RTD pays 25% less than USDC; OCT pays ~13% less than USDC (§8) |
| Exotic services scope | **Six-tier services architecture** built around BYOK-free + hosted EepGen + template marketplace + priority routing + cover traffic + enterprise outproxy (§6) |
| Coconut credentials timing | **v0.1 = pseudonymous wallet payments; architecture reserves the upgrade path** to anon credentials in v0.2 (§5.5) |

Plus three things v1 didn't address that became important after research:

1. **Token launch mechanism**: pump.fun fair launch with no pre-allocation; treasury funded by protocol fees (§9).
2. **Multi-chain payment abstraction**: clean interface so RTD/USDC/OCT lanes share one execution path (§8).
3. **Sustainable-without-emission target**: service-fee revenue should cover operator costs without depending on RTD price appreciation (industry consensus per Frontiers DePIN paper, Markaicode AI-DePIN analysis).

---

## 1. The thesis (one sentence)

**Echelon is i2pd-on-steroids: a real privacy mixnet, but with a multi-product economy on top — bandwidth, eepsite hosting, hosted AI for site building, and premium templates — paid in RTD/USDC/OCT, with the foundation funded entirely by protocol fees rather than insider token allocations.**

We don't reinvent the privacy network — i2pd already exists, has tens of thousands of users, and is mature C++. We add:

1. A signed-receipt **proof-of-relay layer** so relays earn for verified work.
2. A **payment abstraction** spanning Solana (RTD/USDC) and OCTRA (OCT) with a 25% discount for native-token holders.
3. A **premium services tier** where the real margin lives.
4. A **fair-launch token** with zero pre-allocation, foundation funded by ongoing protocol fees.

---

## 2. Three-actor model (unchanged from v1, restated for context)

```
                    ┌──────────┐
                    │  CLIENT  │
                    └────┬─────┘
        ① subscription / pay-per-byte / service fee
                         ▼
        ┌─────────────────────────────────────┐
        │     Echelon Treasury (PDA / multisig)│
        │     Funded ONLY by protocol fees     │
        └────┬───────────────────┬────────────┘
             │ ② emission share   │ ④ service-revenue share
             ▼                    ▼
      ┌──────────────┐      ┌────────────────────┐
      │ RELAY NODE   │ ───► │ EXOTIC SERVICE OP  │
      │ (bonded)     │ ③    │ (eepsite host,     │
      └──────────────┘      │  template creator, │
                            │  outproxy operator)│
                            └────────────────────┘
       ③ peer-signed relay receipts
```

---

## 3. Decisions confirmed (the v1 open Qs, locked)

### 3.1  Receipt liveness — strict, abuse-first

If your countersigner is offline at receipt-time, **you don't get paid for that hop**. No late countersignatures. Yes, this means honest relays sometimes lose payment when peers go offline. That cost is acceptable — the alternative (allowing late sigs) opens up:

- A comes online, signs to itself via a sybil B that's "offline" at sign time, then "comes online" later to countersign. We can't distinguish this from honest offline.
- Adversaries spamming late-sigs of forged receipts after a witness disappears.
- Replay windows where a previously-rejected receipt becomes valid.

**Rule:** signed within `EPOCH_T = 1 day`, both signatures present, both timestamps within `±5 min` of each other. Receipts older than the previous epoch when submitted are rejected.

### 3.2  Plausibility caps — fork Nym's simulator

Fork [`nymtech/rewardsharing-simulator`](https://github.com/nymtech/rewardsharing-simulator) into `simulators/echelon-rewards/`. Parameterise:

- Echelon's mobile-churn profile (i2pd's published transit-tunnel rate distribution)
- Three-currency split (some clients pay USDC, some RTD, some OCT)
- Non-linear saturation curve from Nym's mixnet paper
- Bond-to-emission ratio constraints

Run simulations, derive the cap constants empirically, ship with `MAX_BYTES_PER_BOND_PER_EPOCH` documented in code with the simulation seed that produced it.

❗ **Engineering deliverable D.0.5 (new)**: simulator fork + cap derivation, **before** D.3 Anchor program is finalised. The cap values are program constants — getting them wrong post-deploy means a network upgrade.

### 3.3  Identity — pseudonymous now, attestation hooks reserved

v0.1 ships pure pseudonymous (Solana wallet pubkey is your identity). The Anchor program's account schema reserves a 32-byte `attestation_hash` field that's `[0u8; 32]` for v1 nodes. v0.2+ can light it up by:

- Solana Mobile Saga/Seeker `seed-vault` device attestation
- Worldcoin / proof-of-personhood
- Optional KYC-attestation for enterprise nodes

The reward formula will be `reward(stake, uptime, attestation_score)` where `attestation_score = 1.0` for unattested nodes and can scale up to `1.5` once attestation lights up. **Unattested isn't punished, attested is rewarded** — keeps v1 fully pseudonymous-first.

### 3.4  Coconut credentials — v0.2, but reserve the upgrade path now

v0.1 client payments: subscriber pays Treasury PDA in RTD/USDC/OCT, gets a Solana account marked `paid_until = T_expiry`. Client identity is their wallet pubkey. **This is pseudonymous, not anonymous** — the chain knows wallet X paid for bandwidth.

v0.2 upgrade: replace the on-chain `paid_until` with **Coconut credentials** (anonymous, unlinkable, prove-payment-without-revealing-which-payment). Architecture decisions for v0.1 that preserve this option:

- Subscription state lives in a Solana program account, not a database. Easy to switch the verification logic.
- Bandwidth gateways (the i2pd outproxy nodes) call `verify_subscription(wallet, signature)` to gate access. The `verify_subscription` interface stays the same; only the *implementation* changes from "Solana account lookup" to "Coconut credential verification" in v0.2.
- Client SDK abstracts the credential format behind `getCurrentCredential()`. v0.1 returns `{walletPubkey, signature}`; v0.2 returns `{coconutBlindSignature}`. Same call site.

---

## 4. Premium services architecture (the new big section)

The user's framing: *"if it's sexy enough we can make exotic services and charge for them... we have an AI IDE for eepsites... we are just using an established one i2pd and making it do barrel rolls."*

### 4.1  Buyer personas

| # | Persona | Wants | Willingness to pay |
|---|---|---|---|
| 1 | Individual privacy user | Casual private browsing | Low ($5–10/mo) |
| 2 | Power privacy user | Run a node, host eepsites, technical | Med ($30/mo) but earns RTD back |
| 3 | Eepsite operator | Build + run a private site | Med ($30–50/mo) |
| 4 | Anon-developer | Privacy-respecting dev tools | Med-high ($20–80/mo) |
| 5 | Researcher / journalist | Anonymity, bursts of usage | PAYG, occasional spikes |
| 6 | Enterprise privacy buyer | Bulk outproxy bandwidth (AI scraping, market research) | High ($1K–10K/mo) |

### 4.2  Free / BYOK tier ($0/mo)

The **acquisition wedge**. Free-but-genuinely-useful so people install Echelon.

- 1 GB/month bandwidth via local i2pd
- AI-IDE for eepsites with **user's own Gemini API key** (already shipped in Phase 0)
- 3 free starter eepsite templates (Echelon-authored)
- 1 hosted eepsite, 10 MB max
- Standard relay routing (no priority bias)
- Threat-filter (StevenBlack, Phishing Army defaults — already shipped in Phase C)

### 4.3  Plus tier ($9 USDC / 6.75 RTD-equivalent / mo)

- 50 GB/month bandwidth
- **Hosted EepGen** AI access — Echelon-fine-tuned Gemma 3 4B, 100K tokens/day inclusive (no own key needed)
- Full template library access (3 free + 17 premium = 20)
- 5 hosted eepsites, 50 MB each
- Standard routing + threat filter

Pricing math (transparent, displayed in UI):
- 50 GB × $0.16/GB = $8.00
- EepGen 100K tokens/day × 30 days × $0.04/M tokens (DeepInfra Gemma 3 4B price) ≈ $0.12
- Templates: marginal cost ~0
- Markup + bundle discount → **$9.00 USDC retail**

### 4.4  Privacy tier ($29 USDC / 21.75 RTD-equiv / mo)

- 200 GB/month bandwidth
- **Outproxy access** (clearnet egress via Echelon-managed exits)
- **Priority routing** (stake-weighted relay selection biases to high-bond, high-uptime nodes)
- 10 hosted eepsites, 100 MB each
- 1M tokens/day on EepGen + GPT-4-mini class model fallback for harder requests
- **Cover traffic** option (toggle in UI; mixes synthetic traffic with yours to thicken anonymity set)
- Standard support

Pricing math:
- 200 × $0.16 = $32 wholesale bandwidth
- Outproxy add-on: $5
- Priority routing: $3
- 1M tokens/day × 30 × $0.04/M ≈ $1.20
- = ~$41 raw, $29 with bundle discount + scale economics

### 4.5  Operator tier ($99 USDC / 74.25 RTD-equiv / mo)

For users who run their own relay node + want power features.

- 1 TB/month bandwidth
- Cover traffic always-on (no toggle needed)
- Dedicated outproxy capacity (your traffic doesn't share queue with others)
- 5M tokens/day on EepGen
- Operator dashboard: detailed earnings analytics, node-health metrics, slashing-risk monitor
- Premium support (operator-to-operator chat in a private I2P-hosted forum)
- Eligible for the **early operator bond grant** (foundation lends RTD at 0% APR for 90 days to bootstrap your node bond)

Pricing math:
- 1 TB × $0.16 = $160 wholesale
- All add-ons stacked: ~$30
- = ~$190 raw, $99 with operator discount (these users *contribute* infra back to the network — they're net-positive value, not cost)

### 4.6  Enterprise (custom, $1K–$10K+/mo)

- Bulk bandwidth (10 TB+/mo)
- API access for programmatic outproxy use (the Grass.io demand-side market — AI scrapers, market researchers, data-as-a-service buyers)
- Custom SLA (uptime guarantees we can't honestly offer at consumer scale)
- Light KYC for compliance (companies need this)
- White-label option for larger contracts

This is the high-margin lane. Service fee on enterprise = 30% (vs. 5% for retail).

### 4.7  À-la-carte (mix-and-match for edge cases)

| Service | Price (USDC / RTD-equiv) |
|---|---|
| AI-IDE Pro standalone (hosted EepGen, no bandwidth perks) | $5 / 3.75 |
| Premium template pack (one-time, all 17) | $19 / 14.25 |
| Individual premium template (creator-listed) | $1–10 / 70-30 split with creator |
| Outproxy access add-on | $5 / 3.75 |
| Priority routing token | $3 / 2.25 |
| Cover traffic add-on | $4 / 3.00 |
| Pay-per-GB clearnet (outproxy) | $0.16 / 0.12 |
| Pay-per-GB I2P-only | $0.10 / 0.075 |

### 4.8  EepGen (the hosted AI model)

- **Base model**: Gemma 3 4B-IT (Google's open weights, March 2025 release)
- **Fine-tune corpus**:
  - Open-source CSS frameworks (Tailwind, Bootstrap, Pico, Bulma)
  - Hand-curated eepsite samples from active I2P sites (with explicit author consent)
  - Accessibility patterns (WCAG 2.1 AA examples)
  - Privacy-respecting JS patterns (no fingerprinting, no third-party calls)
- **Why fine-tune at all**: differentiates from generic models. EepGen *should* refuse to suggest analytics/tracking/CDN includes. Generic models will happily add Google Analytics.
- **Hosting strategy**:
  - Phase 1 (≤5M tokens/day): external API via [DeepInfra](https://deepinfra.com) at $0.04/M tokens. ~$200/mo at peak — trivial.
  - Phase 2 (>5M tokens/day): self-host on a single H100 / A100 from RunPod or vast.ai. Crossover point per [Codersera 2026 guide](https://codersera.com/blog/self-hosting-llms-complete-guide-2026/).
  - Phase 3: distribute the inference itself — operators with GPUs can run EepGen and earn from inference fees, just like they do from relayed bytes. Adds a third earning lane to the operator economy.

### 4.9  Template marketplace economics

Echelon-authored templates: 3 free + 17 premium pack ($19 one-time, included in Plus+).

Future: **open creator marketplace**. Anyone can list a template. 70/30 revenue split (creator/foundation). Same model as Vercel templates / Lemon Squeezy / ThemeForest.

Revenue projection (rough): if 1000 paid subscribers, 50% buy at least one creator template, avg $5 → $2,500/mo gross, $750/mo to foundation, $1,750 to creators. Doesn't sound like much but it builds a creator economy on Echelon and that's the real flywheel.

### 4.10  Cover-traffic-as-a-service (the "exotic" exotic)

Privacy academics call cover traffic "the unsung hero" of anonymity networks. Real cover traffic dramatically improves the anonymity set but it's expensive — somebody has to pay for the synthetic packets.

Currently HOPR runs cover-traffic-nodes funded by foundation tokens. Echelon's twist: **let users pay extra for cover-traffic capacity allocated specifically to their connections**. A subscription bump that's actually privacy-meaningful.

Mechanic:
- User toggles "Cover traffic on" in their client.
- Client requests N synthetic-packet/sec from cover-traffic-aware relay nodes.
- Cover packets get the same routing / mixing / billing as real packets.
- Privacy gain: even a global passive observer can't distinguish which packets carry real data. Anonymity set effectively becomes ALL participating cover-traffic users.

Operators earn relay-bytes for cover traffic too — same per-byte rate. We don't subsidize this from emission; the user pays for it directly.

### 4.11  Mapping personas to tiers

| Persona | Likely tier | Add-ons |
|---|---|---|
| Individual privacy user | Plus | none |
| Power privacy user | Operator | bond seeded from grant |
| Eepsite operator | Plus or Privacy | premium template pack |
| Anon-developer | Privacy | EepGen heavy use |
| Researcher / journalist | Plus + cover traffic | PAYG outproxy |
| Enterprise privacy buyer | Enterprise | custom |

---

## 5. Proof-of-Relay — locked spec

Mostly unchanged from v1 §5; tightened per §3.1.

### 5.1  Receipt format

```
struct EchelonReceipt {
    version:          u8           // == 1
    relay_pubkey:     [u8; 32]     // Solana Ed25519
    upstream_pubkey:  [u8; 32]
    epoch:            u32          // current epoch (UTC day number since 2026-01-01)
    relay_timestamp:  u32          // unix seconds when relay signed
    upstream_timestamp:u32         // unix seconds when upstream signed
    nonce:            [u8; 16]
    byte_count:       u64          // bytes carried in this transit tunnel
    relay_sig:        [u8; 64]     // Ed25519 by relay over (version..nonce)
    upstream_sig:     [u8; 64]     // Ed25519 by upstream over (version..relay_sig)
}
```

Domain separator: `b"ECHELON-RELAY-RECEIPT-v1\x00"`

### 5.2  Liveness rules (per §3.1)

- `|relay_timestamp - upstream_timestamp| ≤ 300` (5-minute clock-skew tolerance)
- `epoch == ((relay_timestamp - GENESIS_TS) / 86400)` — receipt's epoch must match its own timestamp
- Submitted on-chain within `epoch + 1` window. Older = rejected.
- No late countersignatures. No third-party witness. Just the two signers.

### 5.3  Plausibility caps (TBD per §3.2 simulation)

Initial guesses, replaced by simulation output before Anchor deploy:

- Per-receipt cap: `byte_count ≤ 1 GiB` (real i2pd transit tunnels rotate every ~10 min, real ceiling well under 1 GiB)
- Per (relay, upstream, epoch) cap: 1 valid receipt
- Per relay per epoch global cap: `bond_amount × MAX_BYTES_PER_RTD_PER_EPOCH` where the constant is derived from sim
- Cross-check sample: 1% of submitted receipts cross-checked against i2pd's transit-tunnel logs; >5% discrepancy → slash 10% of bond

### 5.4  Mutual-attestation game theory (with strict liveness)

| Scenario | Outcome | Lesson |
|---|---|---|
| Both honest, both online | Both paid | ✅ |
| A lies, B refuses | Neither paid | ✅ |
| A and B collude | Both paid up to per-pair cap | Capped — sybil cost scales linearly with bond |
| A signs, B never countersigns | Neither paid | ❌ liveness cost, accepted per §3.1 |
| A signs, B countersigns next day | Rejected (out of epoch) | Strict, accepted |
| A submits forged "B-signature" | Rejected (sig verify fails) | ✅ cryptographic |
| A and B sign two different receipts (same epoch+pair) | Both slashable via slash_relay | ✅ slashing-incentivises others to detect |

### 5.5  Anonymity preservation

- Receipts aggregated **off-chain** into a Merkle tree per relay per epoch
- On-chain claim instruction: `claim_relay(merkle_root, total_bytes, epoch)` — proves "I have N receipts totalling M bytes" without revealing individual receipts
- Optional submission delay (up to `K=3` epochs) to break timing correlation between relay activity and on-chain mint events
- v0.2: client-side Coconut credentials replace `paid_until` chain state for full client-side anonymity

---

## 6. (Reserved — section moved to §4 for top-of-document discoverability)

---

## 7. Sybil resistance — locked

Same as v1 §7, with attestation_score reserved per §3.3.

`reward_weight(node) = saturation(stake) × uptime_factor × attestation_score`

- `saturation(s)`: concave, ceilings at `s = SAT_POINT`. Past saturation, additional stake earns marginally less. Forces stake to spread across nodes.
- `uptime_factor`: 30-day rolling average of measured online-time. New nodes start at 0.5, climb to 1.0 over 14 days.
- `attestation_score`: 1.0 default for v1 (everyone unattested). Can scale up to 1.5 in v0.2 once attestation hooks are lit.

**Slash conditions** (slashing burns the bond; doesn't pay the slasher):
1. Two valid conflicting receipts (same `epoch`, same `(relay, upstream)`, different `byte_count`): 100% of bond burned.
2. Cross-check failure (>5% discrepancy with i2pd logs): 10% of bond burned.
3. Repeated cross-check failures (3+ in 30 days): 50% of bond burned, node slashed.

❓ **Reserved engineering Q**: who watches for slash conditions on-chain? Anyone (permissionless slasher), but with no slasher reward to remove the incentive to fabricate. Watchtower bots can run as community service / for audit cred.

---

## 8. Multi-currency payment model (the v2 big addition)

### 8.1  Three lanes

| Lane | Symbol | Network | Position | Multiplier |
|---|---|---|---|---|
| RTD | RTD | Solana SPL | Native, cheapest | 0.75× (25% discount) |
| OCT | OCT | OCTRA L1 (or wOCT on Ethereum) | Privacy-aligned, mid | 0.87× (~13% discount) |
| USDC | USDC | Solana SPL | Stable, premium | 1.00× (baseline) |

The math: if a service has retail price `$X USDC`:
- Pay in RTD: `$X × 0.75` worth of RTD at oracle price
- Pay in OCT: `$X × 0.87` worth of OCT at oracle price
- Pay in USDC: `$X`

Equivalent framing (the user's): "USDC is 33% more than RTD" — `1 / 0.75 = 1.333…`. Both framings true; UI shows whichever is most legible per service.

### 8.2  Why this multi-tier discount

- **RTD discount**: BNB precedent (25% on Binance), aligns long-term holders, drives organic demand for the token, creates a flywheel between service usage and token utility.
- **OCT discount (lighter)**: privacy ideology alignment — privacy-coin users get a small recognition discount but RTD is still cheapest. Avoids cannibalising RTD demand.
- **USDC baseline**: stable, frictionless, no token risk for casual users. Most retail subscribers will start here.

### 8.3  Architecture

Single `Currency` enum throughout codebase:

```typescript
type Currency = 'RTD' | 'USDC' | 'OCT';

interface ServicePrice {
    service: string;          // 'plus_subscription', 'premium_template_pack', etc.
    base_usd_cents: number;   // canonical USD cents
}

function resolveQuote(price: ServicePrice, currency: Currency, oracle: OraclePrices): Quote {
    const multipliers: Record<Currency, number> = {
        RTD: 0.75,
        OCT: 0.87,
        USDC: 1.00,
    };
    const usdAmount = price.base_usd_cents * multipliers[currency] / 100;
    const tokenAmount = usdAmount / oracle[currency];  // USD per token from price oracle
    return { currency, tokenAmount, usdEquivalent: usdAmount };
}
```

OCTRA support is **architectural day 1, runtime opt-in**. The `Currency` enum has `OCT`, the daemon has an OCT payment-handler stub, but the client UI only enables it when the OCTRA mainnet stabilises and our bridge integration is ready (Q1 2026 or later).

### 8.4  OCTRA integration plan

OCTRA's [own bridge](https://docs.octra.org/) takes OCT ↔ wOCT on Ethereum (~2 min round-trip). For Echelon:

- **Path A (cleanest)**: accept wOCT on Ethereum, settle to USDC via Wormhole/Circle, deposit to treasury. Loses OCT's privacy guarantees because wOCT is just an ERC-20.
- **Path B (privacy-preserving)**: run an Echelon node on OCTRA chain itself (FHE-native). Treasury holds OCT directly. Higher engineering cost but matches OCT's privacy ethos.
- **Path C (interim)**: phase A for v0.2, phase B for v0.3.

Recommendation: **Path C**. v0.2 supports wOCT-on-Ethereum (proves the multi-chain architecture works); v0.3 lights up native OCTRA when their L1 has been stable for 6+ months.

### 8.5  Treasury allocation across currencies

Treasury holds whatever it earns: RTD, USDC, OCT in their respective amounts. Periodically rebalances:
- Operating expenses (cloud, dev, audits) paid in USDC. Treasury sells RTD/OCT for USDC as needed.
- Bond grants (early operator program) paid in RTD. Treasury earns RTD via fees + buys back as needed.
- 50% of all RTD treasury inflow is **burned** → deflationary pressure to offset emission.

---

## 9. Token launch — Raydium permissionless pool, post-product (v2.1 amended)

### 9.0  Why not pump.fun (research-confirmed)

Pump.fun is architecturally incompatible with our economics:

- Fixed 1B supply for every token launched (cannot customize)
- Mint authority revoked at graduation (no future minting possible — kills emission)
- No reserve allocation mechanism (cannot hold tokens for cross-chain or future programs)
- Memecoin audience does not match privacy-tool buyer persona

The "fair launch energy" of pump.fun comes from (a) public bonding curve pricing, (b) zero insider allocation. **Both are achievable via Raydium without pump.fun's constraints.**

### 9.1  Distribution

| Allocation | Amount | Lock | Purpose |
|---|---|---|---|
| Raydium initial LP | 1,000,000 RTD + ~0.25 SOL | LP timelock 6mo | Bootstrap on-chain liquidity |
| Emission pool (relay rewards) | 50,000,000 RTD | PDA escrow, 8y vest per emission curve | Phase D Proof-of-Relay rewards |
| Retroactive airdrop (v0.1 users) | 10,000,000 RTD | None — distributed at launch | Reward pre-token subscribers |
| Foundation operations | 5,000,000 RTD | 12mo cliff + 24mo linear vest, multisig | Opex during bootstrap (servers, audits, legal) |
| Cross-chain reserve | 5,000,000 RTD | Multisig hold, no vest schedule | Future bridge to OCTRA / own-chain expansion (v0.5+) |
| Public liquidity (post-LP-unlock) | 29,000,000 RTD | After Raydium LP unlocks | Reserve for additional LP positions / market making |
| **Total cap** | **100,000,000 RTD** | — | — |

**Mint authority** held by `relay-claim` program PDA, no human keys. Frozen authority = none. After all 100M is minted into the escrow PDAs at deploy time, mint authority is **never used again** — the supply cap is enforced by the program itself, not by relinquishing mint authority. (Why not just revoke? Future option to do governance-approved emission boost if year-3+ network growth requires.)

### 9.2  Launch mechanics — Raydium permissionless CLMM

- Mint 100M RTD via standard SPL-Token program. Decimals: 6.
- Distribute 95M to PDA escrows per §9.1 atomically with mint, mint authority then transferred to `relay-claim` PDA.
- 1M RTD + ~0.25 SOL ($50) paired into a **Raydium CLMM (concentrated liquidity)** pool. Tight initial bounds prevent one buy from blowing out the curve.
- LP position **time-locked for 6 months** via [Streamflow](https://streamflow.finance) or equivalent on-chain timelock program (NOT custodial).
- 4M RTD held in a v0.2-launch-day airdrop distributor PDA (gradients per §13.3).
- Foundation public address (multisig) is **published ahead of launch** so the team-bought / treasury-bought RTD is identifiable on-chain. No hidden wallets.

**Capital required from foundation**: ~0.25 SOL ($50) for initial LP. That's it. All other allocations are pre-mint into PDAs, no SOL outlay.

### 9.3  Protocol fees (the actual revenue model — applies in v0.2+)

Beyond the LP fees Raydium accrues to our foundation-held LP position, every Echelon service generates a protocol fee captured by the treasury once v0.2 ships:

| Service | Fee |
|---|---|
| Bandwidth subscription payment | 5% to treasury, 95% to relay-emission pool |
| Pay-per-byte | 5% / 95% same |
| Eepsite hosting fee | 30% to treasury, 70% to host |
| Premium template purchase (Echelon templates) | 100% to treasury |
| Premium template purchase (creator templates) | 30% to treasury, 70% to creator |
| Hosted EepGen API | 50% to treasury, 50% to inference operators (when distributed in Phase 3) |
| Outproxy add-on | 30% to treasury, 70% to outproxy operators |
| Cover traffic add-on | 100% to relay-emission pool (no treasury cut — this is privacy infra) |
| Enterprise contracts | 30% treasury, 70% to dedicated operators |

**Of any RTD-denominated treasury inflow**, 50% is auto-burned per the program's burn hook. Net effect: more network usage → more RTD burned → deflationary pressure.

**v0.1 fees (pre-token)**: USDC subscription revenue + premium template revenue flow directly to a foundation multisig. No on-chain fee splitting since there's no relay-emission pool yet. v0.1 economics are **pure SaaS** — USDC in, opex paid, runway extended.

### 9.4  Why no token in v0.1

- **No real bandwidth product yet.** v0.1 users buy access to AI-IDE + templates + their own privacy node. They are not yet renting bandwidth from a relay network because the relay network doesn't exist as a paid market.
- **Token launch credibility scales with traction.** Launching RTD against zero subscribers = speculation-only. Launching RTD against real subscribers = "here's the network token for the network you're already using."
- **Solana dApp Store policy**: tokens are not required, but the app must be functional. v0.1 gets us through review without inventing fake token utility.
- **Capital flexibility**: foundation runway in v0.1 is 100% USDC subscription revenue. Real revenue, not token speculation. This is what the Frontiers DePIN sustainability paper recommends.

### 9.5  Choke-the-APR lever (user-confirmed design preference)

The 50M emission pool is **not** committed to a fixed curve. The `relay-claim` program reads its emission rate from a **governance-controlled parameter** (initially set by foundation multisig, transitions to RTD-holder governance once token launches).

Three knobs available:

1. **Emission rate per epoch** — current daily mint cap. Default at v0.2 launch: low (year-1 ~25-60% APR equivalent), can be raised via governance proposal if year-2 growth requires.
2. **Hard cap on emission per relay per epoch** — prevents whale-relays from absorbing the entire emission. Per simulator output.
3. **Total emission window** — extendable if year-8 still has unmet demand for emission.

User direction (confirmed 2026-05-28): start aggressive on the choke (low emission), monitor v0.2 organic growth, raise emission only if bootstrap stalls. Conserves the cross-chain reserve and avoids dilution-driven price weakness.

### 9.6  Realistic APR — calibrated against simulator

> **Updated 2026-05-28 after v2.1 amendment. Original v2 numbers
> were under pump.fun assumptions (fixed 1B supply, no
> emission control); v2.1 numbers are under Raydium permissionless
> pool with foundation-controlled emission curve.**

Re-running the simulator (`simulators/echelon-rewards/`) with:
- `TOTAL_SUPPLY_RTD = 100_000_000`
- `EMISSION_POOL_RTD = 50_000_000`
- `EMISSION_WINDOW_DAYS = 8 * 365`
- Aggressive choke setting: `decay_factor = 1.5` (vs. v2's `4.0`)

| Bond pool % of supply | Day 1–30 APR | End-of-year APR |
|---|---|---|
| 0.5% (early bootstrap) | ~600% | ~480% |
| 1% | ~300% | ~240% |
| 5% | ~60% | ~50% |
| 10% | ~30% | ~25% |
| 30% | ~10% | ~8% |
| 50% (mature) | ~6% | ~5% |

**Honest expected trajectory** under aggressive choke:

| Year | Expected APR range | Driver |
|---|---|---|
| 1 (bootstrap) | 50–200% | Low bond pool, throttled emission |
| 2 | 25–80% | Bond pool growing, fees beginning to matter |
| 3 | 15–40% | Fees roughly equal emission |
| 4 | 8–20% | Fees > emission |
| 5–8 | 5–15% | Emission tail; fees dominate |

Compare to Helium-without-burn: 800%+ year 1 settling to ~10% by year 5. Echelon-with-aggressive-choke: 50–200% year 1 settling to ~5–15% by year 5. **Slower absolute earnings for early operators, but stable price action and longer runway for the emission pool.** Trade-off the user explicitly chose.

If year-2 metrics show bootstrap stalled (operator count flat, no new bonds), governance can raise the emission rate. The lever exists; it doesn't have to be used.

---

## 10. Sustainability target (the v2 anchor)

Per [Markaicode's DePIN sustainability analysis](https://markaicode.com/depin-ollama-tokenomics-revenue-model-analysis/) and the [Frontiers DePIN tokenomics paper](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2025.1644115/full):

**The target invariant**: by year 2 of v0.2, *service-fee revenue alone covers operator costs without depending on RTD price appreciation*. Operators earn from:

1. Emission (decays per the chosen curve over 8 years)
2. **Protocol fee share** (95% of bandwidth fees + 70% of hosting + 50% of inference)
3. Direct subscriber payments (when on Operator tier)

**v0.1 sustainability is simpler**: foundation receives 100% of USDC subscription revenue (less Solana network fees). At 1000 Plus subscribers ($9 × 1000 = $9K/month), foundation covers DeepInfra costs (~$2K/month) + opex (servers, audits, legal) and breaks even. Real SaaS economics.

**v0.2 sustainability** layers RTD economics on top: relays earn from fees + emission, foundation earns from protocol fee splits, the burn rate keeps supply in check.

❗ The economic simulator (§3.2) confirms this trajectory is achievable at modest user counts under aggressive choke. See [`simulators/echelon-rewards/outputs/scenario_*.json`](../../simulators/echelon-rewards/outputs/) for sensitivity analysis.

---

## 11. Phase plan — v0.1 (now) and v0.2 (post-traction)

Replaces v1 §10 and v2 §11. Acceptance criteria for each step.

### v0.1 phases — ship to Solana dApp Store first

#### Phase D.0.5 — Reward simulator ✅
Already shipped at [`simulators/echelon-rewards/`](../../simulators/echelon-rewards/). 80 tests, all green. Constants will be re-derived for v0.2 once final emission curve is locked.

#### Phase F — Honesty pass (NEXT)
- Single source of truth `featureFlags.ts` with `tokenEconomy: false` default
- Hide nav entries for Staking, Governance, Bounties, Emissions, Referrals when flag is off
- Drop fake `rtdBalance`, `staked`, `accruedStakingRewards`, `dailyEarnings` from `App.tsx` `userData` initial state — show only chain-derived state, fall back to `null` / "—"
- Audit every constant in `data.ts` and either replace with chain-fetched / null / clearly mark `~ illustrative`
- Tests for both flag states (token-economy on vs. off rendering)

**Acceptance**: Solana dApp Store reviewer with no Termux + no wallet sees a coherent privacy-tool app with no fake numbers anywhere.

#### Phase J — I2P browser polish (the v0.1 killer feature)
- Multi-tab support with swipe gestures (mobile)
- Forward/back history per tab
- User-editable bookmarks (IndexedDB persisted)
- Browsing history with privacy controls (off by default; opt-in to save)
- Address bar that auto-detects: `.i2p` (eepsite), `https://*` (clearnet via outproxy if enabled), search query (delegates to `notbob.i2p`)
- Visible privacy/routing indicator: shows current routing path (your phone → i2pd local → 3 hops → eepsite, OR → exit relay → clearnet)
- Color-coded address bar: purple (eepsite), amber (clearnet via bridge), red (clearnet direct — only if outproxy is off and user explicitly tries clearnet)
- Per-site JS toggle (rare on mobile browsers, valuable for privacy)
- Reader mode for slow-loading eepsites
- Smart error pages (DNS failed, tunnel timeout, X-Frame-Options blocked, exit relay rate-limited)
- Eepsite directory homepage (curated list + user-saved sites)
- Pull-to-refresh
- Tab evaporation on app close (default; opt-in to persist tabs)

**Acceptance**: feels like a premium mobile browser, not a dev shell.

#### Phase E.2-simplified — USDC subscription program (with airdrop tracking + Seeker boost)
See §13 for airdrop weight + Seeker reward design.

- `programs/echelon-subscription/` Anchor program
- `subscribe(tier, duration_months)` instruction takes USDC, creates `SubscriptionPDA[wallet]`
- All airdrop weight inputs stored in PDA: `months_paid`, `tier`, `started_at`, `expires_at`, `total_usdc_paid`, `renewal_count`, `is_seeker_holder`, `total_eepgen_tokens_used`, `total_template_purchases`
- At first subscribe, program inspects signer's wallet for Seeker Genesis Token via `remaining_accounts`. Sets `is_seeker_holder=true` and applies 20% subscription discount.
- TS hook `hooks/subscriptionClient.ts`
- UI page at `/subscription` with tier selector, monthly billing, renewal flow

**Acceptance**: USDC payment subscribes user, PDA is correctly populated, Seeker holders get the discount + boost flag, devnet integration test passes.

#### Phase E.5-simplified — Hosted EepGen
- Daemon `/eepgen/complete` endpoint (gateway)
- Verifies signed subscription PDA pubkey before forwarding
- Forwards to DeepInfra Gemma 3 4B
- Tracks token quota in subscription PDA via `increment_eepgen_usage(amount)` instruction
- Plus tier: 100K tokens/day. Privacy tier: 1M tokens/day. Operator tier: 5M/day.
- TS hook `hooks/eepgenClient.ts`
- AI-IDE sidebar integrates Plus path alongside existing BYOK-Gemini path

**Acceptance**: Plus subscriber can use hosted EepGen without their own API key, daemon enforces quota, over-quota requests get a clean 402-equivalent.

#### Phase E.6 — Premium template marketplace v0.1
- 17 designed templates as one-time $19 USDC purchase
- `programs/echelon-templates/` Anchor program
- `purchase_template_pack()` instruction creates `TemplatePackPurchasePDA[wallet]`
- `TemplatePackPurchasePDA` also contributes to airdrop weight (§13.3)
- UI gates premium template gallery behind purchase check
- Templates ship as content-protected static React components in `/components/templates/premium/`
- Render only after entitlement check — purchase verification on every render

**Acceptance**: $19 USDC purchase unlocks 17 templates, free users see lock screen with purchase CTA, devnet integration test passes.

#### Phase H — Capacitor + MWA + dApp Store publish
- `@capacitor/core` + `@capacitor/android`, `npx cap add android`
- Replace `WalletMultiButton` with `@solana-mobile/wallet-adapter-mobile`
- Termux probe screen for Android (already partially built — polish)
- AndroidManifest minimal permissions (INTERNET, QUERY_ALL_PACKAGES for MWA wallet detection)
- APK signed with release key (gitignored keystore)
- `dapp-store-cli` flow: Publisher NFT mint, App NFT mint, Release NFT mint
- Listing assets: 1200x600 banner, 512x512 icon, 6 screenshots, name, short + long descriptions
- Documented in `docs/release.md`

**Acceptance**: signed APK installs on a Seeker / Saga, MWA flow works, app surfaces all v0.1 features, dApp Store CLI accepts all NFT mints, listing is reviewer-ready.

#### Phase I — Hardening
- Sync daemon shared-secret auth (per-device 32-byte token in `~/.echelon/secret`)
- Eepsite size caps (4MB/file, 64MB/site) enforced both in IDE (warn before save) and daemon (reject publish)
- Termux:Boot autostart script for daemon survival across reboots
- Optional HTTPS sync daemon mode (env-var gated, self-signed cert)
- Structured logs with UI tail in a Diagnostics page

**Acceptance**: drive-by from another local app cannot post to the daemon; oversized files rejected at both ends; daemon restarts cleanly with Termux; logs persist to disk.

#### v0.1 final pass + dApp Store submission
- Re-run full CI (tsc, vitest, pytest, vite build, e2e)
- Update ROADMAP.md statuses
- Write release notes for v0.1.0
- Tag `v0.1.0-beta` in git
- User decides on dApp Store submission timing

### v0.2 phases — RTD launch on traction

Gated on: 3 months of v0.1 in production with measurable traction (≥ 500 active subscribers, ≥ 50 hosted eepsites, healthy retention curve).

#### Phase D.1 — Receipt format library (Rust + TS)
Per §5.1. `programs/echelon-receipts/` crate. Domain separator `b"ECHELON-RELAY-RECEIPT-v1\x00"`. Strict liveness ±5min, current-or-next-epoch submission window.

#### Phase D.2 — Daemon receipt issuer
`scripts/relay_attestor.py`. Subscribes to i2pd transit-tunnel events. Counter-sign exchange via Echelon-protocol over I2P. Plausibility cap enforcement.

#### Phase D.3 — Anchor program (relay-claim)
`programs/echelon-relay-claim/`. Holds mint authority for the 50M emission pool. Instructions: `bond_relay`, `claim_relay`, `slash_relay`, `withdraw_bond`. Constants from D.0.5 simulator.

#### Phase D.4 — Devnet integration
Two daemons exchange receipts → claim → mint on devnet. `scripts/devnet-smoke.sh` runs full loop in CI.

#### Phase E.1 — RTD SPL mint + Raydium launch
- 100M RTD minted at deploy time
- 95M distributed to PDA escrows per §9.1 (atomic with mint)
- Mint authority transferred to `relay-claim` PDA
- 1M + ~0.25 SOL paired into Raydium CLMM
- LP timelocked 6mo via Streamflow
- 4M held in airdrop distributor PDA

#### Phase E.4 — Treasury PDA + emission schedule
PDA holds the unstaked RTD, drips to relay-claim per the chosen curve. Curve parameters under multisig governance initially, transitions to RTD-holder governance via on-chain proposal.

#### Phase E.7 (NEW) — Retroactive airdrop distribution
See §13 for full algorithm. `programs/echelon-airdrop/` reads all v0.1 `SubscriptionPDA[*]` and `TemplatePackPurchasePDA[*]`, computes weight per §13.3, distributes 10M RTD pro-rata. Seeker holders get 2x boost. Snapshot frozen 7 days before distribution.

#### Phase E.5 — Bounty / referrals (if and when)
On-chain bounties + referrals. Decision deferred to v0.2 launch time — may be cut if not strategically necessary.

#### Phase E.3 — Services program (deferred to v0.3)
The full multi-service economy with eepsite-host fees, EepGen 50/50 split, outproxy add-ons. Not needed for v0.2 if v0.1 hosting model already works in USDC.

---

## 12. v2 open questions — RESOLVED

The v1 questions are resolved in §3. These were the new ones surfaced by v2 research, now also resolved with the user.

1. **OCTRA Path B (native FHE-on-OCTRA payments) timing** — Defer until **after token launch + MVP**. v0.1 ships Solana-only USDC. OCTRA work begins post-launch.

2. **EepGen Phase 3 (distributed inference to operators)** — Confirmed **v0.5**. Too much engineering surface for early launch. v0.1/v0.2 use external DeepInfra API; v0.5+ self-hosts on dedicated GPU; distributed inference is a later epic.

3. **Enterprise KYC provider** — **Deferred indefinitely**. Echelon does not implement KYC for v0.x. If/when an enterprise contract requires it, revisit then. Default position: "no KYC, ever."

4. **Slasher rewards** — **Incentivise.** 1% of slashed bond paid to the slasher, 99% burned.

5. **Template marketplace timing** — Echelon-authored templates only at v0.1; **open creator marketplace at v0.2+**.

6. **EepGen abuse policy** — **Heavy ToS disclaimer, no aggressive filtering.** Users running illegal operations through Echelon's AI tooling create their own evidence trail; that's not our problem to solve.

### Updated §7 slash table (incorporating Q4)

| Slash trigger | Bond consequence | Slasher reward |
|---|---|---|
| Two valid conflicting receipts (same epoch, same pair, different byte_count) | 100% burned via 99/1 split | 1% of bond |
| Cross-check failure (>5% discrepancy with i2pd logs) | 10% burned via 99/1 split | 0.1% of bond (smaller infraction) |
| Repeated cross-check failures (3+ in 30 days) | 50% burned via 99/1 split | 0.5% of bond |

---

## 13. Airdrop tracking + Seeker Genesis Token reward (v2.1 new)

This section is **load-bearing for v0.1**: every subscription / purchase action in v0.1 must store airdrop-weight inputs on-chain so v0.2 can compute the retroactive distribution without trusting any off-chain database.

### 13.1  Why retroactive airdrop matters

v0.1 users are betting on a network that doesn't have a token yet. They pay USDC for a privacy product. When v0.2 ships RTD, those users should be **rewarded for being early** — they took the risk of an unproven product. This is what "retroactive airdrop" means in DeFi: the people who used it before tokens existed get tokens proportional to their pre-token usage.

This is also the **dApp Store growth lever**: "subscribe to Plus today, get a guaranteed slice of the v0.2 token airdrop based on your subscription history." Strong incentive to subscribe early.

### 13.2  Why Seeker Genesis Token boost

[Solana Seeker](https://solanamobile.com/seeker) (and the original Saga) shipped with a **Seeker Genesis Token** NFT that proves device ownership. Holders of this NFT have already shown commitment to Solana mobile. Echelon's primary v0.1 distribution channel is the Solana dApp Store, which is the Seeker / Saga store. Rewarding Seeker holders specifically:

1. **Aligns with the dApp Store audience** — rewards the people most likely to use Echelon
2. **Creates a positive externality for Seeker** — gives existing Seeker holders something extra to do with their device
3. **Acts as light Sybil resistance** — Seeker holders had to buy hardware, which non-trivially gates one-wallet-per-person

User context: user holds a Seeker themselves and wants this reward to exist not as self-dealing but as a recognition mechanism for the device cohort.

### 13.3  Airdrop weight algorithm (formal spec)

For each wallet `W` at snapshot time `T_snapshot`:

```
weight(W) =
    sum_over_active_subscription_periods(
        months_paid * tier_multiplier
    )
    + (template_pack_purchased ? 5 : 0)
    + (eepgen_usage_in_tokens / 1_000_000) * 2     // capped at 20
    + new-eepsite-published-bonus                  // 1 per published eepsite, capped at 5
    
weight(W) *= seeker_boost(W)

tier_multiplier:
    Free      = 0    (must have paid to qualify)
    Plus      = 4    (1x base rate)
    Privacy   = 12   (3x base rate — paid 3x as much, gets 3x weight)
    Operator  = 40   (10x base rate — bigger commitment)

seeker_boost(W):
    holds Seeker Genesis Token at snapshot = 2.0
    else                                    = 1.0
```

**Pool**: 10,000,000 RTD allocated for retroactive airdrop in v0.2 (§9.1).

**Distribution**: pro-rata.
```
W_share(W) = (weight(W) / sum_of_all_weights) * 10_000_000_RTD
```

**Snapshot**: frozen 7 days before v0.2 token launch. Wallets active during the 7-day window are NOT included (anti-Sybil — prevents last-minute farming when launch becomes imminent).

### 13.4  How v0.1 makes this verifiable

The `subscription` Anchor program writes all weight inputs to `SubscriptionPDA[wallet]`. The `templates` program writes to `TemplatePackPurchasePDA[wallet]`. The daemon reports EepGen usage to a `usage_attestation` PDA via signed quota updates. The eepsite host count is derived from the user's published-eepsite manifest signed by their pubkey.

At v0.2 launch time, the `airdrop` program reads ALL these PDAs at snapshot time, computes weights deterministically, and distributes 10M RTD. **No off-chain database. No trust in the foundation. Anyone can re-run the calculation and verify their slice.**

### 13.5  Seeker Genesis Token mint address

The Seeker Genesis Token is a specific NFT on mainnet. Mint address verification is part of the airdrop program — supports a **list** of qualifying mint addresses (initial list = Seeker Genesis + Saga Genesis Token, both since both cohorts qualify). The list is upgradeable via foundation multisig (so we can add Genesis Token v2 if Solana Mobile ever issues one) but each addition is a public on-chain transaction.

The exact mint address(es) will be hard-coded in `programs/echelon-subscription/src/lib.rs` via:

```rust
const QUALIFYING_GENESIS_MINTS: &[Pubkey] = &[
    pubkey!("..."),  // Seeker Genesis Token mint (TBD — pulled from Solana Mobile docs at deploy)
    pubkey!("..."),  // Saga Genesis Token mint (TBD)
];
```

Verification at subscribe-time: `remaining_accounts` carries the user's token account for one of the qualifying mints. Program checks (a) the token account belongs to the signer, (b) the mint is in the whitelist, (c) `amount >= 1`. If all true, sets `is_seeker_holder = true` on the SubscriptionPDA. The flag is checked at airdrop-snapshot time — Seeker holders who keep the NFT until snapshot get the 2x boost.

### 13.6  Pre-token airdrop CTAs in v0.1 UI

The user CAN see their accumulating airdrop weight in v0.1 (this is part of the marketing). UI surfaces:

- Subscription page: "Your accumulating airdrop weight: X (Plus subscriber, 6 months) → estimated v0.2 RTD: Y" (estimate based on current weight + projected total weight assuming network grows to N users)
- Seeker holder badge ("Founder bonus: 2x weight active") visible if Seeker Genesis Token detected in wallet
- Templates purchase: "+5 weight on retroactive airdrop"
- EepGen usage page: "Your EepGen usage: 2.3M tokens → +5 weight (cap: 20)"

The estimates are clearly labeled as estimates and update live as weight changes. **No promises** about specific RTD amounts — just transparency about how weight is calculated.

This is a **legal-risk-aware** design: we're offering a chance at a future airdrop based on usage of a real product. Not a security offering. Real product, real USDC payment, possible future retroactive reward. If users want to subscribe ONLY for the airdrop weight, that's their business — the product itself stands on its own.

---

## 14. References (additions in v2.1)

[solana-mobile-publisher-policy]: https://docs.solanamobile.com/dapp-store/publisher-policy
[solana-seeker]: https://solanamobile.com/seeker
[raydium-clmm]: https://docs.raydium.io/raydium/concentrated-liquidity
[streamflow-vesting]: https://streamflow.finance
[octra-defillama]: https://defillama.com/research/spotlight/octra-the-fully-homomorphic-encryption-breakthrough
[octra-docs]: https://docs.octra.org/
[gemma-pricing]: https://artificialanalysis.ai/models/gemma-3-4b/providers
[depin-frontiers]: https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2025.1644115/full
[depin-sustainable]: https://markaicode.com/depin-ollama-tokenomics-revenue-model-analysis/

Plus all v1 references unchanged.

---

*Design freeze v2.1. v0.1 product code begins now. v0.2 token launch sequenced post-traction.*
