# Echelon Subscription Engine — Stage 1

This document tracks the first implementation stage of the subscription/access system.

## Stage 1 Goal
Build the real backend enforcement foundation before any token launch.

### Deliverables
- quota schema
- daemon-side entitlement store
- browse/publish/outproxy policy checks
- structured over-limit errors
- UI quota display wiring

### Non-goals
- RTD token launch
- on-chain SubscriptionPDA deployment
- reward distribution
- premium hosted AI

### Implementation Order
1. add quota store
2. add capability generation
3. enforce browse limits
4. enforce publish limits
5. enforce outproxy gating
6. expose quota state to UI

### Success Criteria
- free users can browse
- free users can host one small eepsite
- free users can see quota meters
- premium features are blocked in the daemon when not entitled
- the UI renders the right upgrade prompts
