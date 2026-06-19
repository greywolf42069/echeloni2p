//! Program error surface. Every `require!`/`?` failure maps to one of these.

use anchor_lang::prelude::*;

#[error_code]
pub enum EchelonError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Invalid subscription tier (must be Plus, Privacy, or Operator)")]
    InvalidTier,
    #[msg("Duration must be between 1 and 12 months")]
    InvalidDuration,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Price exceeds subscriber's stated maximum (slippage guard)")]
    PriceExceedsMax,
    #[msg("Only the configured daemon key may record usage")]
    UnauthorizedDaemon,
    #[msg("Only the configured authority may perform this action")]
    UnauthorizedAuthority,
    #[msg("Only the pending authority may accept the transfer")]
    UnauthorizedPendingAuthority,
    #[msg("No pending authority transfer in progress")]
    NoPendingAuthority,
    #[msg("Provided token account mint does not match the configured stable mint")]
    WrongMint,
    #[msg("Withdrawal amount exceeds available treasury balance")]
    InsufficientTreasury,
    #[msg("SOL withdrawal would leave Config below rent-exempt minimum")]
    BelowRentExempt,
    #[msg("Template purchase proof is not owned by the configured templates program")]
    InvalidTemplateProof,
    #[msg("templates_program must not be the zero pubkey")]
    TemplatesProgramNotSet,
    #[msg("Subscription has not expired yet")]
    NotExpired,
    #[msg("Usage nonce must strictly increase")]
    StaleUsageNonce,
    #[msg("EepGen usage requires an active (non-expired) subscription")]
    SubscriptionExpired,
    #[msg("Subscription PDA already exists; cannot overwrite with migration")]
    AlreadyMigrated,
    #[msg("seeker_discount_bps must be ≤ 10_000")]
    InvalidDiscountBps,
    #[msg("Migration data failed basic sanity check")]
    InvalidMigrationData,
}
