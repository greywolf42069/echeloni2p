//! `migrate_from_v0_1` — authority-gated backfill of a v0.1 subscriber's history
//! into an on-chain `Subscription` PDA.
//!
//! Trust model (same as the template-entitlement migration): the v0.1 buyer's
//! payments are already on-chain as USDC transfers; the v0.1 *record* is
//! local-only. The foundation backend verifies the recorded transfer signature
//! against on-chain history off-band, then signs this instruction to vouch for
//! the backfilled state. Only creates fresh PDAs — it will not overwrite a
//! subscriber who has already transacted natively on v0.2.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::EchelonError;
use crate::state::{Config, Subscription, SubscriptionTier};

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

    /// CHECK: the v0.1 subscriber whose history is migrated; used only as a PDA
    /// seed and stored as `subscription.subscriber`.
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
    let sub = &mut ctx.accounts.subscription;
    // Refuse to clobber an account that already exists on-chain.
    require!(
        sub.subscriber == Pubkey::default(),
        EchelonError::AlreadyMigrated
    );

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
    sub.bump = ctx.bumps.subscription;
    Ok(())
}
