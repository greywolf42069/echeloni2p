# Changelog

## v0.2.0 — Token Economy Release (2026-06-03)

### 🚀 New Features
- **RTD Swap Page** — Robinhood-inspired swap interface for RTD/SOL trading via PumpSwap AMM
- **Eepsite Export** — One-tap ZIP download of eepsite source code (single or all)
- **Eepsite Export All** — Batch export all eepsites from the hosting page header
- **Solana Connection Health Monitor** — Real-time RPC health with latency tracking and status indicator
- **PumpSwap Integration** — Full TypeScript SDK module for RTD token launch, pool creation, swaps, LP management, and creator fee collection
- **Deployer Wallet** — Official project keypair generated and stored at `~/.echelon/keys/deployer.json`

### 🎨 UI/UX Redesign
- **Wallet Page** — Complete Robinhood-inspired redesign with dark glassmorphism, big bold numbers, sparkline charts, and smooth animations
- **Token Balance Cards** — Redesigned with mini sparklines, hover animations, and clean typography
- **RTD Swap** — Dark theme with green/red buy/sell gradients, quick amount buttons, flip animation, and pool stats

### 🔒 Infrastructure
- **RPC Resilience** — Multiple endpoint fallback, `withRetry()` wrapper with exponential backoff
- **Rate Limit Detection** — Handles 429 and JSON-RPC -32005 errors gracefully
- **Connection Timeout** — 60s `confirmTransactionInitialTimeout` configured
- **Gitignore Hardening** — Deployer keypair files blocked from commit

### 📦 Dependencies Added
- `jszip` — ZIP file generation for eepsite export
- `file-saver` — Browser download trigger
- `@pump-fun/pump-swap-sdk` — Official PumpSwap AMM SDK (ready for integration)

### 📋 New Files
- `components/RTDSwap.tsx` — Swap UI component
- `components/RTDSwap.css` — Robinhood-style dark theme
- `components/pages/Wallet.css` — Wallet page dark theme
- `components/TokenBalanceCard.css` — Token card dark theme
- `utils/eepsiteExport.ts` — Eepsite ZIP export utility
- `scripts/rtd-pumpswap.ts` — PumpSwap SDK integration module
- `scripts/launch-rtd.ts` — RTD token launch orchestrator
- `RTD_LAUNCH_PLAN.md` — Full launch plan and checklist
- `.env.deployer` — Deployer wallet configuration

---

## v0.1.0 — Initial Release

- I2P meshnet PWA with 20 pages
- Solana wallet integration (Phantom, Solflare, MWA)
- In-browser code editor with git integration
- Eepsite hosting with local sync daemon
- Subscription system (Free, Plus, Privacy tiers)
- Settings with Gemini API key and Termux endpoint config
- i2pd telemetry and config management
- Premium template marketplace
