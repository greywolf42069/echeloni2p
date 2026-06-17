# Per-Destination Tunnel Isolation (design)

**Status: DESIGN-ONLY.** This names the attack and the concrete i2pd
mechanism. No stubbed code ships under this until it's built + tested per
the project bar. Tracked in `docs/anonymity-value-add.md` §3.

## The attack: cross-site session linkability

I2P client tunnels originate from a **local destination** (a keypair +
LeaseSet). By default a client app reuses **one** local destination — and
therefore one set of inbound/outbound tunnels — for everything it fetches.

Consequence: the outbound tunnel's first hop (a relay an adversary may
operate) sees a single LeaseSet making requests to eepsite A, then B, then
C. Even though it can't see *content* or your IP, it can **link** "the same
client visited A, B and C in this session." Over time that browsing graph
is a fingerprint. This is the I2P analogue of Tor's per-circuit stream
isolation problem.

## The mechanism i2pd actually provides

Two real, documented i2pd primitives — no new crypto:

1. **`tunnels.conf` client tunnels with distinct keys.** Each `[section]`
   of type `client` gets its own `keys` file ⇒ its own destination ⇒ its
   own tunnel pool. Spinning N sections = N independent destinations.
   Echelon already manages a marked block in this file
   (`scripts/i2pd_tunnels.py`), so the orchestration surface exists.

2. **SAM v3 sessions.** Each `SESSION CREATE` opens a fresh, ephemeral
   destination with `i2cp.*` options for tunnel-pool sizing. This is the
   cleaner runtime path: create a session per origin, tear it down when the
   tab closes — no config-file churn, true ephemerality. i2pd ships SAM on
   `:7656`.

Either gives the core property: **two eepsite origins never share a local
destination**, so no single relay links them into one session.

## Echelon design

### Isolation key
One ephemeral local destination per **(privacy-session, eepsite-origin)**:
- *origin* = the `.i2p` host (b32 or name). Sub-resources of an origin
  reuse that origin's destination (they're already correlated — same page).
- *privacy-session* = reset on demand ("New identity" button) and on a
  rotation timer for high-risk tiers.

### Rotation by risk tier (ties into the Privacy/Paranoid modes)
| Tier | Policy |
|---|---|
| Standard | shared default destination (today's behavior) — lowest overhead |
| Privacy | one destination **per origin**, reused within the session |
| Paranoid | one **ephemeral** destination per origin, rotated per page-load + on a jittered timer; destroyed on tab close |

Higher isolation costs tunnel-build latency (each new destination must
build a pool) and bandwidth — hence it's tiered, not always-on. The Network
Doctor's tunnel-build health feeds the decision (don't spin 10 destinations
when the network can barely build 3 tunnels).

### Orchestration (SAM path, preferred)
```
on navigate(origin):
    dest = sessions.get(origin)
    if dest is None or expired(dest):
        dest = sam.create_session(origin,
                   inbound_len=3, outbound_len=3,        # i2cp tunnel hops
                   inbound_quantity=2, outbound_quantity=2)
        sessions[origin] = dest
    fetch via dest's local proxy port
on tab_close(origin) or rotate_timer:
    sam.destroy_session(sessions.pop(origin))
```
Bounded pool (LRU evict + hard cap, e.g. 8 live destinations) so a tab-spam
page can't exhaust i2pd tunnel slots — the cap interacts with Doctor health.

### What it does NOT solve
- Does not defeat a global passive adversary correlating timing across all
  N destinations (that's the flow-correlation problem; out of scope, see
  `non-goals.md`).
- Does not help if the eepsite itself fingerprints you at the app layer.
- More destinations = more tunnel-build traffic = a (small) distinct
  signal of "this client isolates" — acceptable, documented.

## Why design-only for now
WF padding (§1) is the higher-priority, higher-leverage defense and is
built. Tunnel isolation is real and scheduled next, but shipping a SAM
session manager + LRU pool + rotation timer + teardown is a multi-file
feature that must come with its own deterministic harness (fake SAM
bridge) and a live test against i2pd's SAM port — same bar as the fetch
path. We specify it fully here so it's not vaporware; we don't fake-ship it.

## References
- i2pd `tunnels.conf` client-tunnel docs; i2pd SAM v3 implementation.
- I2P `i2cp.*` tunnel-length/quantity options.
- Tor stream isolation (`IsolateDestAddr`) — the analogous concept.
