//! 2-step authority transfer: `propose_authority` → `accept_authority`.
//!
//! Motivation (audit finding): single-step authority writes can brick the program
//! if the new address is wrong. Two-step requires the incoming authority to prove
//! they hold the private key, preventing accidental or malicious misdirection.
//!
//! Flow:
//!   1. `propose_authority(new_pubkey)` — signed by current authority, sets
//!      `config.pending_authority = Some(new_pubkey)`. Pass `None` to cancel.
//!   2. `accept_authority()` — signed by the pending authority. Atomically moves
//!      `pending_authority` into `authority` and clears the pending slot.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::EchelonError;
use crate::state::Config;

#[event]
pub struct AuthorityProposedEvent {
    pub current: Pubkey,
    pub proposed: Option<Pubkey>,
}

#[event]
pub struct AuthorityAcceptedEvent {
    pub old: Pubkey,
    pub new: Pubkey,
}

// ─── propose_authority ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EchelonError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,
}

pub fn propose_authority(
    ctx: Context<ProposeAuthority>,
    new_authority: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.pending_authority = new_authority;
    emit!(AuthorityProposedEvent {
        current: config.authority,
        proposed: new_authority,
    });
    Ok(())
}

// ─── accept_authority ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    /// Must equal `config.pending_authority`.
    pub new_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let pending = config
        .pending_authority
        .ok_or(EchelonError::NoPendingAuthority)?;
    require!(
        ctx.accounts.new_authority.key() == pending,
        EchelonError::UnauthorizedPendingAuthority
    );
    let old = config.authority;
    config.authority = pending;
    config.pending_authority = None;
    emit!(AuthorityAcceptedEvent { old, new: pending });
    Ok(())
}
