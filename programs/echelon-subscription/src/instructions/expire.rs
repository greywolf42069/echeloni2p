//! `expire_subscription` — permissionless downgrade to Free once expired.
//! Lets the v0.2 airdrop snapshot walk PDAs cleanly (no derived `is_active` flag
//! needed; `tier == Free` is the canonical expired state).

use anchor_lang::prelude::*;

use crate::constants::SUBSCRIPTION_SEED;
use crate::errors::EchelonError;
use crate::state::{Subscription, SubscriptionTier};

#[event]
pub struct SubscriptionExpiredEvent {
    pub subscriber: Pubkey,
    pub expired_at: i64,
}

#[derive(Accounts)]
pub struct ExpireSubscription<'info> {
    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, subscription.subscriber.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,
}

pub fn expire_subscription(ctx: Context<ExpireSubscription>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let sub = &mut ctx.accounts.subscription;
    require!(sub.expires_at <= now, EchelonError::NotExpired);
    let subscriber = sub.subscriber;
    sub.tier = SubscriptionTier::Free;
    emit!(SubscriptionExpiredEvent {
        subscriber,
        expired_at: now,
    });
    Ok(())
}
