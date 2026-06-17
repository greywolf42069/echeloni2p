# Echelon v0.1.0-beta — release notes

**Date**: 2026-05-28

## What this is

Echelon is a mobile-first I2P browser, eepsite hosting platform, and
AI-assisted website IDE — built for the Solana dApp Store. Free tier
+ paid USDC subscription tiers. **No token at v0.1**; RTD launches on
Raydium in v0.2 with retroactive airdrop weighted by v0.1 subscription
history.

This is the first beta. The web app is feature-complete; the Android
APK requires operator scaffolding per `docs/release.md`.

## What's in v0.1

### Privacy product
- Multi-tab I2P browser with route classification (eepsite / clearnet
  via outproxy / search), per-tab history, user-editable bookmarks,
  per-site JS toggle, smart error pages keyed to 7 failure reasons,
  eepsite directory homepage with curated bookmarks, search delegation
  to notbob.i2p, opt-in tab persistence
- Real ad/threat filter using StevenBlack/EasyList subscriptions, daemon
  proxy on 127.0.0.1:7072, in-memory event ring buffer, live UI feed
- Real i2pd telemetry (peer count, transit volume, tunnel counts,
  bandwidth) scraped from i2pd's web console
- Outproxy configuration (clearnet bridge through user's own i2pd) with
  locked-loopback bind safety
- Bandwidth class + share % + transit on/off configurable from UI

### IDE + hosting
- Eepsite IDE with file tree, code editor, AI assistant (BYOK Gemini
  free tier; Plus tier hosted EepGen via DeepInfra Gemma 3 4B)
- 6 designed templates (3 free + 3 premium) with full HTML+CSS;
  premium pack unlocks for $19 USDC one-time
- Eepsite hosting via local sync daemon (Termux on Android), real
  publish flow with size caps (4 MB/file, 64 MB/site)

### On-chain
- Real SOL + SPL transfers via wallet adapter
- USDC subscription system: Plus $9 / Privacy $29 / Operator $99 per
  month, with airdrop weight tracking on every payment
- Subscription state mirrors the (future) Anchor account layout 1:1
  for trivial v0.2 migration
- Premium template entitlement tracked per-wallet
- Hosted EepGen daemon endpoint with per-day token quota enforcement

### Foundation
- Honest userData defaults: no fake RTD balance, no fake staking
  rewards, no fake leaderboard. Token-economy UI hidden behind
  featureFlags.tokenEconomy=false.
- v0.1 beta banner across the dashboard
- Devnet/Coming-with-v0.2 banners on token-dependent surfaces
- Single-source-of-truth feature flags with localStorage overrides

## What's not in v0.1

Deferred to v0.2 (gated on v0.1 demonstrating traction):
- RTD token launch on Raydium (custom 100M SPL, $50 SOL initial LP, 6mo
  timelock)
- Proof-of-Relay protocol (signed receipts, daemon attestor, Anchor
  relay-claim program)
- Retroactive airdrop distribution (weighted by v0.1 subscription history
  + Seeker Genesis Token 2x boost)
- Staking, governance, bounties UI (route-guarded in v0.1)

Deferred to v0.5+:
- Distributed EepGen inference (operators host the model)
- Coconut anonymous credentials (replaces wallet-pubkey-as-identity)
- OCTRA payment lane (FHE-on-chain)

## Architecture decisions locked at v0.1

See `docs/economy/design-v2.md` for the full spec. The big pivots:

- **Product before token**: Solana dApp Store ships first with USDC
  subscriptions; RTD launches in v0.2 after real users + traction. Lets
  the token launch with a credible "here's the network" narrative
  instead of speculation-only.
- **Raydium permissionless CLMM**, not pump.fun: pump.fun's fixed 1B
  supply + revoked mint authority were architecturally incompatible
  with our emission economics.
- **100M cap RTD**, not 1B. 1M LP / 50M emission pool / 10M airdrop /
  5M ops / 5M cross-chain reserve / 29M public liquidity reserve.
- **Aggressive APR choke** at v0.2 launch (decay_factor=1.5, year-1
  ~50-200% APR target) to protect price stability.

## Test count + CI

**852 tests passing**:
- 353 vitest (TS / React)
- 419 pytest (Python sync daemon + i2pd integration + auth + eepgen +
  threat filter + size caps + outproxy)
- 80 simulator (echelon-rewards)

CI (GitHub Actions) green on every commit: tsc --noEmit, vitest run,
vite build, pytest scripts/tests/.

## Tags

- `v0.1.0-beta` — this release

## Operator next steps

Follow `docs/release.md` Phase H to scaffold the Android build,
sign the APK, and submit to the Solana dApp Store. Estimated review
time on first submission: 3-7 days.

## Acknowledgments

- [i2pd](https://i2pd.website) — the real I2P implementation Echelon
  rides on
- [Solana Mobile](https://solanamobile.com) — Saga / Seeker hardware +
  dApp Store
- [DeepInfra](https://deepinfra.com) — hosted Gemma 3 4B for EepGen
- The Nym mixnet team — reward-sharing simulator we forked
- [Streamflow](https://streamflow.finance) — the LP timelock plan for v0.2
