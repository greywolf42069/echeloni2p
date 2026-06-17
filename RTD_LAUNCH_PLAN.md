# RTD Token Launch Plan — PumpSwap Integration

## Executive Summary

Launch Echelon's RTD utility token on PumpSwap AMM (pump.fun's native DEX). This bypasses the pump.fun bonding curve entirely — we create a direct AMM pool, seed our own liquidity, and earn creator fees on every trade. The Echelon PWA becomes both the product AND the exchange.

## Why PumpSwap

- **Direct pool creation** — no bonding curve, no competing with degens
- **Less eyes** — most traders focus on pump.fun launches, not PumpSwap pools
- **Supply control** — we set the initial price and liquidity depth
- **Creator fees** — we earn on every RTD trade forever
- **Official SDK** — `@pump-fun/pump-swap-sdk` v1.14.0, MIT, TypeScript
- **Product integration** — swap RTD directly in the Echelon PWA

## Architecture

```
┌─────────────────────────────────────────────────┐
│                ECHELON PWA                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ I2P      │  │ Solana   │  │ RTD Swap     │  │
│  │ Meshnet  │  │ Wallet   │  │ (PumpSwap)   │  │
│  └──────────┘  └──────────┘  └──────┬───────┘  │
│                                      │          │
└──────────────────────────────────────┼──────────┘
                                       │
                    ┌──────────────────▼──────────┐
                    │     PumpSwap AMM Pool       │
                    │     RTD / SOL               │
                    │     pAMMBay6oceH9f...       │
                    └─────────────────────────────┘
```

## Implementation Phases

### Phase 1: Token Creation ⬜
- [ ] Generate RTD SPL token mint
- [ ] Set mint authority (foundation multisig)
- [ ] Add Metaplex Token Metadata (name, symbol, image)
- [ ] Verify on Solscan/Solana Explorer
- **Output**: RTD mint address

### Phase 2: Pool Creation ⬜
- [ ] Install `@pump-fun/pump-swap-sdk`
- [ ] Create PumpSwap pool (RTD/SOL)
- [ ] Set initial price ratio (1 RTD = X SOL)
- [ ] Seed initial liquidity (RTD + SOL)
- **Output**: Pool address, initial price

### Phase 3: Swap UI ⬜
- [ ] Build RTD Swap page component
- [ ] Integrate PumpSwap SDK for buy/sell
- [ ] Show pool stats (TVL, volume, price)
- [ ] Connect existing Solana wallet adapter
- [ ] Add to Echelon PWA navigation
- **Output**: Working swap page in PWA

### Phase 4: Token Economy Activation ⬜
- [ ] Flip `tokenEconomy: true` feature flag
- [ ] Update airdrop PDAs to reference real RTD mint
- [ ] Enable Staking page
- [ ] Enable Governance page
- [ ] Enable Bounties page
- [ ] Enable Emissions page
- [ ] Enable Referrals page
- **Output**: Full token economy live

### Phase 5: Creator Fee Collection ⬜
- [ ] Implement `collectCoinCreatorFee()` in PWA
- [ ] Add fee dashboard (accumulated fees)
- [ ] Set up fee withdrawal to foundation wallet
- **Output**: Passive income from trading fees

### Phase 6: Launch & Marketing ⬜
- [ ] Verify pool on DexScreener
- [ ] Add RTD to pump.fun token page
- [ ] Announce on Echelon social channels
- [ ] List on community aggregators
- **Output**: Public RTD trading

## Key Program IDs

| Program | Address |
|---------|---------|
| Pump.fun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| PumpSwap AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| Fee Program | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |

## SDK Reference

```typescript
import { PumpAmmSdk } from "@pump-fun/pump-swap-sdk";

const pumpAmmSdk = new PumpAmmSdk();

// Create pool
const state = await pumpAmmSdk.createPoolSolanaState(0, creator, rtdMint, NATIVE_MINT);
const instructions = await pumpAmmSdk.createPoolInstructions(state, baseIn, quoteIn);

// Swap
const swapState = await pumpAmmSdk.swapSolanaState(poolKey, user);
await pumpAmmSdk.buyBaseInput(swapState, amount, slippage);
await pumpAmmSdk.sellBaseInput(swapState, amount, slippage);

// Liquidity
const liqState = await pumpAmmSdk.liquiditySolanaState(poolKey, user);
await pumpAmmSdk.depositInstructions(liqState, lpToken, slippage);
await pumpAmmSdk.withdrawInstructions(liqState, lpAmount, slippage);

// Fees
await pumpAmmSdk.collectCoinCreatorFee(vaultAuthority, quoteMint);
```

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Thin liquidity = high slippage | Seed meaningful SOL + RTD upfront |
| Mint authority compromise | Use multisig, consider revoking after distribution |
| Impermanent loss on LP | Plan exit strategy, monitor positions |
| Token metadata not displaying | Use Metaplex standard, verify on Solscan |
| Airdrop PDA mismatch | Update PDAs to reference real RTD mint before flip |

## Timeline

- **Week 1**: Phase 1 + 2 (token + pool creation)
- **Week 2**: Phase 3 (swap UI)
- **Week 3**: Phase 4 + 5 (token economy + fees)
- **Week 4**: Phase 6 (launch)
