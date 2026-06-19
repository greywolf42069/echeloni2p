//! On-chain account state.
//!
//! `Subscription` is a field-for-field mirror of `hooks/subscriptionClient.ts::SubscriptionRecord`
//! (plus `last_usage_nonce` for on-chain dedup of EepGen usage submissions).
//!
//! `Config` no longer stores a single vault address — the treasury is
//! multi-token: the Config PDA holds SOL lamports directly and is the SPL
//! authority over any number of per-mint token accounts. Any ATA/token account
//! where `authority = config_pda` is a valid treasury vault for that mint.

use anchor_lang::prelude::*;

/// Singleton program configuration, authority, and treasury policy.
///
/// PDA: `[b"config"]`.
///
/// Authority transfer is 2-step (propose → accept) to prevent irrecoverable
/// misconfiguration. `withdraw_token` and `withdraw_sol` are CPI-signed via
/// the Config PDA seeds so no human ever holds the vault key.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Current governance authority (foundation multisig → RTD governance PDA).
    pub authority: Pubkey,
    /// Pending incoming authority; must call `accept_authority` to confirm.
    /// 2-step prevents an accidental/malicious hand-off from locking the program.
    pub pending_authority: Option<Pubkey>,
    /// Sync-daemon hot key permitted to call `increment_eepgen_usage`.
    pub daemon_key: Pubkey,
    /// `echelon-templates` program id; owner-gates the purchase proof.
    /// Must never be `Pubkey::default()` (enforced in `initialize` + `update_config`).
    pub templates_program: Pubkey,
    /// The stablecoin mint accepted by `subscribe`. Validated on every payment.
    pub accepted_stable_mint: Pubkey,
    /// Monthly list prices in micro-USDC (1 USDC = 1_000_000).
    pub plus_price_micros: u64,
    pub privacy_price_micros: u64,
    pub operator_price_micros: u64,
    /// Seeker/Saga holder discount in basis points. Must be ≤ 10_000.
    pub seeker_discount_bps: u16,
    /// Kill switch: `subscribe` and `migrate_from_v0_1` abort when true.
    pub paused: bool,
    pub bump: u8,
}

/// Per-subscriber PDA. PDA: `[b"subscription", subscriber]`.
#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub subscriber: Pubkey,
    pub tier: SubscriptionTier,
    pub months_paid: u32,
    pub renewal_count: u32,
    pub started_at: i64,
    pub expires_at: i64,
    pub total_usdc_paid: u64,
    pub is_seeker_holder: bool,
    pub total_eepgen_tokens_used: u64,
    pub total_template_purchases: u32,
    /// Monotonic nonce for daemon usage submissions. Each `increment_eepgen_usage`
    /// call must provide a `nonce > last_usage_nonce`. Protects against replay of
    /// a usage message that the daemon may retry after a network hiccup.
    pub last_usage_nonce: u64,
    /// Set by `migrate_from_v0_1` only; the v0.1 USDC transfer signature that
    /// proves the historical payment. Native v0.2 subscribes leave this zeroed.
    pub last_payment_signature: [u8; 64],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum SubscriptionTier {
    Free,
    Plus,
    Privacy,
    Operator,
}

impl SubscriptionTier {
    pub fn is_paid(&self) -> bool {
        matches!(self, Self::Plus | Self::Privacy | Self::Operator)
    }
}
