# Echelon Anonymity Value-Add (beyond stock I2P)

I2P gives us garlic-routed, multi-hop, no-default-exit transport. That's
the floor. This document is the honest engineering plan for what Echelon
adds **on top** of I2P to push toward serious ("spook-level") anonymity —
what's built, what's designed, and the real attack each piece closes. No
hand-waving: every item names the attack and the mechanism, and the built
one is tested.

## The residual attacks I2P does NOT solve

Even with perfect onion/garlic routing, these leak:

1. **Website Fingerprinting (WF)** — a passive observer of your encrypted
   link (ISP, malicious first hop) classifies *which* eepsite you loaded
   from the traffic *shape* (packet sizes + timing). Documented as the #1
   practical break against hidden services; deep-learning classifiers hit
   90%+ accuracy on undefended traffic.
2. **Flow correlation / end-to-end timing** — an adversary seeing both
   ends correlates request/response timing to link client↔destination.
3. **Per-session linkability** — reusing the same tunnels/destination keys
   across eepsites lets a relay stitch your browsing into one profile.
4. **Intersection / disclosure over time** — repeated visits narrow the
   anonymity set.

## Mechanisms

### ✅ 1. Traffic regularization (Tamaraw-style WF defense) — BUILT

**Attack closed:** Website Fingerprinting.
**Mechanism:** `scripts/traffic_regularization.py`. The daemon, when the
user enables the Privacy-tier "padding" option (`/browse?wf=1`), shapes
every eepsite fetch into the Tamaraw regime:
- quantize all data into fixed-size cells,
- pad the cell *count* up to a multiple L (length bucketing),
- emit at a constant inter-cell rate (timing carries no info).

The formal property — and what the tests assert — is that the observable
shape `(cells, padded_bytes, schedule)` is a pure function of the
anonymity-set **bucket**, never of the exact payload length. Many distinct
eepsites collapse into one indistinguishable on-wire shape. Tamaraw's
analysis bounds attacker accuracy by `1/|anonymity set|`; the literature
measures the practical drop as ~91% → ~20–30%.

**Tested:** `scripts/tests/test_traffic_regularization.py` (23 tests),
including the bucket-invariance property, a simulated-adversary test
showing 5 sites collapse to 1 bucket (attacker accuracy ≤ 0.2), the cell
iterator (uniform cell sizes, count = bucket, exact recovery), and the
constant-rate paced emitter (two different lengths in one bucket produce
an identical write sequence + schedule). Live: `/browse?wf=1` frames the
real reg.i2p response.

**Tradeoff lever:** `length_multiple` (L) trades bandwidth overhead for a
bigger anonymity set — the design-v2 "choke" control, surfaced to Privacy/
Operator tiers. `overhead_report()` quantifies the cost for the UI.

**Transport (Sprint C — BUILT):** when `?wf=1`, the daemon no longer just
*reports* the shape — it **frames and pads the actual body** to the bucket
length (`[4-byte BE real-len][sanitized HTML][zero padding]`) and **paces
the cells** at a constant inter-cell interval (`emit_paced`). The browser
client recovers the exact sanitized HTML by unpadding (`X-Echelon-WF-Framed:
tamaraw-v1`). Pacing time is bounded by `ECHELON_WF_PACING_BUDGET_S` so a
large page can't stall for minutes — the dominant WF signal (cell sizes +
count) is always exact; only the tail timing degrades past the budget.

**WHERE this defends — honest topology note.** A WF adversary observes an
*encrypted link*. There are two relevant links:
- **i2pd ↔ eepsite** (the I2P path) — this is the link a network WF
  adversary watches. Regularizing the daemon→client stream only defends
  this link when the daemon is **remote** from the client (e.g. a home/VPS
  daemon you browse from your phone), so the regularized stream rides the
  I2P path. This is the strong deployment.
- **daemon ↔ browser** (localhost, single-device) — on a phone running
  everything locally, pacing localhost bytes does **not** hide the I2P-side
  shape from a network observer; i2pd already framed those packets. Here
  the value is the *building block* (and defense against a local non-root
  observer / other apps), with full network-side WF resistance requiring
  the padding to be applied at the i2pd transport (roadmap: SAM-level
  framing) or the remote-daemon topology above.
This distinction is stated in `docs/privacy-claims.md` and `non-goals.md`
rather than hidden — we don't claim single-device localhost pacing buys
network-side WF resistance it doesn't.

### ◻ 2. Decoy / cover-traffic fetches — DESIGNED

**Attack:** correlating "user typed" → "tunnel activity," and thinning the
anonymity set when you're the only one fetching.
**Mechanism:** the daemon issues low-rate background fetches of random
directory eepsites (from the curated set) so a real fetch hides among
decoys. Reuses the same regularized shape so decoys are indistinguishable
from real loads. Gated to Privacy tier (bandwidth cost) and rate-limited.
**Why not yet built:** needs the pacing wrapper from #1 first, and a
careful decoy-selection policy (bad decoy distributions can *help* a
classifier). Building it before #1's emission layer would be a stub.

### ◻ 3. Per-destination tunnel isolation — DESIGNED

**Attack:** session linkability across eepsites via shared tunnels.
**Mechanism:** i2pd supports per-destination client tunnel pools. Echelon
configures a fresh local destination per eepsite-origin (or per tab) so no
single relay links two of your destinations into one session. Pure i2pd
config + tunnel-manager orchestration — no new crypto.
**Why not yet built:** real but lower-priority than WF; it's an i2pd tunnel
config + lifecycle change, scheduled after #1/#2.

### ◻ 4. Coconut anonymous credentials for payments — DESIGNED (v0.2)

**Attack:** wallet↔identity linkage (the chain knows "wallet X paid for
Echelon"). Already in design-v2 §5.5.
**Mechanism:** replace the on-chain `paid_until` subscription check with
unlinkable Coconut credentials — prove "I paid for Privacy tier" without
revealing which payment. Documented upgrade path; v0.2.

## Honest framing

- This does NOT make Echelon stronger than I2P's core routing — it closes
  the *application/transport-shape* gaps I2P leaves open. A global passive
  adversary with the resources to do full traffic confirmation across the
  network is still out of scope (as it is for Tor + I2P themselves).
- Each mechanism has a measurable property and a test. The WF defense is
  built and its core property is proven; the rest are designed with the
  attack + mechanism named, not vaporware.
- Padding has a real bandwidth cost. It's opt-in (Privacy tier), with the
  overhead surfaced honestly so users choose the privacy/cost point.

## References

- Cai et al., "A Systematic Approach to Developing and Evaluating Website
  Fingerprinting Defenses" (Tamaraw).
- "Toward an Efficient Website Fingerprinting Defense for Tor" (WTF-PAD
  lineage; 91%→20% closed-world).
- Tor circuit-padding framework (state-machine padding) — design influence.
- Danezis et al., "Coconut: Threshold Issuance Selective Disclosure
  Credentials" — payment unlinkability.
