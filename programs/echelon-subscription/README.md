# Echelon — Subscription Anchor Program (`programs/echelon-subscription/`)

> **Status: source written and type-checked (`cargo check` clean), NOT yet
> deployed.** This crate is the v0.2 on-chain replacement for the v0.1
> localStorage subscription store at `hooks/subscriptionClient.ts`. The
> `Subscription` account is a field-for-field mirror of the TS
> `SubscriptionRecord`, so the v0.1 UI shows the exact numbers the v0.2 airdrop
> program will distribute against.

Anchor `0.30.1`. Built as the first program in the workspace defined by the
repo-root `Anchor.toml` + `Cargo.toml`.

## Layout

```
programs/echelon-subscription/
├── Cargo.toml
├── Xargo.toml
├── README.md                  # this file
└── src/
    ├── lib.rs                 # declare_id! + #[program] instruction surface
    ├── constants.rs           # PDA seeds, time math, Genesis collection allowlist
    ├── errors.rs              # EchelonError
    ├── state.rs               # Config, Subscription, SubscriptionTier
    └── instructions/
        ├── mod.rs
        ├── initialize.rs      # Config + treasury vault setup (one-time)
        ├── subscribe.rs       # USDC -> vault, create/renew, Seeker boost
        ├── usage.rs           # increment_eepgen_usage + record_template_purchase
        ├── expire.rs          # permissionless downgrade-to-Free
        ├── withdraw_treasury.rs
        ├── update_config.rs   # governance knobs + authority handoff
        └── migrate.rs         # v0.1 -> v0.2 history backfill
```

## Program ID

`E3TuFfRKQDmt3uwTcXaUFVd2Zrqa1wYzUG9KykmWQsoj` is a **deterministic
placeholder** so the source compiles before the devnet keypair exists.
`anchor keys sync` rewrites both `declare_id!` (in `lib.rs`) and the
`[programs.*]` entries in the root `Anchor.toml` from the real
`target/deploy/` keypair at first build. Do not treat it as canonical.

## Treasury model — full program-owned PDA vault

Subscription revenue is **custodied by the program**, not swept to a foundation
ATA:

- `Config` PDA (`["config"]`) is the singleton config **and** the SPL authority
  over the vault.
- `vault` is a USDC token account at PDA `["vault"]`, `token::authority = Config`.
- `subscribe` CPI-transfers USDC from the subscriber into `vault`.
- `withdraw_treasury(amount)` is the only way out. It is `authority`-gated and
  the CPI is signed by the `Config` PDA seeds — no human ever holds the vault
  key.

At launch `authority` is the foundation multisig; `update_config { new_authority }`
hands it off to an RTD-holder governance PDA, at which point treasury spend
becomes a vote rather than a signature.

## Accounts

### `Config` (PDA `["config"]`, singleton)

| field | type | purpose |
|---|---|---|
| `authority` | `Pubkey` | governance authority (multisig → governance PDA) |
| `daemon_key` | `Pubkey` | sync-daemon hot key allowed to meter EepGen usage |
| `templates_program` | `Pubkey` | `echelon-templates` id; owner-gates the purchase proof |
| `usdc_mint` | `Pubkey` | accepted stablecoin mint |
| `vault` | `Pubkey` | program-owned USDC token account |
| `plus/privacy/operator_price_micros` | `u64` | monthly list prices (micro-USDC) |
| `seeker_discount_bps` | `u16` | Seeker/Saga holder discount (2000 = 20%) |
| `paused` | `bool` | `subscribe` kill switch |
| `bump`, `vault_bump` | `u8` | PDA bumps |

### `Subscription` (PDA `["subscription", subscriber]`)

Mirrors `hooks/subscriptionClient.ts::SubscriptionRecord`:
`subscriber, tier, months_paid, renewal_count, started_at, expires_at,
total_usdc_paid, is_seeker_holder, total_eepgen_tokens_used,
total_template_purchases, last_payment_signature, bump`.

`last_payment_signature` is set **only** by `migrate_from_v0_1` (the v0.1 USDC
transfer it backfills). Native v0.2 subscriptions leave it zeroed — the payment
is self-evidencing, riding in the same transaction as the `subscribe` ix. (A
program cannot read its own transaction signature at runtime, so there is no
honest value to put there for native subscribes.)

## Instructions

| ix | gate | effect |
|---|---|---|
| `initialize(args)` | once | creates `Config` + treasury `vault` |
| `subscribe(tier, duration_months)` | subscriber | USDC → vault, create/renew PDA, Seeker boost |
| `increment_eepgen_usage(tokens)` | `daemon_key` | adds to `total_eepgen_tokens_used` |
| `record_template_purchase()` | subscriber + proof | sets template flag (airdrop weight) |
| `expire_subscription()` | permissionless | `tier = Free` once `expires_at <= now` |
| `withdraw_treasury(amount)` | `authority` | vault → destination, CPI-signed by Config |
| `update_config(args)` | `authority` | prices, daemon key, templates id, pause, handoff |
| `migrate_from_v0_1(args)` | `authority` | backfills a fresh PDA from a v0.1 record |

### `subscribe` details

1. Reject if `paused`; require `tier ∈ {Plus, Privacy, Operator}` and
   `duration_months ∈ [1, 12]`.
2. `price = monthly_price[tier] × duration_months`.
3. On **first** subscribe, evaluate the Seeker boost (below). If the wallet
   holds a verified Genesis NFT: `is_seeker_holder = true` and a
   `seeker_discount_bps` discount is applied to `price`. The flag persists across
   renewals.
4. CPI `token::transfer(price)` subscriber → vault.
5. Renewals stack: `started_at = max(now, expires_at)`,
   `expires_at = started_at + duration_months × 30d`. Update counters.
6. `emit!(SubscribedEvent { … })` for indexers.

## Seeker / Saga Genesis Token boost — verified-collection check

> This is the corrected design. The Genesis Tokens are **collection NFTs** (each
> holder has a distinct member mint), so a flat mint allowlist cannot work. We
> check the **collection**, exactly as the off-chain hook does.

`subscribe` takes two **optional, typed** accounts (Anchor 0.30 optional
accounts — the same data as `remaining_accounts`, but type-checked and visible
in the IDL):

- `genesis_token_account` — the subscriber's NFT token account (`amount == 1`)
- `genesis_metadata` — the Metaplex metadata account for that NFT's mint

A wallet qualifies iff **all** hold:

1. the token account is owned by the subscriber and holds ≥ 1 unit;
2. `genesis_metadata` is the **canonical** Metaplex PDA for the token's mint
   (`["metadata", metaplex, mint]`) — a forged metadata account is rejected;
3. the NFT's `collection.verified == true` **and** `collection.key` is in the
   allowlist (`constants::is_qualifying_collection`).

The allowlist holds **collection** mints, mirroring
`hooks/seekerVerification.ts::GENESIS_COLLECTION_MINTS`:

- Saga Genesis collection `46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC` — confirmed.
- Seeker Genesis collection — Solana Mobile has not published the final address;
  `is_qualifying_collection` in `constants.rs` is the one-line place to add it.

Any failure in the check returns "not a holder" (no discount, no boost) rather
than aborting — a flaky or forged Seeker input must never block a paid
subscribe, matching the resilient off-chain behaviour.

## Airdrop weight (read by the v0.2 `echelon-airdrop` program)

`echelon-airdrop` snapshots every `Subscription` PDA and computes, per
design-v2 §13.3:

```
weight = months_paid × tier_multiplier
       + (total_template_purchases > 0 ? 5 : 0)
       + min(20, floor(total_eepgen_tokens_used / 1e6) × 2)
weight ×= is_seeker_holder ? 2.0 : 1.0
```

`hooks/subscriptionClient.ts::computeAirdropWeight` mirrors this exactly so the
v0.1 UI previews the same number.

## v0.1 → v0.2 migration

`migrate_from_v0_1` is `authority`-gated and only creates **fresh** PDAs (it
aborts with `AlreadyMigrated` if the subscriber already transacted on v0.2).
Trust model identical to the template-entitlement migration: the v0.1 buyer's
USDC transfers are already on-chain; the foundation backend verifies the
recorded `last_payment_signature` against on-chain history off-band, then signs
this instruction to vouch for the backfilled state.

## Building & testing

```
anchor build              # compiles BPF + generates IDL; runs anchor keys sync
anchor test               # localnet integration tests (TS, added in deploy phase)
cargo check -p echelon-subscription   # host-target type-check (no toolchain beyond cargo)
```

The CI workflow is **not** yet wired to build this crate (CI is Node + Python
today). Adding an `anchor build` job is a deploy-phase task once the Solana
toolchain is provisioned on the runner.
