//! `subscribe` — core subscription flow.
//!
//! Security properties:
//!   - CEI order: all state mutations happen BEFORE the CPI token transfer.
//!   - Slippage guard: subscriber provides `max_price_micros`; aborts if computed
//!     price exceeds it, protecting against authority front-running price changes.
//!   - Seeker boost: evaluated once, on first subscribe, via verified-collection
//!     check (mirrors hooks/seekerVerification.ts). Fail-safe: any hiccup returns
//!     false rather than aborting the transaction.

use anchor_lang::prelude::*;
use anchor_spl::metadata::MetadataAccount;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{is_qualifying_collection, METADATA_PROGRAM_ID, SUBSCRIPTION_SEED, CONFIG_SEED};
use crate::errors::EchelonError;
use crate::logic::{apply_discount, new_expiry, subscription_price};
use crate::state::{Config, Subscription, SubscriptionTier};

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
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = subscriber,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [SUBSCRIPTION_SEED, subscriber.key().as_ref()],
        bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// Subscriber's USDC token account; validated against `config.accepted_stable_mint`.
    #[account(
        mut,
        token::mint = config.accepted_stable_mint,
        token::authority = subscriber,
    )]
    pub subscriber_stable: Account<'info, TokenAccount>,

    /// Program-owned USDC vault: any token account where the SPL authority is the
    /// Config PDA. The program does not store the vault address — validation here
    /// is sufficient; an invalid vault would cause the CPI to fail or the treasury
    /// balance to go somewhere the program can never reclaim.
    #[account(
        mut,
        token::mint = config.accepted_stable_mint,
        token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Optional: subscriber's Genesis NFT token account (amount == 1, decimals == 0).
    pub genesis_token_account: Option<Account<'info, TokenAccount>>,
    /// Optional: Metaplex metadata for the Genesis NFT's mint.
    pub genesis_metadata: Option<Account<'info, MetadataAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// `max_price_micros`: subscriber's acceptable price ceiling in micro-USDC (slippage guard).
// The tx aborts if the computed price exceeds this, preventing front-running
// by an authority who raises prices between the subscriber's signing and on-chain execution.
pub fn subscribe(
    ctx: Context<Subscribe>,
    tier: SubscriptionTier,
    duration_months: u8,
    max_price_micros: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, EchelonError::Paused);
    require!(tier.is_paid(), EchelonError::InvalidTier);
    require!(
        (1..=crate::constants::MAX_DURATION_MONTHS).contains(&duration_months),
        EchelonError::InvalidDuration
    );

    // ── Compute price ────────────────────────────────────────────────────
    let mut price = subscription_price(
        tier,
        duration_months,
        config.plus_price_micros,
        config.privacy_price_micros,
        config.operator_price_micros,
    )
    .ok_or(EchelonError::Overflow)?;

    let is_first = ctx.accounts.subscription.subscriber == Pubkey::default();

    // Seeker boost: evaluated once on first subscribe, persists afterwards.
    let is_seeker = if is_first {
        match (&ctx.accounts.genesis_token_account, &ctx.accounts.genesis_metadata) {
            (Some(ta), Some(md)) => verify_genesis(ta, md, &ctx.accounts.subscriber.key()),
            _ => false,
        }
    } else {
        ctx.accounts.subscription.is_seeker_holder
    };

    if is_seeker {
        price =
            apply_discount(price, config.seeker_discount_bps).ok_or(EchelonError::Overflow)?;
    }

    // Slippage guard: abort if price changed since subscriber signed their tx.
    require!(price <= max_price_micros, EchelonError::PriceExceedsMax);

    let now = Clock::get()?.unix_timestamp;
    let new_exp = new_expiry(now, ctx.accounts.subscription.expires_at, duration_months)
        .ok_or(EchelonError::Overflow)?;

    // ── CEI: mutate state BEFORE CPI ─────────────────────────────────────
    {
        let sub = &mut ctx.accounts.subscription;
        if is_first {
            sub.subscriber = ctx.accounts.subscriber.key();
            sub.last_payment_signature = [0u8; 64];
            sub.bump = ctx.bumps.subscription;
        }
        sub.tier = tier;
        sub.started_at = now.max(sub.expires_at);
        sub.expires_at = new_exp;
        sub.months_paid = sub
            .months_paid
            .checked_add(duration_months as u32)
            .ok_or(EchelonError::Overflow)?;
        sub.renewal_count =
            sub.renewal_count.checked_add(1).ok_or(EchelonError::Overflow)?;
        sub.total_usdc_paid =
            sub.total_usdc_paid.checked_add(price).ok_or(EchelonError::Overflow)?;
        sub.is_seeker_holder = is_seeker;
    }

    // ── CPI: transfer stable → vault ─────────────────────────────────────
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.subscriber_stable.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.subscriber.to_account_info(),
            },
        ),
        price,
    )?;

    emit!(SubscribedEvent {
        subscriber: ctx.accounts.subscriber.key(),
        tier,
        duration_months,
        price_paid_micros: price,
        is_seeker_holder: is_seeker,
        expires_at: new_exp,
    });
    Ok(())
}

/// Verified-collection Genesis check, mirroring `hooks/seekerVerification.ts`.
///
/// Returns `true` iff:
///   1. Token account is owned by the subscriber and holds ≥ 1 token.
///   2. Metadata account is the canonical Metaplex PDA for that mint (prevents
///      forged metadata substitution).
///   3. NFT's `collection.verified == true` AND key is in the Genesis allowlist.
///
/// Any failure returns `false` (non-aborting) — a forged or flaky Seeker
/// input must never block a legitimate paid subscribe.
fn verify_genesis(
    token_acc: &Account<TokenAccount>,
    metadata: &Account<MetadataAccount>,
    subscriber: &Pubkey,
) -> bool {
    if token_acc.owner != *subscriber || token_acc.amount < 1 {
        return false;
    }
    let (expected_pda, _) = Pubkey::find_program_address(
        &[
            b"metadata",
            METADATA_PROGRAM_ID.as_ref(),
            token_acc.mint.as_ref(),
        ],
        &METADATA_PROGRAM_ID,
    );
    if metadata.key() != expected_pda {
        return false;
    }
    match &metadata.collection {
        Some(c) => c.verified && is_qualifying_collection(&c.key),
        None => false,
    }
}
