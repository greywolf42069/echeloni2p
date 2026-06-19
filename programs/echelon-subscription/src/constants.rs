//! Program constants: PDA seeds, time math, and the Genesis collection allowlist.

use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";

pub const SECONDS_PER_DAY: i64 = 86_400;
pub const SECONDS_PER_MONTH: i64 = SECONDS_PER_DAY * 30;

pub const MAX_DURATION_MONTHS: u8 = 12;

/// Basis-point denominator (100% = 10_000 bps).
pub const BPS_DENOMINATOR: u64 = 10_000;

// ─── Metaplex / Genesis ────────────────────────────────────────────────────

/// Metaplex Token Metadata program (mainnet). Pinned explicitly so the
/// canonical-PDA derivation in `subscribe` is independent of which symbol
/// a given anchor-spl point release re-exports.
pub const METADATA_PROGRAM_ID: Pubkey =
    pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/// Saga Genesis Token collection mint — confirmed, Solana Mobile docs.
pub const SAGA_GENESIS_COLLECTION: Pubkey =
    pubkey!("46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC");

// Seeker Genesis Token collection mint — Solana Mobile has not published the
// final collection address at the time of writing. Add it here when they do;
// `is_qualifying_collection` is the single place that changes.

/// Returns true if `key` is one of the recognised Genesis collection mints.
/// Checked at subscribe time for the Seeker boost.
#[inline]
pub fn is_qualifying_collection(key: &Pubkey) -> bool {
    *key == SAGA_GENESIS_COLLECTION
    // || *key == SEEKER_GENESIS_COLLECTION  // ← one-line add when address is published
}
