# Echelon Security Model

This is the honest, end-to-end account of what Echelon protects, what it
doesn't, and where the trust boundaries are. No marketing. If you're
betting your anonymity on this, read it.

## The stack, by layer

```
┌─────────────────────────────────────────────────────────┐
│ Echelon app (PWA / Capacitor)   — UI, never touches net  │
│   talks ONLY to 127.0.0.1 (your own daemon)              │
├─────────────────────────────────────────────────────────┤
│ Echelon sync daemon (Python, on-device)                  │
│   • fetches eepsites THROUGH i2pd                        │
│   • SANITIZES every eepsite server-side (the safety      │
│     membrane) before the app ever sees the HTML          │
│   • never makes a clearnet request on the user's behalf  │
│     except the explicit, user-enabled outproxy path      │
├─────────────────────────────────────────────────────────┤
│ i2pd (C++)        — the anonymous routing layer (I2P)    │
│   garlic-routed, multi-hop, no exit by default           │
├─────────────────────────────────────────────────────────┤
│ Yggdrasil (optional) — NAT-bypass transport assist       │
│   only carries i2pd's peer connections; sees ciphertext  │
└─────────────────────────────────────────────────────────┘
```

## What Echelon protects against

- **Clearnet IP leak from hostile eepsite content.** The #1 deanonymization
  vector for I2P browsers: an eepsite embeds `<img src=https://tracker/...>`
  and your browser loads it over clearnet, revealing your real IP. Echelon's
  daemon strips every such vector server-side before rendering. See
  [sanitizer-threat-model.md](./sanitizer-threat-model.md).
- **Script execution in eepsite content.** All `<script>`, all `on*`
  handlers, all `javascript:`/`vbscript:` URLs are removed; a strict CSP
  (`script-src 'none'; connect-src 'none'`) is injected as a second layer;
  the render iframe is sandboxed without `allow-same-origin`.
- **The app phoning home.** The PWA makes zero third-party requests on load
  (verified by a CI guard). Everything is bundled; nothing is fetched from
  a CDN. The only outbound connections are to your own 127.0.0.1 daemon and,
  when you connect a wallet, the Solana RPC you chose.
- **Drive-by from another local app** hitting the daemon: optional per-device
  shared-secret auth (`ECHELON_REQUIRE_AUTH=1`).
- **Wallet identity spoofing on paid features:** hosted-EepGen requires an
  ed25519 signature proving you hold the wallet's key.

## What Echelon does NOT protect against (be honest with yourself)

- **I2P's own anonymity limits.** Echelon rides on I2P; it inherits I2P's
  threat model. A global passive adversary doing traffic correlation, or a
  large fraction of malicious routers, can degrade I2P anonymity. Echelon
  doesn't fix I2P; it makes I2P *usable + safe to render*.
- **Compromised device.** If your phone is rooted/owned, nothing here helps.
- **Outproxy egress.** If YOU enable the clearnet outproxy, traffic to that
  clearnet site exits through an exit relay — that relay sees the request
  (not your IP, but the content + destination). This is opt-in and clearly
  labeled. Don't put secrets through an outproxy.
- **What you publish.** If you host an eepsite with your name in it, that's
  on you. Echelon hosts your files; it can't un-dox your content.
- **Wallet ↔ identity linkage (v0.1).** Subscriptions are paid from a Solana
  wallet, so the chain knows "wallet X paid for Echelon." v0.2's planned
  Coconut credentials make this unlinkable; v0.1 is pseudonymous, not
  anonymous, at the payment layer. Use a fresh wallet if that matters to you.
- **Yggdrasil metadata.** If you use the Yggdrasil NAT-bypass, your Yggdrasil
  peers see that you're a Yggdrasil node (not what you browse — they carry
  i2pd ciphertext). It's a transport assist, not an anonymity layer.

## Trust boundaries (who can see what)

| Party | Sees |
|---|---|
| Echelon app | Only what you type + sanitized HTML from your own daemon |
| Your daemon | The eepsites you visit (it fetches + sanitizes them); runs on YOUR device |
| i2pd peers (relays) | Encrypted garlic messages; no single relay sees source+dest+content |
| Eepsite operator | A request from an I2P destination — NOT your IP (and no tracking pixel, thanks to the sanitizer) |
| Outproxy relay (opt-in) | The clearnet request content + destination, not your IP |
| Yggdrasil peers (opt-in) | That you're on the mesh; i2pd ciphertext only |
| Solana chain | That a wallet paid for a subscription (v0.1) |

## Verification

The security-critical paths are tested as hostile boundaries, not happy
paths:
- `scripts/tests/test_sanitizer_validation.py` — adversarial corpus
  (mXSS, encoding tricks, malformed tags, every URL-bearing attribute).
- `scripts/tests/test_html_sanitizer.py` — per-vector coverage.
- `scripts/tests/test_i2p_integration.py` — deterministic i2pd replay.
- `scripts/tests/test_i2p_live.py` — live-network ground truth, asserts the
  no-clearnet / no-script invariants hold on real eepsite content.
- `tests/build/cdnFree.test.ts` — proves zero third-party requests ship.

If you find a hole, that's a real bug — file it.
