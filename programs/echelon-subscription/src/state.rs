//! On-chain account state.
//!
//! `Subscription` is a field-for-field mirror of the v0.1 TS record at
//! `hooks/subscriptionClient.ts::SubscriptionRecord`, so the v0.1 UI shows the
//! exact numbers the v0.2 airdrop program will distribute against.

use anchor_lang::prelude::*;

/// Singleton program configuration + treasury authority.
///
/// The `Config` PDA (`["config"]`) is also the SPL authority over the treasury
/// vault, so `withdraw_treasury` signs vault CPIs with the config seeds. One PDA
/// owns both policy and funds; there is no separate multisig-held vault key.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Governance authority: foundation multisig at launch, handed off to an
    /// RTD-holder governance PDA later via `update_config`.
    pub authority: Pubkey,
    /// Sync-daemon hot key permitted to call `increment_eepgen_usage`.
    pub daemon_key: Pubkey,
    /// `echelon-templates` program id; owner-gates the `record_template_purchase` proof.
    pub templates_program: Pubkey,
    /// Accepted stablecoin mint (mainnet USDC).
    pub usdc_mint: Pubkey,
    /// Program-owned USDC token account (`["vault"]` PDA).
    pub vault: Pubkey,
    /// Monthly list prices in micro-USDC (1 USDC = 1_000_000).
    pub plus_price_micros: u64,
    pub privacy_price_micros: u64,
    pub operator_price_micros: u64,
    /// Seeker/Saga holder discount, in basis points (2000 = 20%).
    pub seeker_discount_bps: u16,
    /// Kill switch for `subscribe` (governance/incident response).
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Per-subscriber record. PDA: `["subscription", subscriber]`.
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
    /// v0.1 USDC-transfer signature, set only by `migrate_from_v0_1`. Native
    /// v0.2 subscriptions leave this zeroed — the payment is self-evidencing
    /// (the SPL transfer rides in the same transaction as the `subscribe` ix).
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
    /// True for the paid tiers `subscribe` will accept.
    pub fn is_paid(&self) -> bool {
        matches!(self, Self::Plus | Self::Privacy | Self::Operator)
    }
}
