# Echelon

**The first mobile-first I2P browser, eepsite IDE, and privacy meshnet — all in one installable PWA.**

Browse the invisible internet. Build and publish private sites with AI assistance and real git version control. Run your own I2P node. Defend against surveillance. All from your phone or laptop.

[![CI](https://github.com/greywolf42069/echeloni2p/actions/workflows/ci.yml/badge.svg)](https://github.com/greywolf42069/echeloni2p/actions/workflows/ci.yml)
[![Deploy](https://github.com/greywolf42069/echeloni2p/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/greywolf42069/echeloni2p/actions/workflows/deploy-pages.yml)
[![Tests](https://img.shields.io/badge/tests-1%2C235%20passing-brightgreen)]()
[![PWA](https://img.shields.io/badge/PWA-22%2F22%20audit-brightgreen)]()

---

## What Is Echelon?

Echelon is a full-stack privacy platform that combines:

- **I2P Browser** — Multi-tab browser for .i2p eepsites with smart routing, privacy indicators, and per-site JavaScript toggles
- **AI-Powered IDE** — Build eepsites with an AI assistant that sees your git state, file tree, and commit history
- **Eepsite Hosting** — Publish sites to I2P with one button — files go from your browser to your local i2pd node
- **Privacy Defenses** — Laboratory-grade HTML sanitizer, SSRF/egress blocking, website fingerprinting defense, and real-time threat filtering
- **Solana Integration** — Wallet connection, USDC subscriptions, token balance tracking, and RTD swap (pre-launch)
- **Network Intelligence** — Real i2pd telemetry, auto-diagnostics via Network Doctor, Yggdrasil NAT fallback, and configurable outproxy

No accounts. No servers. No middlemen. Your sites live on your hardware.

---

## I2P Browser

The first real I2P browsing experience in a mobile app.

| Feature | Description |
|---------|-------------|
| **Multi-tab browsing** | Open multiple eepsites simultaneously with tab management |
| **Smart address bar** | Auto-detects `.i2p` sites, clearnet (via outproxy), and search queries |
| **Fetch pipeline** | Real page fetching through your local i2pd HTTP proxy (127.0.0.1:4444) |
| **Privacy indicator** | Visual hop-visualizer showing your routing path (your device → i2pd → 3 hops → eepsite) |
| **Smart error pages** | 7 distinct failure reasons with actionable recovery buttons |
| **Per-site JS toggle** | Lock specific eepsites to no-JS mode for maximum privacy |
| **Eepsite directory** | Curated homepage with 30+ known-good eepsites organized by category |
| **Search via notbob.i2p** | Built-in search delegation to I2P's search engine |
| **Tab persistence** | Optional session restore (off by default for privacy) |
| **Swipe gestures** | Swipe left/right to switch tabs, pull-to-refresh |
| **Bookmarks** | IndexedDB-backed, user-editable bookmark system |

### Privacy Guarantees

Every page loaded through the browser is server-side sanitized:

- `<script>` tags stripped
- Event handlers (`on*`) removed
- Clearnet images, CSS `url()`, and `@import` blocked
- `<iframe>`, `<meta refresh>`, SVG scripts eliminated
- CSP injected: `script-src 'none'; connect-src 'none'`
- In-network resources rewritten to proxy path
- ~80 adversarial payloads tested (mXSS, encoding tricks, malformed HTML)

See [docs/security-invariants.md](./docs/security-invariants.md) for the full test-mapped invariant table.

---

## AI-Powered Eepsite IDE

A full in-browser development environment with AI assistance.

### Editor Features

- **File tree** — Browse, create, rename, and delete files in your eepsite
- **Code editor** — Syntax-highlighted editing with live preview
- **AI assistant** — Powered by Google Gemini (BYOK) or hosted EepGen. The AI has live context of:
  - Your current file content
  - Recent git commits
  - Uncommitted changes
  - Full project knowledge base (architecture, security model, troubleshooting)
- **Template marketplace** — 6 free templates + premium packs ($19 USDC) to start from
- **Eepsite export** — One-tap ZIP download of your eepsite source code

### Real Git Integration

Every eepsite gets a proper isomorphic-git repository running in-browser:

- **Commit history** — View and restore previous versions
- **Diff viewer** — See exactly what changed before committing
- **Git panel** — Stage, commit, and manage changes without leaving the IDE
- **AI sees git state** — The assistant knows your recent commits and uncommitted changes

### Publishing

One button. That's it.

```
Browser IDE → [Publish] → Sync Daemon (127.0.0.1:7071) → i2pd → Live on I2P
```

- Background publish queue survives daemon outages
- Size caps: 4 MB/file, 64 MB/site
- Files served by your local i2pd within seconds

---

## Network & Privacy Stack

### SSRF/Egress Defense — 19 Vectors Blocked

The sync daemon blocks every known deanonymization vector:

| Category | Blocked |
|----------|---------|
| Loopback | `127.0.0.1`, `localhost`, `::1` |
| Private IPv4 | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` |
| CGNAT | `100.64.0.0/10` |
| Cloud metadata | `169.254.169.254`, `metadata.google.internal` |
| IPv6 | Loopback, ULA, link-local |
| Schemes | `file://`, `gopher://`, `ftp://` |
| Lookalikes | `.i2p`-mimicking hostnames |
| Redirects | Clearnet redirects rejected, loops bounded |
| Only allowed | `*.i2p` and `*.b32.i2p` |

### Website Fingerprinting Defense

Tamaraw-style traffic regularization:

- Fixed-size cells with length bucketing
- Constant-rate emission scheduler
- Observable shape is pure function of anonymity-set bucket
- Simulated adversary: 5 sites collapse to 1 bucket (accuracy ≤ 0.2)
- Honest caveat: single-device pacing is a building block, not full network-side WF resistance

### Threat Filtering

Real DNS filter lists, not simulated:

- **StevenBlack**, **Phishing Army**, **EasyList** subscriptions
- Daemon-side filtering proxy on `127.0.0.1:7072`
- Blocked-event ring buffer with monotonic sequence numbers
- Live UI feed polling every 5 seconds
- 58 tests for filter management alone

### Network Doctor

Auto-diagnoses common I2P issues:

- Carrier-grade NAT detection → suggests Yggdrasil fallback
- i2pd connectivity checks
- Tunnel health monitoring
- Bandwidth and latency diagnostics

---

## Solana Integration

### Wallet

- **Phantom**, **Solflare**, **Mobile Wallet Adapter** (Saga/Seeker)
- Real SOL + SPL token transfers via `@solana/web3.js`
- Token balance tracking with live RPC health monitoring

### Subscriptions

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Basic I2P browsing, 3 eepsites, BYOK AI |
| **Plus** | $9/mo | Unlimited eepsites, hosted EepGen (100K tokens/day), premium templates |
| **Privacy** | $29/mo | Everything in Plus + 1M EepGen tokens/day, priority support |
| **Operator** | $99/mo | 5M EepGen tokens/day, foundation node eligibility |

All subscription payments contribute to your airdrop weight for the future RTD token distribution.

### RTD Swap (Pre-Launch)

Robinhood-style swap interface for RTD/SOL trading via PumpSwap AMM. Currently in honest pre-launch state — all inputs disabled, clear "Coming Soon" messaging. No dead interactive elements.

---

## Installation

### One-Liner Install (Recommended)

**Termux (Android):**
```bash
curl -sSL https://raw.githubusercontent.com/greywolf42069/echeloni2p/main/install-termux.sh | bash
```

**Desktop (macOS / Linux):**
```bash
curl -sSL https://raw.githubusercontent.com/greywolf42069/echeloni2p/main/install.sh | bash
```

Both scripts:
1. Install i2pd + Python + dependencies
2. Clone Echelon and set up the sync daemon
3. Start everything immediately
4. Configure boot persistence (auto-start on reboot)

### Manual Setup

```bash
git clone https://github.com/greywolf42069/echeloni2p.git
cd echeloni2p
npm install
npm run dev
```

Open http://localhost:3000 and connect a Solana wallet (optional for free tier).

### PWA Install

Once deployed to any HTTPS host, Echelon installs as a PWA:

- **Android**: Chrome → "Add to Home Screen" → installs like a native app
- **iOS**: Safari → "Add to Home Screen" → full-screen standalone mode
- **Desktop**: Chrome/Edge → "Install Echelon" in address bar

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 ECHELON PWA (React + Vite)           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ I2P      │  │ Solana   │  │ AI IDE           │  │
│  │ Browser  │  │ Wallet   │  │ (Git + EepGen)   │  │
│  │ +fetch   │  │ +MWA     │  │ +Knowledge       │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │             │
└───────┼──────────────┼─────────────────┼─────────────┘
        │              │                 │
   ┌────▼─────┐   ┌────▼─────┐    ┌─────▼──────────┐
   │ i2pd     │   │ Solana   │    │ Sync Daemon    │
   │ HTTP     │   │ RPC /    │    │ (Python,       │
   │ Proxy    │   │ Anchor   │    │  stdlib only)  │
   │ :4444    │   │ Programs │    │ :7071          │
   └──────────┘   └──────────┘    └───────┬────────┘
                                          │
                              ┌───────────▼──────────┐
                              │ i2pd + Yggdrasil     │
                              │ (I2P meshnet)        │
                              │ Serve eepsites       │
                              └──────────────────────┘
```

### Sync Daemon

Pure Python, zero runtime dependencies (stdlib only). Endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Daemon health check |
| `/list` | GET | List published eepsites |
| `/publish` | POST | Publish eepsite files |
| `/delete` | DELETE | Remove an eepsite |
| `/browse` | GET | Fetch and sanitize I2P pages |
| `/i2pd/stats` | GET | Real i2pd telemetry |
| `/i2pd/config` | GET/POST | i2pd configuration R/W |
| `/i2pd/outproxy` | GET/POST | Outproxy management |
| `/filters/*` | GET/POST | Threat filter management |
| `/filters/events` | GET | Blocked-event stream |
| `/eepgen/*` | POST | Hosted AI (EepGen) proxy |

---

## Testing

Echelon has **1,235 tests** across three suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| **Vitest** (frontend) | 424 | Components, hooks, build guards, PWA audit |
| **Pytest** (backend) | 789 | Sync daemon, sanitizer, SSRF, auth, i2pd integration |
| **PWA audit** | 22 | Manifest, icons, service worker, CDN-free build |

Run locally:
```bash
# Frontend tests
./node_modules/.bin/vitest run

# Backend tests
python3 -m pytest scripts/tests/ -v

# PWA audit
node scripts/pwa_audit.mjs

# Type check
./node_modules/.bin/tsc --noEmit

# Build
./node_modules/.bin/vite build
```

---

## Security

See [SECURITY.md](./SECURITY.md) for our coordinated disclosure policy.

### What We Defend Against

- **Deanonymization** — HTML sanitizer blocks all clearnet leak vectors
- **SSRF/Egress** — 19 attack vectors blocked in the sync daemon
- **Content injection** — CSP enforcement, script stripping, event handler removal
- **Website fingerprinting** — Tamaraw-style traffic regularization
- **Local attacks** — Loopback-only bind, optional auth token, CSRF protection
- **Supply chain** — Pure-stdlib daemon, zero CDN in production build

### What We Don't Defend Against

See [docs/non-goals.md](./docs/non-goals.md) for an honest accounting:

- Global passive adversary traffic confirmation
- Compromised/rooted devices
- Unsafe wallet behavior
- I2P or i2pd core vulnerabilities (report upstream)

Every privacy claim maps to a named test in [docs/security-invariants.md](./docs/security-invariants.md). Claims are exactly one of: **SHIPPED+TESTED**, **LIVE-VERIFIED**, **DESIGN-ONLY**, or **NON-GOAL**.

---

## Roadmap

### v0.2 (Current) — Token Economy Release ✅

- RTD Swap page (PumpSwap AMM integration)
- Eepsite export (ZIP download)
- Solana connection health monitor
- Deployer wallet infrastructure
- 1,235 tests passing

### v0.1 (Shipped) — Core Platform ✅

- I2P browser with multi-tab, smart routing, fetch pipeline
- AI IDE with real git integration
- Eepsite hosting with sync daemon
- HTML sanitizer + SSRF defense
- Website fingerprinting defense
- Threat filtering with real DNS lists
- Solana wallet + USDC subscriptions
- PWA installable on all platforms
- One-liner install scripts with boot persistence

### Future — Proof-of-Relay & Token Launch

- RTD token launch on PumpSwap
- Proof-of-Relay receipt protocol
- Retroactive airdrop distribution
- Android APK + Solana dApp Store listing

See [ROADMAP.md](./ROADMAP.md) for the full breakdown.

---

## Documentation

| Doc | Description |
|-----|-------------|
| [ROADMAP.md](./ROADMAP.md) | Full development roadmap with acceptance criteria |
| [AUDIT.md](./AUDIT.md) | Launch readiness audit with test results |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [SECURITY.md](./SECURITY.md) | Vulnerability reporting policy |
| [docs/security-invariants.md](./docs/security-invariants.md) | Privacy claims → test mapping |
| [docs/threat-model.md](./docs/threat-model.md) | Threat model and adversary analysis |
| [docs/non-goals.md](./docs/non-goals.md) | What we don't defend against |
| [docs/mobile-termux.md](./docs/mobile-termux.md) | Android + Termux setup guide |
| [docs/networking.md](./docs/networking.md) | Architecture and networking |
| [docs/release.md](./docs/release.md) | Release and deployment procedures |
| [docs/economy/design-v2.md](./docs/economy/design-v2.md) | Token economy design |

---

## Contributing

The highest-leverage work right now:

- Polish the end-to-end "new user creates their first eepsite with AI + git" flow
- Improve Termux onboarding and error surfacing
- Better empty states and guidance inside the IDE
- Documentation and demo materials

---

## License

All rights reserved during early development / pre-launch phase.

---

**Built for the people who want the internet to have corners you can't see from the main road.**
