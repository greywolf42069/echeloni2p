//! # echelon-subscription
//!
//! v0.2 on-chain subscription program. Full program-owned PDA treasury:
//! the Config PDA holds SOL directly and is the SPL authority over any
//! per-mint token vault. Instruction surface:
//!
//!   initialize            — one-time Config setup
//!   subscribe             — stable payment → vault, create/renew PDA, Seeker boost
//!   increment_eepgen_usage — daemon-gated, nonce-protected EepGen metering
//!   record_template_purchase — proof-gated template flag
//!   expire_subscription   — permissionless tier downgrade after expiry
//!   withdraw_token        — authority-gated SPL disbursement (any mint)
//!   withdraw_sol          — authority-gated SOL disbursement
//!   update_config         — governance knobs (prices, daemon, pause)
//!   propose_authority     — start 2-step authority handoff
//!   accept_authority      — complete authority handoff
//!   migrate_from_v0_1     — authority-gated v0.1 history backfill

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod logic;
pub mod state;

use instructions::*;
use state::SubscriptionTier;

// Placeholder — `anchor keys sync` rewrites this from the real devnet keypair.
declare_id!("E3TuFfRKQDmt3uwTcXaUFVd2Zrqa1wYzUG9KykmWQsoj");

#[program]
pub mod echelon_subscription {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize::initialize(ctx, args)
    }

    pub fn subscribe(
        ctx: Context<Subscribe>,
        tier: SubscriptionTier,
        duration_months: u8,
        max_price_micros: u64,
    ) -> Result<()> {
        instructions::subscribe::subscribe(ctx, tier, duration_months, max_price_micros)
    }

    pub fn increment_eepgen_usage(
        ctx: Context<IncrementUsage>,
        tokens_used: u64,
        nonce: u64,
    ) -> Result<()> {
        instructions::usage::increment_eepgen_usage(ctx, tokens_used, nonce)
    }

    pub fn record_template_purchase(ctx: Context<RecordTemplatePurchase>) -> Result<()> {
        instructions::usage::record_template_purchase(ctx)
    }

    pub fn expire_subscription(ctx: Context<ExpireSubscription>) -> Result<()> {
        instructions::expire::expire_subscription(ctx)
    }

    pub fn withdraw_token(ctx: Context<WithdrawToken>, amount: u64) -> Result<()> {
        instructions::withdraw_token::withdraw_token(ctx, amount)
    }

    pub fn withdraw_sol(ctx: Context<WithdrawSol>, lamports: u64) -> Result<()> {
        instructions::withdraw_sol::withdraw_sol(ctx, lamports)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::update_config::update_config(ctx, args)
    }

    pub fn propose_authority(
        ctx: Context<ProposeAuthority>,
        new_authority: Option<Pubkey>,
    ) -> Result<()> {
        instructions::authority::propose_authority(ctx, new_authority)
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::authority::accept_authority(ctx)
    }

    pub fn migrate_from_v0_1(ctx: Context<MigrateFromV01>, args: MigrateArgs) -> Result<()> {
        instructions::migrate::migrate_from_v0_1(ctx, args)
    }
}
