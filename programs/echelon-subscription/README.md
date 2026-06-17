# Echelon — Subscription Anchor Program (`programs/echelon-subscription/`)

> **Status: source committed, NOT yet deployed.** This crate is the v0.2
> on-chain replacement for the v0.1 localStorage subscription store at
> `hooks/subscriptionClient.ts`. The TS field shape mirrors `Subscription`
> below 1:1; v0.2 deploy includes a "claim my v0.1 history" instruction
> that backfills the on-chain PDA from the user's local record (signed by
> the wallet so the chain can trust the migration).

## Layout

```
programs/echelon-subscription/
├── Cargo.toml         # workspace member; not yet wired into CI
├── Xargo.toml         # for solana BPF target
├── README.md          # this file
└── src/
    └── lib.rs         # the program
```

## Program ID

`SubscRiptionProgRamId11111111111111111111111` (placeholder — generated
when devnet keypair is created during E.2 deploy).

## Accounts

### `Subscription` (PDA[b"subscription", subscriber])

```rust
#[account]
pub struct Subscription {
    pub subscriber: Pubkey,         // 32
    pub tier: SubscriptionTier,     //  1 (Free=0, Plus=1, Privacy=2, Operator=3)
    pub months_paid: u32,           //  4
    pub renewal_count: u32,         //  4
    pub started_at: i64,            //  8 (UTC seconds)
    pub expires_at: i64,            //  8
    pub total_usdc_paid: u64,       //  8 (micro-USDC)
    pub is_seeker_holder: bool,     //  1
    pub total_eepgen_tokens_used: u64, // 8
    pub total_template_purchases: u32, // 4
    pub last_payment_signature: [u8; 64], // 64
    pub bump: u8,                   //  1
    // total: 8 (discriminator) + 143 = 151
}
```

## Instructions

### `subscribe(tier, duration_months)`

- **Accounts**: subscriber (signer), Subscription PDA (writable, init-if-needed),
  USDC token account from subscriber → foundation USDC ATA (writable),
  Token Program, Associated Token Program, System Program.
- **Optional remaining_accounts**: subscriber's Seeker Genesis Token ATA (read-only).
- **Logic**:
  1. Verify `tier ∈ {Plus, Privacy, Operator}`.
  2. Verify `duration_months ∈ [1, 12]`.
  3. Compute price from on-chain price oracle (constant in v0.2: 9/29/99 USDC × duration).
  4. CPI `token::transfer` of `price × 1_000_000` from subscriber to foundation ATA.
  5. If first subscribe AND remaining_accounts contains a Seeker Genesis Token ATA
     with amount ≥ 1, set `is_seeker_holder = true` AND apply 20% discount.
  6. Update `Subscription` fields: tier, months_paid+=N, renewal_count+=1,
     started_at = max(now, expires_at), expires_at = started_at + N×30d,
     total_usdc_paid += paid micros, last_payment_signature = txn signature.

### `increment_eepgen_usage(tokens_used)`

- **Accounts**: daemon-owned key (signer), Subscription PDA (writable).
- **Logic**: only the daemon's published key may call this. Adds `tokens_used`
  to `total_eepgen_tokens_used`. Idempotent if (wallet, day) is the dedup key
  via a separate UsageLog PDA — to be designed in deploy phase.

### `record_template_purchase()`

- **Accounts**: subscriber (signer), Subscription PDA (writable),
  Template program's TemplatePackPurchasePDA (read-only proof).
- **Logic**: caps `total_template_purchases` at 1, used as airdrop weight input.

### `expire_subscription()`

- **Accounts**: anyone (signer), Subscription PDA (writable).
- **Logic**: when `expires_at <= now`, sets `tier = Free`. Idempotent. Lets
  the airdrop snapshot program walk records cleanly without each one
  carrying an explicit `is_active` flag.

## Seeker Genesis Token mint allowlist

Hard-coded constant in `lib.rs`:

```rust
const QUALIFYING_GENESIS_MINTS: &[Pubkey] = &[
    // Saga Genesis Token mint (TBD — pulled from Solana Mobile docs at deploy)
    pubkey!("11111111111111111111111111111111"),
    // Seeker Genesis Token mint (TBD)
    pubkey!("11111111111111111111111111111111"),
];
```

These placeholders MUST be replaced with the real mint addresses before
mainnet deploy. The list is upgradeable via a foundation-multisig-only
`update_genesis_mints()` instruction (also in `lib.rs`).

## Airdrop weight (read-only consumer)

The `programs/echelon-airdrop/` program (Phase E.7, v0.2) reads every
`Subscription` PDA at snapshot time and computes weight per design-v2 §13.3:

```
weight = months_paid × tier_multiplier
       + (total_template_purchases > 0 ? 5 : 0)
       + min(20, floor(total_eepgen_tokens_used / 1e6) × 2)
weight ×= is_seeker_holder ? 2.0 : 1.0
```

The TS-side computation in `hooks/subscriptionClient.ts::computeAirdropWeight`
mirrors this exactly so the v0.1 UI shows the same number the v0.2 program
will distribute against.

## v0.1 → v0.2 migration plan

When the program is deployed and the foundation announces v0.2:

1. Each connected wallet's localStorage `SubscriptionRecord` is read by
   `hooks/subscriptionClient.ts::getSubscription(wallet)`.
2. UI prompts user "Migrate your v0.1 subscription to chain?".
3. User signs a `claim_v0_1_history(record_hash)` message; the daemon (or
   a foundation backend) verifies the original USDC transfers exist by
   checking the recorded `last_payment_signature` against on-chain history,
   and submits an Anchor `migrate_from_v0_1()` instruction creating the
   PDA with the right state.
4. Once on-chain, localStorage record is marked `migratedAt: <slot>` and
   the on-chain PDA becomes the source of truth.

This is the same trust model as the template entitlement migration —
the v0.1 buyer's payment is on-chain (USDC transfer signature),
the v0.1 entitlement claim is local-only, and migration verifies the
former to authenticate the latter.

## Why ship this README before the Rust code

Anchor / Solana CLI tooling is not yet installed in this environment.
The decision is documented here so the v0.2 implementation phase has
zero ambiguity about account layout, instruction surface, fee splits,
or migration path — the v0.1 TS field shape is already locked at
`hooks/subscriptionClient.ts::SubscriptionRecord`.

The Rust source for `lib.rs` will be added in a follow-up commit when
the Anchor toolchain is wired in (E.2 deploy phase). Until then, this
README + the TS implementation define the canonical contract.
