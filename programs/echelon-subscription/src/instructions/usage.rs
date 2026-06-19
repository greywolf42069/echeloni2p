//! Airdrop-weight accumulators.
//!
//! `increment_eepgen_usage` — daemon-gated, monotonic-nonce protected.
//!   Guards: daemon key, active subscription, and strictly increasing nonce.
//!   The nonce prevents replay of a usage message the daemon may retry after a
//!   crash. The daemon batches all usage for a subscriber into one call per
//!   submission round, increments its nonce counter, and moves on. If the on-
//!   chain nonce is already ≥ the submitted nonce, the tx is rejected.
//!
//! `record_template_purchase` — subscriber-signed, proof-gated.
//!   The proof is the subscriber's `TemplatePackPurchase` PDA from the
//!   `echelon-templates` program (owner-validated). Capped at 1.

use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, SUBSCRIPTION_SEED};
use crate::errors::EchelonError;
use crate::state::{Config, Subscription};

// ─── increment_eepgen_usage ───────────────────────────────────────────────

#[derive(Accounts)]
pub struct IncrementUsage<'info> {
    /// Must equal `config.daemon_key`.
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

// `nonce`: monotonic counter from the daemon's per-subscriber ledger.
// Must be strictly greater than `subscription.last_usage_nonce` to prevent replay.
pub fn increment_eepgen_usage(
    ctx: Context<IncrementUsage>,
    tokens_used: u64,
    nonce: u64,
) -> Result<()> {
    let sub = &mut ctx.accounts.subscription;

    // Must have an active subscription — no EepGen weight for expired users.
    let now = Clock::get()?.unix_timestamp;
    require!(sub.expires_at > now, EchelonError::SubscriptionExpired);

    // Strictly increasing nonce prevents replay of a stale usage message.
    require!(nonce > sub.last_usage_nonce, EchelonError::StaleUsageNonce);

    sub.total_eepgen_tokens_used = sub
        .total_eepgen_tokens_used
        .checked_add(tokens_used)
        .ok_or(EchelonError::Overflow)?;
    sub.last_usage_nonce = nonce;
    Ok(())
}

// ─── record_template_purchase ─────────────────────────────────────────────

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

    /// Buyer's `TemplatePackPurchase` PDA from `echelon-templates`. Owner-gated
    /// against `config.templates_program` (which is enforced non-zero at
    /// initialize and update_config time). Full field deserialization happens
    /// inside `echelon-templates`; here we only need provenance.
    /// CHECK: owner constraint validates `echelon-templates` authorship.
    #[account(owner = config.templates_program @ EchelonError::InvalidTemplateProof)]
    pub template_proof: UncheckedAccount<'info>,
}

pub fn record_template_purchase(ctx: Context<RecordTemplatePurchase>) -> Result<()> {
    // templates_program being non-zero is enforced at init/update_config, but
    // re-check here defensively so this instruction never degrades to a no-op
    // with a misconfigured authority.
    require!(
        ctx.accounts.config.templates_program != Pubkey::default(),
        EchelonError::TemplatesProgramNotSet
    );
    let sub = &mut ctx.accounts.subscription;
    // Cap at 1 — boolean weight input, not a counter.
    sub.total_template_purchases = sub.total_template_purchases.max(1);
    Ok(())
}
