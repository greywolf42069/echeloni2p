# Echelon — Economic & Networking Design Doc (v1)

> Status: **Design — pre-implementation**. This is the doc Phase D will be
> grounded in. Nothing in here is shipped yet. Open questions are flagged
> with `❓` and need product calls before code.

---

## 1. Why this doc exists

The original ROADMAP's Phase D (Proof-of-Relay → RTD claim Anchor program)
sketched a protocol but didn't grapple with the actual hard parts of an
incentivized anonymity network: **sybil resistance, anonymity-payment
correlation, byte-count plausibility, and pricing that survives contact
with reality.** This doc grounds the design in a decade of prior art and
honest tradeoffs before we write a single Anchor instruction.

The user's framing: *"the default prices for bandwidth are stupid and
crazy, but also crypto is stupid and crazy and if this is and it sexy
enough, we can make exotic services and charge for them."* Translated to
engineering: the economic layer needs to be **defensibly designed** (not
arbitrary), **honestly priced** (anchored to real data), and **multi-
product** (bandwidth alone won't pay rent).

---

## 2. Prior-art landscape

What's been tried in this space, in rough chronological order. References
inline so this doc stays auditable.

### 2.1  Tor (2002–) — the deliberate non-example

Tor explicitly rejected payments. The Tor Project's stated reasons
([Safeguarding the Tor network, Nov 2023][tor-blog-2023]):

- Legal classification & liability: paying relays makes operators look
  like "service providers" rather than free-speech volunteers.
- Anonymity-payment correlation: any payment system creates a side-channel
  between identity and traffic.
- Incentive distortion: if some traffic gets priority, the "mixed-set" of
  users that protects anonymity gets fragmented.
- Loss of location diversity: paid relays cluster in cheap-bandwidth
  jurisdictions.

Academic responses since: PAR (2008), GoldStar/BRAIDS/LIRA (2010), TEARS
(2014), TorCoin (2014), [A Fair and Anonymous Payment System for Onion
Relays][onion-payment-2020] (2020). None deployed. The lesson isn't *"don't
do this"* — it's *"the design has to actually solve the correlation
problem, not hand-wave it."*

### 2.2  HOPR (2020–) — proof of relay, split keys

HOPR is **the** reference architecture for incentivized mixnets and the
single most useful prior art for Echelon. Their core inventions:

**Proof of Relay** ([docs][hopr-por]): payments are locked behind
cryptographic keys split between consecutive node pairs. Node A can only
unlock its payment by exchanging key halves with node B (the next hop). A
can't claim payment without B confirming receipt; B can't claim payment
without C confirming receipt. *"The selfish thing to do is to cooperate."*

**Tickets + payment channels** ([docs][hopr-tickets]): relaying a packet
generates a *ticket* (cryptographic receipt), not an immediate on-chain
event. Tickets accumulate in payment channels between node pairs.
On-chain settlement is delayed by the operator's choice — this severs
the timing correlation between "I just relayed packet X" and "this
on-chain transaction happened."

**Probabilistic payments** ([docs][hopr-prob]): not every ticket pays. A
small fraction (e.g. 1%) are *winning tickets* worth 100× a normal payment.
Same expected value, but 100× fewer on-chain transactions. The remaining
99% never touch chain — pure metadata reduction.

**Why we can mostly skip prob-payments:** HOPR runs on Ethereum/Gnosis
Chain where gas is non-trivial. Solana's per-tx cost is ~$0.0002 and
finality is sub-second. A naïve "every ticket settles on-chain" approach
that's economically unviable on Ethereum is *cheap* on Solana. We can use
HOPR's ticket mechanism for **anonymity** purposes (delayed settlement to
break timing correlation) without needing the probabilistic compression
for cost reasons.

### 2.3  Nym (2021–) — reward sharing + Coconut credentials

Nym contributed the most rigorous economic theory in this space. The
[Reward Sharing for Mixnets][edinburgh-rsm] paper (Univ. of Edinburgh,
2022) does game-theoretic analysis of mixnet rewards and proves
equilibria that promote decentralization. Nymtech publishes a public
[reward-sharing simulator][nym-sim] we can fork.

Key Nym ideas Echelon should adopt:

- **Operator bond + delegator stake**: operators put their own RTD at
  risk; delegators add stake without running infrastructure. Both share
  rewards. Lowers capital barrier to operator entry.
- **Saturation**: per-node reward ceiling. Past saturation, adding more
  stake to one node yields diminishing returns — forces stake to spread.
- **Performance gating**: rewards proportional to measured uptime and
  packet-mixing quality, not just stake size.

**Coconut credentials** ([overview][nym-coconut]) deserve their own
mention. They allow a user to *prove* they paid for service without
revealing *who* they are or *which* payment was theirs. This is the
canonical solution to anonymity-payment correlation for *clients*. We
should use them or an equivalent zk-anonymous-credential scheme for the
"user pays for bandwidth" flow.

### 2.4  Orchid (2019–) — stake-weighted directory

Orchid ([docs][orchid-docs]): a decentralized VPN bandwidth market on
Ethereum. Their notable mechanism is **stake-weighted random selection**:
providers stake OXT in a directory, and clients select providers
proportional to stake. Sybil cost = total OXT × number of fake nodes.

Their real innovation: **probabilistic nanopayments**, similar to HOPR's
but as the primary payment mechanism rather than a privacy enhancement.
Users stream nano-payments per packet; settle periodically. Also a
solved-problem on Solana — we can do plain micropayments without
probabilistic tricks.

### 2.5  Mysterium (2017–) + empirical bandwidth pricing

The single most useful empirical data point. Nokia Bell Labs measured
[the value of spare residential bandwidth][bell-labs-bw] at **11–14
cents/GB** in the US on Mysterium in 2022. This is **the anchor** for
any Echelon pricing decision. The same paper found that "buyers and
sellers utilize ad-hoc rules-of-thumb" — exactly the issue with
Echelon's current `data.ts` defaults.

The same paper notes Mysterium-style sellers can **triple income by
pricing** *below* default — i.e. the marketplace is illiquid because
defaults are sticky. Implication: ship sane defaults derived from data,
not vibes.

### 2.6  Lokinet / Oxen / Session (2018–) — service node staking

Service nodes stake OXEN (now SESH); fixed bond size; node selection
randomized but bond-gated. Sybil resistance is purely capital-based.

The mechanic is simple but effective: with a high enough bond
(historically ~15K OXEN ≈ tens of thousands of USD at peak), spinning up
N fake nodes costs N × bond. Combined with reward dilution per
additional node, Sybil ROI hits zero quickly.

Echelon variant: **multi-tier bonds**. Casual mobile relay = small bond
(say 100 RTD); high-throughput dedicated relay = larger bond. Different
sybil-cost surfaces for different node classes.

### 2.7  Grass / Wynd Network (2024–) — closest Solana competitor

[Grass][grass-faq] runs a residential-bandwidth network *on Solana* with
2–3M browser-extension nodes. Use case is web data collection for AI
training. Notable model:

- Uses "Grass Points" — internal scoring — that convert to GRASS tokens.
  This is **not** trustless — Grass can adjust the formula. Echelon
  shouldn't copy this. We want on-chain, deterministic accounting.
- They're structured as a "sovereign L2 data rollup," indicating they
  found Solana base-layer too expensive *for their workload* (continuous
  micropayments to millions of nodes). Worth flagging: at very high node
  count, even Solana costs add up. We may eventually want a rollup or
  off-chain aggregation, but for our likely 1K–10K initial scale, raw
  Solana is fine.

### 2.8  Helium (2019–) — DePIN proof point

Helium ($14M cumulative revenue Jan–Nov 2025 per [Solana DePIN
report][solana-depin-2025]) demonstrates that DePIN-on-Solana can hit
real revenue and 600K+ end-users. Notably, Helium **changed their
incentive model multiple times** as they learned what didn't work — the
recent HIP-138 unifying $IOT and $MOBILE into $HNT. Lesson: design for
parameter changes; don't hard-code emission rates that can't be
governance-tweaked.

---

## 3. What Echelon should steal vs. invent

Synthesised from §2.

### 3.1 Steal (settled science)

| Borrowed from | Mechanism |
|---|---|
| HOPR | **Proof-of-relay with split keys**: pairwise mutual unlock, exact same protocol shape |
| HOPR | **Tickets + delayed settlement** for timing-correlation defence |
| Nym | **Operator bond + delegator stake** with saturation curve |
| Nym | **Reward sharing simulator** (we fork their public sim, parameterise) |
| Orchid | **Stake-weighted random directory** for relay selection |
| Lokinet | **Multi-tier bonds** sized to node class |
| Mysterium / Bell Labs | **Empirical pricing anchor**: 12 ¢/GB ± |

### 3.2 Specifically Echelon

What we get to claim as ours:

1. **I2P-native, not a new mixnet.** We don't compete with i2pd — we add
   an incentive + payment layer on top of an existing mature anonymity
   network with established users and tooling. Free distribution, lower
   eng cost.
2. **Solana micropayments instead of probabilistic.** We use plain
   per-epoch settlement rather than HOPR's prob-payment compression
   because Solana fees don't justify the complexity. We *do* keep HOPR's
   delayed-settlement-for-anonymity property.
3. **Multi-product revenue model.** Bandwidth is the loss-leader; the
   margin lives in *exotic services*: eepsite hosting marketplace,
   AI-IDE-as-a-service (gateway-paid Gemini), priority routing, paid
   eepsite memberships. §6.
4. **Termux-mobile-first deployment.** Most prior systems target
   datacenter or always-on residential users. Echelon's primary node is
   "smartphone running i2pd in Termux" — radically different cost
   structure (zero hardware), radically different reliability profile
   (intermittent uptime). The economic model has to absorb churn
   gracefully.

### 3.3 Don't copy

| From | What | Why |
|---|---|---|
| Grass | Centralised "Points" → tokens scoring | Echelon must be deterministic on-chain or it's just a database with extra steps |
| HOPR | Probabilistic payments | Cost-driven; not needed on Solana |
| Tor | Pure-volunteer model | Doesn't scale to the user counts we want |
| Echelon's own `data.ts` | Hard-coded subscription tiers, 2000% → 80% APR | Both arbitrary and wildly out of line with real DePIN APRs (Helium ~5-15%, Nym similar) |

---

## 4. Three-actor model

Every flow can be reduced to interactions between three roles:

```
                ┌──────────┐
                │  CLIENT  │  (subscriber / pay-per-byte user)
                └────┬─────┘
                     │ ① pays subscription or per-byte fee
                     ▼
     ┌─────────────────────────────────────┐
     │       Echelon Treasury (PDA)         │
     └────┬───────────────────┬────────────┘
          │ ② emits per-epoch  │ ④ subscription revenue share
          ▼                    ▼
   ┌──────────────┐      ┌────────────────────┐
   │ RELAY NODE   │ ───► │ EEPSITE / EXOTIC   │
   │ (bonded)     │      │ SERVICE OPERATORS  │
   └──────────────┘      └────────────────────┘
          ▲ ③ peer-signed receipts
```

- **Client**: subscribes, gets bandwidth credits or pay-per-byte access.
  Pseudonymous via Coconut-style credentials.
- **Relay Node**: runs i2pd + Echelon sidecar. Bonded. Earns RTD per byte
  carried, attested via peer-signed receipts.
- **Exotic Service Operator**: runs an eepsite, paid AI service, paid
  routing. Earns RTD from subscribers + direct payments.

The Treasury PDA holds emission tokens and clients' subscription deposits.
On each epoch (≈ 1 day), it distributes to relays by attested-byte share
(subject to per-node saturation), and to operators by service-share rules.

---

## 5. Proof-of-Relay protocol (Echelon's adaptation of HOPR)

### 5.1  Receipt format

Adapting HOPR's split-key idea to I2P transit tunnels:

```
struct EchelonReceipt {
    version:        u8           // == 1
    relay_pubkey:   [u8; 32]     // Solana Ed25519 of the relay
    upstream_pubkey:[u8; 32]     // Solana Ed25519 of the upstream peer
    epoch:          u32          // current epoch # (anti-replay)
    nonce:          [u8; 16]     // random per receipt
    byte_count:     u64          // bytes carried in this tunnel
    relay_sig:      [u8; 64]     // Ed25519 by relay over (version..byte_count)
    upstream_sig:   [u8; 64]     // Ed25519 by upstream over (version..relay_sig)
}
```

The two signatures are the cryptographic equivalent of HOPR's split keys:
neither party can claim payment alone. Both must agree to mutually sign,
and each is committing to having seen the other's contribution.

Domain separator for signing: `b"ECHELON-RELAY-RECEIPT-v1\x00"`.

**Why we don't fully copy HOPR's split-key idea**: HOPR's mechanism
requires modifying packet routing (each pair of nodes exchanges key
halves alongside data). I2P's existing transit-tunnel cryptography
already establishes pairwise channels between consecutive routers — we
can piggyback on those for the receipt-exchange step instead of
reimplementing the routing layer. This is the trick that lets Echelon be
"i2pd + signature sidecar" rather than "new mixnet from scratch."

### 5.2  Plausibility caps

Adversarial story: a relay claims `byte_count = 10 PB` for one tunnel,
mints absurd RTD. Defences (all enforced on-chain in the claim
program):

1. **Per-receipt cap**: any single receipt with `byte_count > 1 GiB` is
   rejected. Real I2P transit tunnels rotate every 10 minutes — no
   honest tunnel sees that much.
2. **Per-(relay,peer,epoch) cap**: only one valid receipt per pair per
   epoch. Multiple receipts → rejected.
3. **Per-relay-per-epoch global cap**: derived from bonded amount. A
   relay with bond `B` can claim at most `B * MAX_BYTES_PER_BOND_PER_EPOCH`
   per day. Forces sybils to scale capital linearly.
4. **Cross-check sample**: 1% of receipts are flagged at submission time
   for cross-checking against i2pd's published transit-tunnel logs
   (which show byte counts). A relay whose self-reported volume
   diverges from i2pd's published volume by > X% gets slashed.

❓ **Open**: precise values of these caps. Need to model with empirical
i2pd transit data. Probably `MAX_BYTES_PER_BOND_PER_EPOCH = 10 GiB / RTD
of bond` as an opening guess.

### 5.3  Mutual-attestation game theory

If A and B are honest, both sign honestly, both get paid. ✅
If A lies (claims > carried), B refuses to sign — A gets nothing. ✅
If A and B collude (both lie), they're capped by per-(pair,epoch) limit
+ per-relay global cap + cross-check. Maximum extractable value scales
linearly with stake, not with lies. ✅
If A signs but B is offline by claim time, A's receipt has only one sig
→ rejected. ❌ (This is a real liveness issue — see open Q.)

❓ **Open**: how to handle the "peer went offline before signing" case.
HOPR's answer is that you weren't going to be paid for that hop anyway
because the data didn't actually get through. But peers can come back
online; we might allow late countersignature within the same epoch or
the next.

### 5.4  Anonymity preservation

Per-receipt on-chain claims would leak the relay graph. Defences:

1. **Aggregate receipts off-chain**: relays accumulate receipts for an
   epoch, then submit a single Merkle commitment. The on-chain claim
   proves "I have N receipts covering M bytes" without revealing
   individual receipts.
2. **Random submission delay**: relays MAY hold receipts for up to K
   epochs before claiming, breaking timing correlation between relay
   activity and on-chain mint events. (Inspired directly by HOPR.)
3. **Client side: Coconut-style credentials**: clients pay into the
   Treasury once per subscription period, get an unlinkable credential,
   spend it bit-by-bit. The on-chain payment is decoupled from the
   client's subsequent traffic.

---

## 6. Pricing model (the part you said was "stupid and crazy")

### 6.1  Tear-down of the current `data.ts`

```ts
// data.ts — current arbitrary tiers
{ id: 'base',  prices: { RTD: 20, SOL: 0.028, USDC: 4,  XMR: 0.025 }, description: '100GB @ 2.5 Mbps' },
{ id: 'tier1', prices: { RTD: 30, SOL: 0.043, USDC: 6,  XMR: 0.038 }, description: '200GB @ 44 Mbps' },
{ id: 'tier2', prices: { RTD: 50, SOL: 0.071, USDC: 10, XMR: 0.063 }, description: '500GB @ 44 Mbps' },
```

Problems:

- $4 for 100 GB ≈ 4¢/GB, which is **3× below the Bell Labs anchor**. We
  can't sustainably pay relays at that rate when their wholesale cost is
  12¢/GB.
- Tier 1 at $6 for 200 GB ≈ 3¢/GB AND offers 18× the throughput of base
  tier. Throughput should be priced separately from volume.
- 2000% → 80% staking APR over 66 days is fantasy. Real DePIN APRs
  are 5–20%.

### 6.2  Proposed structure

Three orthogonal dimensions, priced independently:

**Dimension A — Volume (per GB)**

- Wholesale cost (paid to relays): 8 ¢/GB. Below 12¢ Bell Labs anchor
  because Echelon nodes are mobile/Termux (lower opex, mostly idle
  bandwidth).
- Retail price (charged to clients): 16 ¢/GB. 100% margin funds the
  treasury, dev work, and absorbs payment-channel/settlement overhead.

**Dimension B — Throughput tier (Mbps cap)**

Affordances. Doesn't cost more *bytes* — costs more *concurrency
guarantee*.

- Casual: best-effort, no guarantee. Free with subscription.
- Standard: 5 Mbps committed. +$2/mo subscription markup.
- Pro: 25 Mbps committed. +$8/mo.
- Power: 100 Mbps committed. +$24/mo.

**Dimension C — Service add-ons**

Each is a separate SKU. Buyers can pick-and-mix.

- Outproxy access (clearnet egress): +6 ¢/GB on top of A. The premium
  reflects the legal-ambiguity premium for the operator running the
  exit.
- AI-IDE Pro: $9/mo. Echelon foundation pays Google for Gemini quota,
  user gets unlimited eepsite-edit AI without their own key.
- Eepsite hosting: 50 ¢/eepsite/mo + 16¢/GB egress. Hosts share 70% of
  egress fees; 30% to treasury.
- Priority routing: +$3/mo. Stake-weighted relay selection biases toward
  high-bond, high-uptime nodes.

### 6.3  Subscription bundles (replace current tiers)

Now derived from §6.2 dimensions, not made up:

| Tier | Volume | Throughput | Add-ons | Monthly |
|---|---|---|---|---|
| **Free** | 1 GB | Casual | — | Free (signup grant) |
| **Plus** | 50 GB | Standard | — | $10 |
| **Privacy** | 200 GB | Pro | Outproxy + 1 eepsite | $25 |
| **Operator** | 1 TB | Power | Outproxy + 5 eepsites + AI-IDE Pro | $79 |

Each tier's number is derived from `volume × 0.16 + throughput markup +
add-on costs` plus a 10% bundle discount. Show the math in the UI.

**Crypto pricing**: peg to USD. RTD displayed at current oracle price;
SOL/USDC at spot. No more arbitrary RTD-prices that drift with the
token.

### 6.4  The "exotic services" angle

User specifically called this out — *"if it's sexy enough we can make
exotic services and charge for them... we have an AI IDE for eepsites."*

Concrete monetisable wedges, ranked by "obvious-to-build":

1. **AI-IDE-as-a-service** (already mostly built — needs the hosted-key
   fallback). Subscription. Value: keeps casual users from needing a
   Gemini key. **Margin: high** — AI usage is sub-linear in subscribers.
2. **Eepsite hosting marketplace**: Echelon-discovered eepsites where
   the host opts into the hosting registry, gets featured, splits
   revenue with the foundation. Value: solves the "how do you find a
   good eepsite" cold-start problem. **Margin: medium** — split with hosts.
3. **Paid eepsite memberships**: a host can mark their site as
   subscriber-only; readers pay the host directly via Echelon
   credentials. Echelon takes a small fee. **Margin: low per-tx but
   recurring.**
4. **Priority routing tickets**: a small premium for stake-weighted
   relay selection that biases toward higher-uptime / higher-bond nodes.
5. **Cover-traffic-as-a-service**: rich users pay extra to get cover
   traffic mixed with their real traffic, increasing their anonymity set
   without slowing them down. Direct copy of HOPR's `Cover Traffic
   Nodes` mechanic.
6. **Bandwidth-pool rental for AI-data scrapers**: corporate buyers (the
   Grass.io demand side) pay flat-fee for short-term bursty clearnet
   bandwidth via Echelon's outproxy network. Highest-margin product;
   will need light KYC for the corporate side.

❓ **Open** for the user: which of these are v1, v2, v3? My recommendation:
v1 = subscription bandwidth + AI-IDE-as-a-service + paid eepsite
memberships. v2 = eepsite marketplace + priority routing. v3 = enterprise
bandwidth-pool rental.

---

## 7. Sybil resistance — the actually hard problem

The threat: an adversary spins up N fake relay nodes, all controlled,
all signing each other's receipts, all claiming maximum emissions.

### 7.1  Defence stack (combine, don't pick one)

1. **Capital-bonded entry**. Min bond: 100 RTD per relay slot. Bond is
   slashed on provable cheating. Sybil cost = N × 100 RTD.
2. **Saturation curve**: per-node reward `R(s)` is concave in stake `s`.
   Past the saturation point, R(s) grows < linearly. Implication:
   spreading 10K RTD across 100 nodes pays *less* than 1 saturated node.
   Forces real diversity. (Math copied from Nym's Reward Sharing.)
3. **Cross-check sampling**: 1% of submitted receipts are checked against
   i2pd's transit-tunnel logs. Discrepancy > X% → slash.
4. **Plausibility caps** (§5.2): hard ceiling per (relay, peer, epoch).
5. **Reputation half-life**: relays accrue uptime score over time.
   Reward weight = `f(stake) × g(uptime)`. New nodes earn reduced rewards
   until proven. Slows down sybil farms that need to ramp up fast.
6. **Coconut credentials on the client side**: clients can't be sybiled
   to inflate demand because the credentials are scoped to actual
   payments.

### 7.2  Open: identity layer

❓ Should Echelon use phone-attestation (Solana Mobile's `seed-vault`
on Saga/Seeker), Worldcoin-style proof-of-personhood, or pure
pseudonymous + capital-bond?

Recommendation: **pure pseudonymous + capital-bond for v1**. Avoid
coupling identity to the network. PoP options can be added in v2 as
signed attestations that *boost* a relay's uptime score, not as a
gating requirement.

---

## 8. Token model (RTD specifically)

### 8.1  Supply

- **Total supply**: 100,000,000 RTD (cap). Fixed.
- **Initial allocation** (proposal):
  - 40% — Emission pool (relayed-byte rewards over 8 years, decaying)
  - 25% — Treasury (operations, grants, ecosystem)
  - 15% — Team + advisors (4-yr vest, 1-yr cliff)
  - 12% — Public sale / liquidity
  - 5% — Initial relay-bond seeding (lent at 0% to early operators)
  - 3% — Foundation reserve

### 8.2  Emission

- 40M RTD over **8 years**, exponential decay so first-year emission
  ≈ 30% of total emission, last-year ≈ 1%.
- Emission rate per epoch fixed by program; per-relay share = their
  saturation-curve-weighted attested-byte fraction.

### 8.3  APR

Dynamic, derived from emission ÷ staked-bond. Honestly modelled:
target ≈ 5–15% APR after first year. Way below the current
`APR_DECAY_DATA` curve (2000% → 80%) which would be either a death
spiral or pure inflation theatre. Update `data.ts` accordingly when this
ships.

### 8.4  Sinks (deflationary pressure)

Without sinks, emission inflates RTD to zero. Sinks:

- All client subscription payments in RTD are partially **burned** (e.g.
  20% of RTD denominated payments).
- Eepsite hosting fees in RTD: 30% to treasury (above), of which half
  is burned.
- Slashing: slashed bonds go to the burn pool, not to the slasher.

### 8.5  Stablecoin lane

Clients can pay in USDC. The treasury market-buys RTD on a DEX with the
USDC (or holds USDC for opex), and uses the RTD to pay relays. Two
parallel pricing models:

- "RTD-native" path: client pays RTD, relay paid RTD. Subject to RTD
  price volatility for both sides.
- "USDC-routed" path: client pays USDC, relay paid USDC equivalent of
  their byte-share. Stable for both sides; treasury absorbs RTD market
  risk.

❓ **Open**: which is the default UX? Recommendation: USDC-routed default
for casual users; RTD-native opt-in for power users who hold RTD.

---

## 9. The Termux / mobile reality

Most prior systems assume always-on residential nodes. Echelon's primary
operator profile is **smartphone running i2pd in Termux**. This changes
the math:

- **Churn is the norm**, not the exception. Phones go to sleep, lose
  signal, get force-killed by the OS. The reward formula needs to use a
  *measured-uptime-over-window* metric, not a binary "online now" check.
- **Battery economics**: if running an Echelon node visibly drains a
  phone's battery, users churn. Need a "low-power mode" (~50 KB/s cap,
  rare wakeups) as the default for mobile.
- **Bandwidth caps**: mobile carriers throttle/charge for heavy data.
  The default mobile node should track carrier-data vs Wi-Fi separately
  and refuse transit while on cellular by default.
- **Background-execution permissions**: Android increasingly restricts
  background processes. Termux's RUN_FOREGROUND helps, but UX matters —
  the app needs to make the trade explicit ("keep Echelon running in
  the background to earn RTD" with a clear toggle).

This is **distinctive**. None of HOPR / Nym / Orchid / Mysterium target
mobile-as-primary. Helium does, but for IoT hotspots not relay nodes. We
have a real differentiation here if we get the mobile node UX right.

---

## 10. What gets built first (revised Phase D plan)

The original ROADMAP D.1–D.5 needs to be re-sequenced based on this design:

### D.0 — Spec freeze ✅ (this doc, after user sign-off)

Acceptance: this doc reviewed + open-questions answered.

### D.1 — Receipt format library (Rust + TS)

- `programs/echelon-receipts/` Rust crate: `EchelonReceipt` type, encode,
  decode, signature verify, domain separator, plausibility caps as
  constants.
- `hooks/relayReceipts.ts` TS port for client-side construction.
- Unit tests against deterministic vectors (sign+verify round-trip,
  reject malformed, reject over-cap byte count).

### D.2 — Daemon receipt issuer

- `scripts/relay_attestor.py` long-running loop:
  - Hooks into i2pd's transit-tunnel events (via web console scrape +
    eventual i2pcontrol JSON-RPC).
  - For each transit tunnel completed, identifies the upstream peer
    via i2pd's NetDB router-info, requests countersignature via small
    Echelon-protocol message inside an I2P stream, signs locally.
  - Persists receipts to `~/.echelon/receipts/` until claimed.
- Pytest covers: receipt issued → countersigned → stored, plausibility
  cap enforced before signing, clock-skew tolerance.

### D.3 — Anchor program: relay-claim

- `programs/relay-claim/`. Instructions:
  - `bond_relay(amount)` — escrow stake.
  - `claim_relay(merkle_root, total_bytes, epoch)` — burns Merkle proof
    of receipts, mints emission proportional to bytes, capped by bond.
  - `slash_relay(receipt_a, receipt_b)` — anyone can submit two
    conflicting receipts (same epoch + (relay, peer) but different
    byte_count) to trigger slashing of the misbehaving relay's bond.
  - `withdraw_bond(amount)` — after a cooldown (e.g. 14 days).
- Tests: bond + claim happy path, replay rejected, double-spend slashing
  pays the slasher's gas back, bond saturation curve correct.

### D.4 — Devnet integration

Two daemons on devnet exchange receipts, submit batched claim, RTD
minted. `scripts/devnet-smoke.sh` runs the full loop in CI.

### D.5 — Coconut credentials for clients

❓ Open whether to do this now or in v2. My recommendation: v1 ships
RTD-native + USDC-routed payments without anonymous credentials
(clients are pseudonymous via wallet keys, payment is on-chain). v2
adds Coconut credentials for the bandwidth-purchase flow. This way v1
can ship faster; v2 hardens anonymity.

---

## 11. Open product questions for the user

Tagged inline as `❓` above — collated here for explicit decision:

1. **Receipt liveness on peer-offline** (§5.3): allow late
   countersignature within next epoch?
2. **Plausibility cap values** (§5.2): need to model with real i2pd
   transit data. Simulate with Nym's reward sim fork?
3. **Identity layer** (§7.2): pure pseudonymous v1, or PoP attestation?
4. **Default payment lane** (§8.5): USDC-routed default or RTD-native?
5. **Exotic services v1 scope** (§6.4): which 3 of 6 to ship first?
6. **Coconut credentials timing** (§D.5): v1 or v2?

---

## 12. References

[tor-blog-2023]: https://blog.torproject.org/tor-network-community-health-update/
[onion-payment-2020]: https://www.researchgate.net/publication/342932302_A_Fair_and_Anonymous_Payment_System_for_the_Onion_Relays
[hopr-por]: https://docs.hoprnet.org/core/proof-of-relay
[hopr-tickets]: https://docs.hoprnet.org/core/tickets-and-payment-channels
[hopr-prob]: https://docs.hoprnet.org/core/probabilistic-payments
[edinburgh-rsm]: https://www.research.ed.ac.uk/en/publications/reward-sharing-for-mixnets
[nym-sim]: https://github.com/nymtech/rewardsharing-simulator
[nym-coconut]: https://medium.com/nymtech/nyms-coconut-credentials-an-overview-4aa4e922cd51
[orchid-docs]: https://docs.orchid.com/en/latest/
[bell-labs-bw]: https://www.nokia.com/bell-labs/publications-and-media/publications/monetizing-spare-bandwidth-the-case-of-distributed-vpns/
[grass-faq]: https://grass-foundation.gitbook.io/grass-docs/introduction/faq
[solana-depin-2025]: https://blog.syndica.io/deep-dive-solana-depin-december-2025/

- HOPR proof-of-relay docs: https://docs.hoprnet.org/core/proof-of-relay
- HOPR tickets + payment channels: https://docs.hoprnet.org/core/tickets-and-payment-channels
- HOPR probabilistic payments: https://docs.hoprnet.org/core/probabilistic-payments
- Edinburgh "Reward Sharing for Mixnets": https://www.research.ed.ac.uk/en/publications/reward-sharing-for-mixnets
- Nym reward simulator (fork target): https://github.com/nymtech/rewardsharing-simulator
- Nym Coconut credentials overview: https://medium.com/nymtech/nyms-coconut-credentials-an-overview-4aa4e922cd51
- Orchid docs: https://docs.orchid.com/en/latest/
- Nokia Bell Labs "Monetizing Spare Bandwidth" (12 ¢/GB anchor): https://www.nokia.com/bell-labs/publications-and-media/publications/monetizing-spare-bandwidth-the-case-of-distributed-vpns/
- Tor Project on relay-incentivisation tradeoffs (Nov 2023): https://blog.torproject.org/tor-network-community-health-update/
- "A Fair and Anonymous Payment System for Onion Relays" (2020): https://www.researchgate.net/publication/342932302_A_Fair_and_Anonymous_Payment_System_for_the_Onion_Relays
- Grass docs: https://grass-foundation.gitbook.io/grass-docs/introduction/faq
- Syndica "Deep Dive: Solana DePIN" Dec 2025: https://blog.syndica.io/deep-dive-solana-depin-december-2025/
