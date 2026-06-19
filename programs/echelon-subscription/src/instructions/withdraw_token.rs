//! `withdraw_token` — authority-gated disbursement of any SPL token from the
//! program-owned treasury.
//!
//! Multi-token design: the program does not register vaults in Config. Any token
//! account whose SPL authority is the Config PDA is a valid vault for that mint.
//! `withdraw_token` validates `token::authority = config` on the vault, then CPI-
//! transfers to the destination (which must hold the same mint). The CPI is signed
//! by the Config PDA seeds — no human key ever holds the vault authority.
//!
//! An on-chain event is emitted so every disbursement is permanently auditable.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::CONFIG_SEED;
use crate::errors::EchelonError;
use crate::state::Config;

#[event]
pub struct WithdrawTokenEvent {
    pub mint: Pubkey,
    pub amount: u64,
    pub vault: Pubkey,
    pub destination: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct WithdrawToken<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EchelonError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,

    /// Source vault: any token account whose SPL authority is the Config PDA.
    /// The mint is unrestricted — this instruction handles any SPL token the
    /// treasury holds (USDC, RTD, USDT, etc.).
    #[account(
        mut,
        token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Destination must hold the same mint as the vault. Anchor enforces this
    /// via `token::mint = vault.mint`, preventing cross-mint mix-ups.
    #[account(
        mut,
        token::mint = vault.mint,
        constraint = destination.key() != vault.key() @ EchelonError::InsufficientTreasury,
    )]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_token(ctx: Context<WithdrawToken>, amount: u64) -> Result<()> {
    require!(amount > 0, EchelonError::InsufficientTreasury);
    require!(
        amount <= ctx.accounts.vault.amount,
        EchelonError::InsufficientTreasury
    );

    let bump = ctx.accounts.config.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];

    let mint = ctx.accounts.vault.mint;
    let vault_key = ctx.accounts.vault.key();
    let dest_key = ctx.accounts.destination.key();
    let auth_key = ctx.accounts.authority.key();

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

    emit!(WithdrawTokenEvent {
        mint,
        amount,
        vault: vault_key,
        destination: dest_key,
        authority: auth_key,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
