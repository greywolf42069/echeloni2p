# Echelon Backend Enforcement Plan

## Goal
Make the subscription model real by enforcing access and quotas in the daemon, not just the frontend.

## Enforcement Layers

### 1. Identity and Capability
- Wallet address
- Device install key
- Session token
- Subscription record
- Relay reputation / contribution score

Use these to mint a capability object for the daemon.

### 2. Metering
Track:
- page loads
- eepsite publishes
- eepsite bytes served
- AI token usage
- outproxy usage
- concurrent tabs
- request rate
- relay contribution

### 3. Policy Engine
Create a daemon-side policy check before each privileged action:
- browse
- publish
- outproxy
- hosted AI
- premium templates
- large uploads

### 4. Quota Store
Persist per-wallet and per-device usage in a small local store:
- daily counters
- monthly counters
- active entitlements
- trust score
- last reset time

### 5. Structured Errors
Return predictable codes to the UI:
- `tier-required`
- `quota-exceeded`
- `outproxy-disabled`
- `subscription-expired`
- `relay-score-too-low`
- `device-limit-reached`

### 6. UI Sync
The frontend should read the same entitlement state and render:
- locked features
- quota bars
- upgrade prompts
- node contribution bonuses

## Recommended Implementation Order
1. Add daemon quota store
2. Add capability generation
3. Add browse/publish checks
4. Add AI token accounting
5. Add outproxy gating
6. Add UI quota display
7. Add relay credit bonuses
8. Add subscription renewal handling

## Design Rule
Never allow the frontend to be the only enforcer.
The daemon must reject over-limit actions even if the UI is bypassed.
