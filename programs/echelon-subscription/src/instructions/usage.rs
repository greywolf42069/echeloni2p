//! Airdrop-weight accumulators:
//!   - `increment_eepgen_usage` — daemon-gated EepGen token metering.
//!   - `record_template_purchase` — proof-gated premium-template flag.
//!
//! Both feed the v0.2 airdrop weight (design-v2 §13.3); neither moves funds.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::EchelonError;
use crate::state::{Config, Subscription};

/* ------------------------------------------------------- eepgen usage meter */

#[derive(Accounts)]
pub struct IncrementUsage<'info> {
    /// Must equal `config.daemon_key`. The sync daemon meters hosted-EepGen
    /// token spend; subscribers cannot inflate their own usage weight.
    pub daemon: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.daemon_key == daemon.key() @ EchelonError::UnauthorizedDaemon,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, subscription.subscriber.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,
}

pub fn increment_eepgen_usage(ctx: Context<IncrementUsage>, tokens_used: u64) -> Result<()> {
    let sub = &mut ctx.accounts.subscription;
    sub.total_eepgen_tokens_used = sub
        .total_eepgen_tokens_used
        .checked_add(tokens_used)
        .ok_or(EchelonError::Overflow)?;
    Ok(())
}

/* ------------------------------------------------- template purchase flag */

#[derive(Accounts)]
pub struct RecordTemplatePurchase<'info> {
    pub subscriber: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, subscriber.key().as_ref()],
        bump = subscription.bump,
        constraint = subscription.subscriber == subscriber.key(),
    )]
    pub subscription: Account<'info, Subscription>,

    /// The buyer's `TemplatePackPurchase` PDA from the `echelon-templates`
    /// program. We owner-gate it here (only that program can have authored it);
    /// full field deserialization lands when the templates program is written
    /// (next item on the build list). The flag is a 0/1 airdrop-weight input,
    /// so owner provenance is the load-bearing check.
    /// CHECK: validated by the `owner` constraint against `config.templates_program`.
    #[account(owner = config.templates_program @ EchelonError::InvalidTemplateProof)]
    pub template_proof: UncheckedAccount<'info>,
}

pub fn record_template_purchase(ctx: Context<RecordTemplatePurchase>) -> Result<()> {
    let sub = &mut ctx.accounts.subscription;
    // Capped at 1 — it is a boolean weight input, not a counter.
    sub.total_template_purchases = sub.total_template_purchases.max(1);
    Ok(())
}
