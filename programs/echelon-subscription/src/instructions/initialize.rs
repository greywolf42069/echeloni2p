//! `initialize` — one-time setup of the Config singleton.
//!
//! The multi-token treasury design means initialize does NOT create a vault:
//! the Config PDA itself holds SOL lamports, and SPL token vaults are any token
//! account whose SPL authority is the Config PDA. The first subscriber (or the
//! foundation) creates the USDC ATA out-of-band; this instruction has no
//! opinion on that.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::EchelonError;
use crate::state::Config;

#[event]
pub struct InitializedEvent {
    pub authority: Pubkey,
    pub accepted_stable_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub daemon_key: Pubkey,
    pub templates_program: Pubkey,
    pub accepted_stable_mint: Pubkey,
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

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    // Guard: templates_program = zero pubkey would allow any account to pass the
    // owner check in record_template_purchase. Enforce non-zero at init.
    require!(
        args.templates_program != Pubkey::default(),
        EchelonError::TemplatesProgramNotSet
    );
    require!(
        args.seeker_discount_bps <= 10_000,
        EchelonError::InvalidDiscountBps
    );

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = None;
    config.daemon_key = args.daemon_key;
    config.templates_program = args.templates_program;
    config.accepted_stable_mint = args.accepted_stable_mint;
    config.plus_price_micros = args.plus_price_micros;
    config.privacy_price_micros = args.privacy_price_micros;
    config.operator_price_micros = args.operator_price_micros;
    config.seeker_discount_bps = args.seeker_discount_bps;
    config.paused = false;
    config.bump = ctx.bumps.config;

    emit!(InitializedEvent {
        authority: config.authority,
        accepted_stable_mint: config.accepted_stable_mint,
    });
    Ok(())
}
