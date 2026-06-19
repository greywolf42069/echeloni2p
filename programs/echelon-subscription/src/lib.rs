//! # echelon-subscription
//!
//! v0.2 on-chain replacement for the v0.1 localStorage subscription store
//! (`hooks/subscriptionClient.ts`). Subscribers pay USDC into a program-owned
//! PDA treasury vault; the program records every airdrop-weight input on-chain
//! so the v0.2 airdrop can be computed without trusting any off-chain database.
//!
//! Instruction surface:
//!   - `initialize`               one-time Config + treasury vault setup
//!   - `subscribe`                USDC -> vault, create/renew Subscription, Seeker boost
//!   - `increment_eepgen_usage`   daemon-gated EepGen token metering
//!   - `record_template_purchase` proof-gated premium-template flag
//!   - `expire_subscription`      permissionless downgrade-to-Free once expired
//!   - `withdraw_treasury`        authority-gated vault disbursement (CPI-signed by Config PDA)
//!   - `update_config`            authority-gated governance knobs + handoff
//!   - `migrate_from_v0_1`        authority-gated v0.1 history backfill
//!
//! The program ID below is a deterministic placeholder; `anchor keys sync`
//! rewrites it from the real devnet keypair at first build.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::SubscriptionTier;

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
    ) -> Result<()> {
        instructions::subscribe::subscribe(ctx, tier, duration_months)
    }

    pub fn increment_eepgen_usage(ctx: Context<IncrementUsage>, tokens_used: u64) -> Result<()> {
        instructions::usage::increment_eepgen_usage(ctx, tokens_used)
    }

    pub fn record_template_purchase(ctx: Context<RecordTemplatePurchase>) -> Result<()> {
        instructions::usage::record_template_purchase(ctx)
    }

    pub fn expire_subscription(ctx: Context<ExpireSubscription>) -> Result<()> {
        instructions::expire::expire_subscription(ctx)
    }

    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        instructions::withdraw_treasury::withdraw_treasury(ctx, amount)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::update_config::update_config(ctx, args)
    }

    pub fn migrate_from_v0_1(ctx: Context<MigrateFromV01>, args: MigrateArgs) -> Result<()> {
        instructions::migrate::migrate_from_v0_1(ctx, args)
    }
}
