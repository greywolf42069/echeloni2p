# Echelon Tier Matrix

This matrix defines exact free and paid limits for the current product stage.

## Principles
- Free is real, useful, and safe.
- Paid tiers buy quality, capacity, privacy, and convenience.
- Node contribution helps, but does not fully replace subscription.
- Daemon is source of truth.

## Exact Quotas

| Capability | Free | Plus | Privacy | Operator |
|---|---:|---:|---:|---:|
| Browser access to .i2p | Unlimited browse sessions, rate-limited | Unlimited | Unlimited | Unlimited |
| Browser daily page views | 25 | 250 | 1000 | 5000 |
| Concurrent tabs | 3 | 10 | 20 | 50 |
| Hosted eepsites | 1 | 5 | 10 | 25 |
| Max eepsite size | 10 MB | 50 MB | 100 MB | 250 MB |
| Upload/publish per day | 10 MB | 100 MB | 500 MB | 2 GB |
| Hosted AI tokens/day | 0 | 100k | 1M | 5M |
| BYOK AI | Yes | Yes | Yes | Yes |
| Outproxy | No | No | Yes | Yes |
| Priority routing | No | No | Yes | Yes |
| Cover traffic | No | No | Yes | Yes |
| Premium templates | No | Yes | Yes | Yes |
| Relay credits multiplier | 1x | 2x | 4x | 10x |
| Relay-based bonus quota | Small | Medium | Large | Huge |
| Device identities per wallet | 1 | 2 | 3 | 5 |
| Installations per wallet | 1 | 2 | 3 | 5 |
| API request burst | 3/sec | 10/sec | 25/sec | 50/sec |
| Daily bandwidth soft cap | 1 GB | 50 GB | 200 GB | 1 TB |

## Free Tier Behavior
- Free users can browse eepsites normally.
- Free users can host one small site.
- Free users can use BYOK AI.
- Free users cannot use outproxy.
- Free users get visible quotas and upgrade nudges.
- Free users can earn relay credits, but credits do not unlock everything.

## Node Contribution Rules
- Each active node can improve trust score.
- Relay credits can increase quotas modestly.
- Credits never fully bypass subscription for premium features.
- Free users can still participate meaningfully.

## Enforcement Notes
- All limits must be enforced in the daemon.
- UI should mirror daemon state.
- Over-limit actions return structured errors.
- Quotas should reset on UTC day boundaries unless otherwise specified.
