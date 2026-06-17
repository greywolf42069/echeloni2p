# Echelon Subscription & Access Model

Status: Draft
Owner: Papa + Rue
Scope: PWA UX, daemon enforcement, backend metering, node contribution, subscription tiers, RTD launch prerequisites

## 1. Core Product Thesis

Echelon is not a paywall-first app. It is a meshnet service provider where users are also nodes.

That means:
- Free users should get a real, useful product.
- Paid tiers should buy quality, capacity, privacy, and convenience.
- Node contribution should matter, but not collapse the need for subscriptions.
- The token should launch only after the subscription and enforcement model is real.

The product must feel like a real service, not a speculative token wrapper.

## 2. Design Goals

1. Give free users enough value to onboard and participate.
2. Make paid tiers feel like a clear upgrade in service quality.
3. Enforce limits in the daemon, not just in the UI.
4. Resist Sybil abuse by tying access to more than one identity signal.
5. Reward node contribution without making it an unlimited bypass.
6. Keep the roadmap modular so each stage ships something real.

## 3. Product Shape

### Free Tier
Free is not fake. Free is the network entry point.

Free should allow:
- browsing .i2p eepsites
- using the in-browser editor
- hosting one small eepsite
- BYOK AI
- participating as a mesh node
- earning small relay credits or reputation

Free should limit:
- number of hosted eepsites
- eepsite storage size
- daily browser traffic
- outproxy access
- hosted AI
- premium templates
- priority routing

### Paid Tiers
Paid tiers are about service quality and capability, not mere access.

Subscriptions should unlock:
- more eepsites
- larger storage limits
- more browsing bandwidth
- outproxy support
- priority routing
- cover traffic / privacy features
- hosted AI tiers
- operator analytics

### Node Contribution
Node participation should be a real part of the product.

Running a node should:
- improve the network
- earn credits / reputation
- possibly reduce subscription cost
- help with future RTD distribution

But node activity alone should not grant unlimited access. That would invite Sybil abuse.

## 4. Proposed Tier Philosophy

### Free
For trying the network and contributing lightly.

### Plus
For everyday users who want more capacity and hosted convenience.

### Privacy
For users who want better anonymity, outproxy, and routing quality.

### Operator
For heavy users, relayers, and power users who want the strongest experience.

## 5. What Free Should Mean

Free should be a real mode of use, not a demo.

A free user gets:
- access to the browser
- access to eepsite publishing
- access to the editor
- access to BYOK AI
- access to mesh participation

A free user does not get:
- outproxy by default
- hosted AI
- high storage quotas
- high bandwidth
- premium routing
- premium templates by default

This keeps the free tier useful while preserving clear reasons to upgrade.

## 6. Sybil Resistance Strategy

We should assume users may try to create many identities.

So access should be tied to a combination of signals:
- wallet address
- device install identity
- local keypair / app install key
- relay history / uptime
- contribution credits
- subscription history
- future reputation signals

No single signal should be enough by itself.

The system should treat new identities as cold-start and low-trust until they contribute or pay.

## 7. Enforcement Model

### UI Enforcement
The frontend should:
- hide unavailable features
- show quota meters
- explain upgrade paths
- block attempts to use premium-only features

### Daemon Enforcement
The backend daemon should be the source of truth.

It should enforce:
- eepsite counts
- eepsite size limits
- browser bandwidth limits
- outproxy access
- hosted AI access
- routing priority
- feature availability

If a user bypasses the UI, the daemon still rejects the request.

## 8. Metering Model

We need backend metering so the system can actually function.

Track:
- page loads
- bytes transferred
- eepsite publish sizes
- AI tokens used
- outproxy requests
- relay contributions
- subscription start/end
- quota resets

Metering should live in the backend/daemon, not just in localStorage.

## 9. Why This Needs to Happen Before Token Drop

The token should not be the first thing that makes the system real.

The correct order is:
1. build the UX so it looks and feels real
2. build backend enforcement so the limits are real
3. build the subscription lifecycle so the business model is real
4. then launch the token on-chain so it has actual utility

That way RTD is backed by a product that already works.

## 10. Roadmap Shape

This project should ship in small, feature-rich stages.

Suggested stage order:
- Stage 1: free tier enforcement and quota meters
- Stage 2: subscription payment plumbing
- Stage 3: backend metering and daemon enforcement
- Stage 4: node contribution credits and relay accounting
- Stage 5: hosted AI roadmap
- Stage 6: RTD launch and on-chain utility

This is good because each step creates a visible win.

## 11. Hosted AI Roadmap

Hosted AI should be treated as a future premium capability.

Near term:
- BYOK AI stays available for free users
- hosted AI is a Plus/Privacy/Operator feature later

Long term:
- small low-param models
- assembly / low-level optimization work
- local-first inference options
- premium hosted inference for paid tiers

This is a strong roadmap because it makes AI a feature of the service, not just a token narrative.

## 12. What We Should Build Next

Priority order:
1. finalize free tier limits
2. design tier enforcement rules in the daemon
3. add UI quota meters and upgrade prompts
4. add backend metering tables / state
5. wire subscription enforcement to real caps
6. only then consider token launch

## 13. Working Principle

The system should feel like a real service provider network:
- free users are valuable
- paid users get better service
- nodes contribute to the mesh
- the token rewards real usage, not speculation

That is the model.
