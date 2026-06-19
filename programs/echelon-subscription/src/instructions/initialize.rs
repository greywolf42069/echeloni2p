//! `initialize` — one-time setup of the Config singleton and the program-owned
//! USDC treasury vault. Callable once (the Config PDA `init` enforces this).

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::state::Config;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub daemon_key: Pubkey,
    pub templates_program: Pubkey,
    pub plus_price_micros: u64,
    pub privacy_price_micros: u64,
    pub operator_price_micros: u64,
    pub seeker_discount_bps: u16,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub usdc_mint: Account<'info, Mint>,

    /// Program-owned USDC vault. Authority is the Config PDA, so only the
    /// program (via `withdraw_treasury`) can move funds out.
    #[account(
        init,
        payer = authority,
        seeds = [VAULT_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.daemon_key = args.daemon_key;
    config.templates_program = args.templates_program;
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.vault = ctx.accounts.vault.key();
    config.plus_price_micros = args.plus_price_micros;
    config.privacy_price_micros = args.privacy_price_micros;
    config.operator_price_micros = args.operator_price_micros;
    config.seeker_discount_bps = args.seeker_discount_bps;
    config.paused = false;
    config.bump = ctx.bumps.config;
    config.vault_bump = ctx.bumps.vault;
    Ok(())
}
