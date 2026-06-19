//! `migrate_from_v0_1` — authority-gated backfill of v0.1 localStorage history.
//!
//! Trust model: the v0.1 buyer's USDC transfers are on-chain; the v0.1 *record*
//! is local-only. The foundation backend verifies `last_payment_signature` off-
//! band, then signs this instruction. Only creates fresh PDAs — never overwrites
//! an active v0.2 subscriber.
//!
//! Sanity checks on input data prevent authority from injecting absurd airdrop
//! weights (e.g. expires_at before started_at, zero payments for paid tiers).

use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, SUBSCRIPTION_SEED};
use crate::errors::EchelonError;
use crate::state::{Config, Subscription, SubscriptionTier};

#[event]
pub struct V01MigratedEvent {
    pub subscriber: Pubkey,
    pub months_paid: u32,
    pub is_seeker_holder: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MigrateArgs {
    pub tier: SubscriptionTier,
    pub months_paid: u32,
    pub renewal_count: u32,
    pub started_at: i64,
    pub expires_at: i64,
    pub total_usdc_paid: u64,
    pub is_seeker_holder: bool,
    pub total_eepgen_tokens_used: u64,
    pub total_template_purchases: u32,
    pub last_payment_signature: [u8; 64],
}

#[derive(Accounts)]
pub struct MigrateFromV01<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EchelonError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: the v0.1 subscriber whose history is migrated.
    pub subscriber: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [SUBSCRIPTION_SEED, subscriber.key().as_ref()],
        bump,
    )]
    pub subscription: Account<'info, Subscription>,

    pub system_program: Program<'info, System>,
}

pub fn migrate_from_v0_1(ctx: Context<MigrateFromV01>, args: MigrateArgs) -> Result<()> {
    // Refuse to overwrite an account that has already transacted on v0.2.
    require!(
        ctx.accounts.subscription.subscriber == Pubkey::default(),
        EchelonError::AlreadyMigrated
    );

    // Respect pause — backfills should also halt during incidents.
    require!(!ctx.accounts.config.paused, EchelonError::Paused);

    // Basic sanity on migrated data (audit finding: prevent injecting bogus weights).
    require!(
        args.expires_at >= args.started_at,
        EchelonError::InvalidMigrationData
    );
    if args.tier.is_paid() {
        require!(args.total_usdc_paid > 0, EchelonError::InvalidMigrationData);
        require!(args.months_paid > 0, EchelonError::InvalidMigrationData);
    }

    let sub = &mut ctx.accounts.subscription;
    sub.subscriber = ctx.accounts.subscriber.key();
    sub.tier = args.tier;
    sub.months_paid = args.months_paid;
    sub.renewal_count = args.renewal_count;
    sub.started_at = args.started_at;
    sub.expires_at = args.expires_at;
    sub.total_usdc_paid = args.total_usdc_paid;
    sub.is_seeker_holder = args.is_seeker_holder;
    sub.total_eepgen_tokens_used = args.total_eepgen_tokens_used;
    sub.total_template_purchases = args.total_template_purchases.min(1);
    sub.last_payment_signature = args.last_payment_signature;
    sub.last_usage_nonce = 0;
    sub.bump = ctx.bumps.subscription;

    emit!(V01MigratedEvent {
        subscriber: sub.subscriber,
        months_paid: sub.months_paid,
        is_seeker_holder: sub.is_seeker_holder,
    });
    Ok(())
}
