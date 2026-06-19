//! `withdraw_sol` — authority-gated disbursement of SOL lamports held by the
//! Config PDA.
//!
//! The Config PDA can accumulate SOL from: direct transfers, PDA rent reclaimed
//! by closed accounts, or future SOL-denominated protocol fees. This instruction
//! disburses excess lamports (above rent-exempt minimum) to a destination address.
//!
//! SOL transfer from a program-owned PDA uses raw lamport manipulation, the
//! standard Anchor pattern. `system_program::transfer` cannot be used because
//! the Config PDA is owned by this program, not the system program. The Solana
//! runtime's global lamport invariant (sum of all modified accounts unchanged)
//! ensures the arithmetic is sound.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::EchelonError;
use crate::state::Config;

#[event]
pub struct WithdrawSolEvent {
    pub lamports: u64,
    pub destination: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EchelonError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: SOL recipient — any valid pubkey. The authority decides the
    /// destination; this is their treasury to govern.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

pub fn withdraw_sol(ctx: Context<WithdrawSol>, lamports: u64) -> Result<()> {
    require!(lamports > 0, EchelonError::InsufficientTreasury);

    let config_info = ctx.accounts.config.to_account_info();
    let current = config_info.lamports();
    let min_balance = Rent::get()?.minimum_balance(config_info.data_len());

    // `checked_sub` here: if current < min_balance the account is already
    // mis-funded (shouldn't happen, but guard defensively).
    let withdrawable = current
        .checked_sub(min_balance)
        .ok_or(EchelonError::BelowRentExempt)?;
    require!(lamports <= withdrawable, EchelonError::InsufficientTreasury);

    // At this point: lamports ≤ current - min_balance → current - lamports ≥ min_balance.
    // The subtraction below cannot underflow; overflow-checks are enabled in release.
    **ctx.accounts.config.to_account_info().try_borrow_mut_lamports()? -= lamports;
    **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += lamports;

    emit!(WithdrawSolEvent {
        lamports,
        destination: ctx.accounts.destination.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
