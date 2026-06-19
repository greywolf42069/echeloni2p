//! `withdraw_treasury` — authority-gated disbursement from the program-owned
//! vault. The Config PDA is the vault's SPL authority, so the CPI is signed with
//! the config seeds; no human ever holds the vault key.
//!
//! This is the deliberate "full PDA treasury" property: subscription revenue is
//! custodied by the program, and only an `authority`-signed instruction can move
//! it. At launch `authority` is the foundation multisig; post governance-handoff
//! it is an RTD-holder governance PDA, so treasury spend becomes a vote.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EchelonError;
use crate::state::Config;

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EchelonError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,

    #[account(mut, address = config.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = destination.mint == config.usdc_mint @ EchelonError::WrongMint,
    )]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    require!(
        amount <= ctx.accounts.vault.amount,
        EchelonError::InsufficientTreasury
    );

    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;
    Ok(())
}
