//! Program error surface. Every `require!`/`?` failure path maps to one of these.

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
    #[msg("Only the configured daemon key may record usage")]
    UnauthorizedDaemon,
    #[msg("Only the configured authority may perform this action")]
    UnauthorizedAuthority,
    #[msg("Provided token account does not match the configured USDC mint")]
    WrongMint,
    #[msg("Requested amount exceeds the treasury vault balance")]
    InsufficientTreasury,
    #[msg("Template purchase proof is not owned by the configured templates program")]
    InvalidTemplateProof,
    #[msg("Subscription has not expired yet")]
    NotExpired,
    #[msg("Subscription PDA already exists for this subscriber")]
    AlreadyMigrated,
}
