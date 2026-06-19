//! `update_config` — authority-gated governance knobs. Every field is optional;
//! `None` leaves the current value untouched. Used for price changes, daemon-key
//! rotation, wiring the templates program id, the pause kill-switch, and the
//! one-way-ish governance handoff (`new_authority`).

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::EchelonError;
use crate::state::Config;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigArgs {
    pub new_authority: Option<Pubkey>,
    pub daemon_key: Option<Pubkey>,
    pub templates_program: Option<Pubkey>,
    pub plus_price_micros: Option<u64>,
    pub privacy_price_micros: Option<u64>,
    pub operator_price_micros: Option<u64>,
    pub seeker_discount_bps: Option<u16>,
    pub paused: Option<bool>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EchelonError::UnauthorizedAuthority,
    )]
    pub config: Account<'info, Config>,
}

pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    if let Some(v) = args.new_authority {
        config.authority = v;
    }
    if let Some(v) = args.daemon_key {
        config.daemon_key = v;
    }
    if let Some(v) = args.templates_program {
        config.templates_program = v;
    }
    if let Some(v) = args.plus_price_micros {
        config.plus_price_micros = v;
    }
    if let Some(v) = args.privacy_price_micros {
        config.privacy_price_micros = v;
    }
    if let Some(v) = args.operator_price_micros {
        config.operator_price_micros = v;
    }
    if let Some(v) = args.seeker_discount_bps {
        config.seeker_discount_bps = v;
    }
    if let Some(v) = args.paused {
        config.paused = v;
    }
    Ok(())
}
