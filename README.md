# Echelon

**The first tool that makes running a real, version-controlled website on I2P feel normal.**

Echelon is a mobile-first PWA for creating, editing with AI, versioning with **real git**, and publishing actual eepsites on the Invisible Internet — entirely from your own device.

### Killer Features
- **Real `.git` per eepsite** — Every project gets a proper isomorphic-git repository. Commit history, restore previous versions, all inside the browser IDE.
- **AI that sees your git state** — The assistant in the editor has live context of your current file + recent commits + uncommitted changes.
- **Publish to real I2P** — One button publishes through your local i2pd (best experience on Android via Termux).
- **Local-first & private** — No accounts. Bring your own Gemini key. Your sites live on your hardware.

This is what decentralized web tooling should have been from the start.

## Quick Demo (Desktop)

```bash
git clone https://github.com/greywolf42069/echeloni2p.git
cd Echelon
npm install
npm run dev
```

Create a site from a template → open in the AI IDE → make changes → commit with the built-in git panel → publish.

## Mobile (The Real Use Case)

See the [Termux + i2pd setup guide](./docs/mobile-termux.md). One script gets you a production-grade local I2P node + sync daemon on Android, even behind carrier NAT.

## Current Status

v0.1 beta. The core loop (template → AI + real git editing → publish) works today and is the main focus.

See:
- [ROADMAP.md](./ROADMAP.md)
- [v0.1 Beta Release Notes](./docs/release-notes-v0.1.0-beta.md)
- [Mobile Setup](./docs/mobile-termux.md)

## Why We're Building This

Most "Web3 websites" are just IPFS frontends with centralized gates.  
Most I2P sites are painful to maintain.

Echelon is the first thing that gives you modern developer experience (AI + real version control) for truly private, self-hosted sites on I2P.

## Contributing to MVP

The highest-leverage things right now:
- Polish the end-to-end "new user creates their first real eepsite with AI + git" flow
- Improve Termux onboarding and error surfacing
- Better empty states and guidance inside the IDE
- Documentation and demo materials

## License

All rights reserved during early development / pre-launch phase.

## Quick Start (Desktop)

```bash
git clone https://github.com/greywolf42069/echeloni2p.git
cd Echelon
npm install
npm run dev
```

Open http://localhost:3000, connect a Solana wallet (optional for free tier), and create your first eepsite.

## Mobile (Android + Termux) — Recommended Path

See the [Termux setup guide](./docs/mobile-termux.md). One command gets you a phone-optimized i2pd + Echelon sync daemon with Yggdrasil fallback for carrier NAT.

## Core Experience

1. Create a new eepsite (from template or blank)
2. Open in the AI IDE — full file tree + editor
3. Use the AI assistant (it sees your git state)
4. Commit real changes with the built-in git panel
5. Publish → files land in your local sync daemon → served by your i2pd

## Status (v0.1 beta)

- Core flows work end-to-end
- Real git + AI context integration is live
- Strong focus on privacy, local-first operation, and honest telemetry (no fake numbers)
- Many advanced features (threat filtering, outproxy, configurable contribution) already implemented

See [ROADMAP.md](./ROADMAP.md) and [docs/release-notes-v0.1.0-beta.md](./docs/release-notes-v0.1.0-beta.md) for details.

## Why This Matters

Most "decentralized web" tools are either:
- Centralized frontends to IPFS
- Extremely painful raw I2P setups

Echelon tries to be the first tool that makes running a high-quality, version-controlled, AI-assisted private site on I2P feel *normal*.

## Contributing

We're early. The most valuable contributions right now are:
- Polish on the core create → AI edit → git commit → publish loop
- Improvements to the Termux onboarding experience
- Better error messages and Network Doctor diagnostics
- Documentation and demo materials

## License

See LICENSE (to be added — currently all rights reserved during early development).

## Links

- [Mobile / Termux Setup](./docs/mobile-termux.md)
- [Architecture & Networking](./docs/networking.md)
- [Threat Model](./docs/threat-model.md)
- [Release Notes](./docs/release-notes-v0.1.0-beta.md)

---

**Built for the people who want the internet to have corners you can't see from the main road.**