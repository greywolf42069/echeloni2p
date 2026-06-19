//! Program constants: PDA seeds, time math, and the Genesis collection allowlist.
//!
//! The Genesis allowlist holds *collection* mints (Metaplex sized collection
//! NFTs), NOT the 140k+ individual member mints. A subscriber qualifies for the
//! Seeker boost iff they hold an NFT whose on-chain metadata names one of these
//! collections AND `collection.verified == true`. This mirrors the off-chain
//! check in `hooks/seekerVerification.ts::GENESIS_COLLECTION_MINTS` exactly, so
//! the v0.1 UI and the v0.2 program agree on who is a holder.

use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";

pub const SECONDS_PER_DAY: i64 = 86_400;
pub const SECONDS_PER_MONTH: i64 = SECONDS_PER_DAY * 30;

/// Subscriptions are sold in 1..=12 month increments. design-v2 §E.2.
pub const MAX_DURATION_MONTHS: u8 = 12;

/// Basis-point denominator (100% = 10_000 bps).
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Metaplex Token Metadata program (mainnet). Matches the address used by the
/// off-chain check in `hooks/seekerVerification.ts`. Pinned explicitly so the
/// canonical-PDA derivation in `subscribe` does not depend on which symbol a
/// given anchor-spl point release re-exports.
pub const METADATA_PROGRAM_ID: Pubkey =
    pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/// Saga Genesis Token collection mint — confirmed, Solana Mobile docs.
pub const SAGA_GENESIS_COLLECTION: Pubkey =
    pubkey!("46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC");

// Seeker Genesis Token collection mint — Solana Mobile has not published the
// final collection address at the time of writing. `is_qualifying_collection`
// below is the single place to add it; doing so is a one-line change with no
// logic impact. Until then the on-chain boost is granted to Saga holders only,
// matching the off-chain hook.

/// True if `key` is one of the recognised, verified Genesis collection mints.
#[inline]
pub fn is_qualifying_collection(key: &Pubkey) -> bool {
    *key == SAGA_GENESIS_COLLECTION
    // || *key == SEEKER_GENESIS_COLLECTION  // <- add when Solana Mobile publishes it
}
