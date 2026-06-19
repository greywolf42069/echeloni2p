//! `expire_subscription` — permissionless downgrade to Free once the paid period
//! has elapsed. Lets the v0.2 airdrop snapshot walk every `Subscription` PDA
//! without each record carrying a derived `is_active` flag. Idempotent.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::EchelonError;
use crate::state::{Subscription, SubscriptionTier};

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
    sub.tier = SubscriptionTier::Free;
    Ok(())
}
