//! `subscribe` — the core flow. Takes USDC into the program-owned vault and
//! creates/updates the subscriber's `Subscription` PDA. On the *first*
//! subscribe it evaluates the verified-collection Seeker boost (20% discount +
//! `is_seeker_holder = true`, which doubles airdrop weight in v0.2).
//!
//! Seeker accounts are passed as optional, typed accounts (Anchor 0.30) rather
//! than raw `remaining_accounts`: it is the same data, but type-checked and
//! self-documenting in the IDL. Both must be present to be evaluated.

use anchor_lang::prelude::*;
use anchor_spl::metadata::MetadataAccount;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EchelonError;
use crate::state::{Subscription, SubscriptionTier};

#[event]
pub struct SubscribedEvent {
    pub subscriber: Pubkey,
    pub tier: SubscriptionTier,
    pub duration_months: u8,
    pub price_paid_micros: u64,
    pub is_seeker_holder: bool,
    pub expires_at: i64,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, crate::state::Config>,

    #[account(
        init_if_needed,
        payer = subscriber,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [SUBSCRIPTION_SEED, subscriber.key().as_ref()],
        bump,
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        mut,
        constraint = subscriber_usdc.mint == config.usdc_mint @ EchelonError::WrongMint,
        constraint = subscriber_usdc.owner == subscriber.key() @ EchelonError::WrongMint,
    )]
    pub subscriber_usdc: Account<'info, TokenAccount>,

    #[account(mut, address = config.vault)]
    pub vault: Account<'info, TokenAccount>,

    /// Optional: the subscriber's Genesis NFT token account (amount == 1).
    pub genesis_token_account: Option<Account<'info, TokenAccount>>,
    /// Optional: the Metaplex metadata account for that NFT's mint.
    pub genesis_metadata: Option<Account<'info, MetadataAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn subscribe(
    ctx: Context<Subscribe>,
    tier: SubscriptionTier,
    duration_months: u8,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, EchelonError::Paused);
    require!(tier.is_paid(), EchelonError::InvalidTier);
    require!(
        (1..=MAX_DURATION_MONTHS).contains(&duration_months),
        EchelonError::InvalidDuration
    );

    let monthly = match tier {
        SubscriptionTier::Plus => config.plus_price_micros,
        SubscriptionTier::Privacy => config.privacy_price_micros,
        SubscriptionTier::Operator => config.operator_price_micros,
        SubscriptionTier::Free => return err!(EchelonError::InvalidTier),
    };
    let mut price = monthly
        .checked_mul(duration_months as u64)
        .ok_or(EchelonError::Overflow)?;

    let is_first = ctx.accounts.subscription.subscriber == Pubkey::default();

    // Seeker boost is evaluated once, on first subscribe, then persists.
    let is_seeker = if is_first {
        match (
            &ctx.accounts.genesis_token_account,
            &ctx.accounts.genesis_metadata,
        ) {
            (Some(token_acc), Some(metadata)) => {
                verify_seeker(token_acc, metadata, &ctx.accounts.subscriber.key())
            }
            _ => false,
        }
    } else {
        ctx.accounts.subscription.is_seeker_holder
    };

    if is_seeker {
        let discount = price
            .checked_mul(config.seeker_discount_bps as u64)
            .ok_or(EchelonError::Overflow)?
            / BPS_DENOMINATOR;
        price = price.checked_sub(discount).ok_or(EchelonError::Overflow)?;
    }

    // Move USDC: subscriber -> program-owned vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.subscriber_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.subscriber.to_account_info(),
            },
        ),
        price,
    )?;

    let now = Clock::get()?.unix_timestamp;
    // Renewals stack: a new period starts at max(now, current expiry).
    let start = core::cmp::max(now, ctx.accounts.subscription.expires_at);
    let added = (duration_months as i64)
        .checked_mul(SECONDS_PER_MONTH)
        .ok_or(EchelonError::Overflow)?;
    let new_expiry = start.checked_add(added).ok_or(EchelonError::Overflow)?;

    let sub = &mut ctx.accounts.subscription;
    if is_first {
        sub.subscriber = ctx.accounts.subscriber.key();
        sub.last_payment_signature = [0u8; 64];
        sub.bump = ctx.bumps.subscription;
    }
    sub.tier = tier;
    sub.started_at = start;
    sub.expires_at = new_expiry;
    sub.months_paid = sub
        .months_paid
        .checked_add(duration_months as u32)
        .ok_or(EchelonError::Overflow)?;
    sub.renewal_count = sub.renewal_count.checked_add(1).ok_or(EchelonError::Overflow)?;
    sub.total_usdc_paid = sub.total_usdc_paid.checked_add(price).ok_or(EchelonError::Overflow)?;
    sub.is_seeker_holder = is_seeker;

    emit!(SubscribedEvent {
        subscriber: sub.subscriber,
        tier,
        duration_months,
        price_paid_micros: price,
        is_seeker_holder: is_seeker,
        expires_at: new_expiry,
    });
    Ok(())
}

/// Verified-collection Seeker check, mirroring `hooks/seekerVerification.ts`.
///
/// Returns `true` iff:
///   1. the token account is owned by the subscriber and holds >= 1 unit,
///   2. the metadata account is the canonical Metaplex PDA for that NFT's mint
///      (so a forged metadata account can't be substituted), and
///   3. the NFT's `collection` is verified AND in the Genesis allowlist.
///
/// Any failure returns `false` (no discount, no boost) rather than aborting the
/// transaction — a flaky/forged Seeker input must never block a paid subscribe.
fn verify_seeker(
    token_acc: &Account<TokenAccount>,
    metadata: &Account<MetadataAccount>,
    subscriber: &Pubkey,
) -> bool {
    if token_acc.owner != *subscriber || token_acc.amount < 1 {
        return false;
    }
    let (expected_metadata, _) = Pubkey::find_program_address(
        &[
            b"metadata",
            METADATA_PROGRAM_ID.as_ref(),
            token_acc.mint.as_ref(),
        ],
        &METADATA_PROGRAM_ID,
    );
    if metadata.key() != expected_metadata {
        return false;
    }
    match &metadata.collection {
        Some(c) => c.verified && is_qualifying_collection(&c.key),
        None => false,
    }
}
