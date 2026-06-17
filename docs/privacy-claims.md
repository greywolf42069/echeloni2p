# Privacy Claims

What Echelon claims — each mapped to a test or marked design-only. Privacy
tools die when they pretend to be magic cloaks. This is armor, with
receipts. Read alongside `docs/non-goals.md`.

## Claims we make (and back with tests)

1. **Echelon blocks clearnet beacon leaks from hostile eepsites.**
   A malicious eepsite cannot deanonymize you by embedding a clearnet
   image/script/font/CSS/iframe/form/redirect. All such vectors are
   stripped server-side before render, and a strict CSP + sandbox are the
   backstop.
   → `scripts/tests/test_security_invariants.py`,
     `test_sanitizer_validation.py` (~80 adversarial payloads),
     verified on real eepsite content in `test_i2p_live.py`.

2. **The eepsite browser never touches clearnet.**
   The fetch path is `.i2p`-only. No localhost, private IP, cloud
   metadata, `file://`, or clearnet host is reachable through it (SSRF
   closed). Clearnet egress is a separate, explicit, opt-in outproxy.
   → `test_security_invariants.py::TestSSRFAndEgressInvariants` (19 vectors).

3. **Echelon improves routing survivability under hostile NAT (CGNAT /
   symmetric).** The Network Doctor detects stalled tunnels + hostile NAT
   and routes i2pd over Yggdrasil.
   → live-verified during development (symmetric NAT → eepsites loaded
     after Yggdrasil); `test_network_doctor.py`.

4. **Echelon reduces website-fingerprinting leakage** (Privacy tier).
   Two distinct claims, separated honestly:
   - **Length bucketing + framing/padding — SHIPPED + TESTED + LIVE.**
     The body is framed (`[4-byte len][data][zeros]`) and padded so the
     on-wire byte count is a function only of the anonymity-set bucket.
     Proven: `test_traffic_regularization.py` bucket-invariance; live
     reg.i2p 21,249 B → 51,200 on-wire (bucket 100).
   - **Constant-rate timing — SHIPPED + TESTED (at the emit layer).**
     `emit_paced` writes one cell per fixed interval. Proven by a
     fake-clock test (`test_emit_paced_records_identical_timestamps_same_bucket`):
     two different same-bucket payloads emit byte-identical AND
     timestamp-identical schedules. **Caveat:** this regularizes the
     stream `emit_paced`/`_send_paced_cells` writes to; full network-side
     WF resistance requires the remote-daemon topology (see
     `docs/anonymity-value-add.md` "WHERE this defends"). On a fully-local
     single-device deployment the i2pd↔eepsite shape is set by i2pd, not
     by localhost pacing — stated, not hidden.
   → `test_traffic_regularization.py` (bucket-invariance, simulated
     adversary bounded to 1/|set|, fake-clock timing, exact-unpad recovery).

5. **The app makes zero third-party requests.**
   No CDN, no analytics beacon, no hosted telemetry. Everything bundled.
   → `tests/build/cdnFree.test.ts`.

6. **Paid features prove wallet ownership, not trust.**
   Hosted-EepGen requires an ed25519 signature over a time-bound challenge;
   you can't claim a wallet you don't control.
   → `test_eepgen_auth.py`.

## Claims that are DESIGN-ONLY (not yet shipped — do not rely on them)

- **Cover/decoy traffic** — designed, gated on the WF pacing layer. Until
  shipped, a same-link observer can still see *that* you fetched, just not
  *which* site (within a bucket). `docs/anonymity-value-add.md` §2.
- **Per-destination tunnel isolation** — designed; reduces cross-site
  session linkability. Not yet wired. §3 + `docs/tunnel-isolation.md`.
- **Unlinkable payments (Coconut)** — designed for v0.2; today the chain
  knows "wallet X paid." §4.
- **WF constant-rate on-wire emission** — the bucketing/padding math + the
  framed body + the constant-rate `emit_paced` scheduler are shipped and
  tested (incl. a fake-clock timestamp-identity test). What remains
  design-only is the **fully adaptive paranoid-mode default** and pushing
  the pacing down to the i2pd transport so single-device deployments get
  network-side timing resistance (today's pacing is at the daemon stream).

## Honest qualifiers (always state these)

- These defenses close the **application + transport-shape** gaps I2P
  leaves open. They do **not** make you invisible to a global passive
  adversary doing full network-wide traffic confirmation — that's out of
  scope for I2P and Tor too.
- Padding has a real bandwidth cost. It's opt-in, with overhead surfaced.
- If your **device** is compromised, none of this helps.
- If you use the **outproxy**, the exit relay sees your clearnet request
  content + destination (not your IP).
- **Solana RPC** activity is not anonymized unless you route + model it
  separately. Connecting a wallet links that wallet to the RPC you chose.
