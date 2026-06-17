/**
 * Echelon Project Knowledge Base
 *
 * This module provides a structured knowledge context about the Echelon
 * project that gets injected into the Network Assistant's system prompt.
 * It lets users ask questions about the project, architecture, security
 * model, subscription tiers, I2P integration, and more.
 *
 * Keep this file under ~8K tokens so it fits comfortably in the Gemini
 * system prompt alongside the rest of the assistant instructions.
 */

export const ECHELON_KNOWLEDGE = `
# Echelon Project Knowledge Base

## What is Echelon?

Echelon is a mobile-first I2P browser, eepsite hosting platform, and AI-assisted
website IDE — built for the Solana dApp Store. It lets users browse, create, edit,
and publish private websites on the I2P network, entirely from their own device.

The key innovation: Echelon makes running a real, version-controlled website on I2P
feel normal. It combines a multi-tab I2P browser, a code editor with AI assistance
and real git, and one-click publishing to the I2P network.

## Architecture

Echelon has three layers:

1. **Frontend (React PWA)** — A React 18 + Vite + TypeScript app with Tailwind CSS.
   Runs as a Progressive Web App installable on Android, iOS, and desktop.
   No CDN dependencies — everything is bundled. Service worker for offline support.

2. **Sync Daemon (Python)** — A pure-Python HTTP server (zero pip dependencies)
   running on 127.0.0.1:7071. Bridges the browser to the local filesystem so
   i2pd can serve eepsites. Handles publishing, threat filtering, i2pd config,
   network diagnostics, and AI proxy (EepGen).

3. **I2P Network Layer (i2pd + Yggdrasil)** — The actual I2P router (i2pd) runs
   locally on the user's device. On Android, it runs via Termux. Yggdrasil
   provides NAT traversal for carrier-grade NAT (most phone networks).

## I2P Integration

- The browser routes through the user's local i2pd HTTP proxy (127.0.0.1:4444)
- Real eepsites load through I2P's garlic-routed, multi-hop network
- i2pd telemetry (peer count, tunnels, bandwidth) is scraped from the real
  i2pd web console at 127.0.0.1:7070
- Bandwidth class (L/O/P/X), share %, transit on/off, floodfill are configurable
- Outproxy mode lets users optionally bridge to clearnet through their i2pd

### NAT Traversal

Most phone users are behind carrier-grade NAT (CGNAT) which blocks I2P connections.
Echelon's Network Doctor auto-diagnoses this and suggests installing Yggdrasil —
a tiny encrypted IPv6 mesh overlay that gives i2pd a NAT-immune transport. Once
Yggdrasil is running with public peers and i2pd is configured with
[meshnets] yggdrasil = true, I2P connectivity works even on hostile networks.

### Termux Setup (Android)

On Android, Echelon needs i2pd + the sync daemon running in Termux:
1. Install Termux from F-Droid
2. Run: pkg update && pkg install python i2pd
3. Start i2pd: i2pd --daemon
4. Start the sync daemon: python3 echelon_sync_daemon.py
5. The Echelon PWA connects to both automatically on localhost

## Security & Privacy

Echelon has a rigorous security model with every privacy claim backed by tests:

### HTML Sanitizer
- ~80 adversarial payloads tested (mXSS, encoding tricks, malformed HTML)
- Strips: <script>, event handlers, clearnet images, CSS url(), iframes,
  meta refresh, SVG scripts, legacy URL attributes
- CSP always injected: script-src 'none'; connect-src 'none'
- In-network resources rewritten to proxy
- Only *.i2p / *.b32.i2p hosts pass through

### SSRF/Egress Defense
- 19 vectors blocked: localhost, private IPs, cloud metadata, file://, etc.
- Only .i2p destinations are reachable through the browser
- Clearnet redirects are rejected
- The daemon's own ports are blocked from being accessed through the proxy

### Website Fingerprinting Defense (Privacy Tier)
- Tamaraw-style traffic regularization: fixed-size cells, length bucketing,
  constant-rate emission
- Reduces attacker accuracy from ~91% to ~20-30%
- Opt-in feature for Privacy tier subscribers

### Honest Limitations
- Does NOT defend against global passive adversary (same as Tor/I2P limits)
- Does NOT fix a compromised device
- Does NOT anonymize Solana RPC activity by default
- Outproxy exit relay sees your clearnet request content (not your IP)

## Subscription Tiers

| Tier    | Price       | Bandwidth | Eepsites | AI Tokens/Day | Key Features |
|---------|-------------|-----------|----------|---------------|--------------|
| Free    | $0          | 1 GB/mo   | 1 (10MB) | 0 (BYOK only) | Browser, editor, BYOK AI |
| Plus    | $9 USDC/mo  | 50 GB/mo  | 5 (50MB) | 100K          | Hosted EepGen AI, premium templates |
| Privacy | $29 USDC/mo | 200 GB/mo | 10 (100MB)| 1M           | Outproxy, priority routing, cover traffic |
| Operator| $99 USDC/mo | 1 TB/mo   | 25 (250MB)| 5M           | Dedicated outproxy, operator analytics |

All tiers can use BYOK (Bring Your Own Key) Gemini AI for free.
Payments are in USDC on Solana. RTD token payments (25% discount) will be
available after the v0.2 token launch.

## Templates & EepGen AI

- 3 free starter templates + 17 premium templates ($19 USDC one-time)
- Premium templates included with Plus tier and above
- EepGen: hosted AI (Gemma 3 4B fine-tuned for eepsite building)
  - Plus: 100K tokens/day
  - Privacy: 1M tokens/day
  - Operator: 5M tokens/day
- BYOK: users can use their own Google Gemini API key for free

## Token Economy (Coming in v0.2)

- RTD token: 100M cap on Solana
- v0.1 ships with NO token — subscriptions are USDC only
- v0.2 launches RTD on Raydium after v0.1 demonstrates traction
- Retroactive airdrop for v0.1 subscribers (weighted by subscription history)
- Seeker Genesis Token holders get 2x airdrop boost and 20% subscription discount
- Staking, governance, bounties, emissions — all feature-flagged off in v0.1

## Key Pages & Features

- **Dashboard**: Overview of account, network status, recent activity
- **I2P Browser**: Multi-tab browser for .i2p eepsites with smart routing
- **Code Editor**: AI-assisted IDE with file tree, git integration, live preview
- **Eepsite Hosting**: Publish and manage your I2P websites
- **Protect**: Network diagnostics, threat filtering, meshnet status
- **Wallet**: Solana wallet with SOL/SPL transfers, RTD swap (pre-launch)
- **Settings**: Gemini API key, Termux endpoints, connection testing
- **Subscription**: Manage your Echelon subscription tier
- **Templates**: Browse and install eepsite templates

## Common User Questions

**How do I browse .i2p sites?**
Install and start i2pd, then use Echelon's browser. It routes through
127.0.0.1:4444 (i2pd's HTTP proxy). On Android, use Termux.

**Why can't I connect?**
Most likely carrier-grade NAT. Install Yggdrasil, add public peers, enable
[meshnets] yggdrasil = true in i2pd.conf, restart both. The Network Doctor
page can diagnose this automatically.

**Is my browsing private?**
Yes — the browser only connects to .i2p destinations. All clearnet resources
are stripped from eepsites. CSP prevents script execution. Your IP is hidden
by I2P's garlic routing. See docs/privacy-claims.md for the full breakdown.

**How do I publish a website?**
Create an eepsite in the editor, write your HTML/CSS/JS, then click Publish.
Files are sent to the sync daemon which writes them to disk. i2pd serves them
as a real I2P eepsite. You need i2pd running with a tunnel configured.

**What's the difference between BYOK and hosted EepGen?**
BYOK (Bring Your Own Key) uses your own Google Gemini API key — free, no
subscription needed. Hosted EepGen uses Echelon's fine-tuned Gemma 3 4B
model via DeepInfra — requires Plus tier or above, no key needed.

**When does the RTD token launch?**
After v0.1 demonstrates real traction (target: 500+ active subscribers,
50+ hosted eepsites). v0.1 subscribers get retroactive airdrop weight.
The token launches on Raydium with a 100M supply cap.
`.trim();

/**
 * Get a trimmed knowledge context that fits within token budgets.
 * Returns the full knowledge base (currently ~4K tokens, well within limits).
 */
export function getProjectKnowledge(): string {
    return ECHELON_KNOWLEDGE;
}
