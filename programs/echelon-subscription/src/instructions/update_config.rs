//! `update_config` — authority-gated governance knobs.
//!
//! Authority handoff has been moved to `authority.rs` (propose/accept pattern).
//! This instruction handles pricing, daemon key rotation, templates program
//! address, and the pause kill-switch.
//!
//! Every call emits a `ConfigUpdatedEvent` so all policy changes are auditable
//! on-chain without running a full account diff.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::EchelonError;
use crate::state::Config;

#[event]
pub struct ConfigUpdatedEvent {
    pub updated_by: Pubkey,
    pub timestamp: i64,
    /// Bitmask of which fields were changed (informational, for indexers).
    /// bit 0: daemon_key, 1: templates_program, 2: prices, 3: discount, 4: paused
    pub changed_fields_mask: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigArgs {
    pub daemon_key: Option<Pubkey>,
    /// Must be non-zero if provided (guards the templates_program owner check).
    pub templates_program: Option<Pubkey>,
    pub plus_price_micros: Option<u64>,
    pub privacy_price_micros: Option<u64>,
    pub operator_price_micros: Option<u64>,
    /// Must be ≤ 10_000 if provided.
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
    let mut mask: u8 = 0;
    let config = &mut ctx.accounts.config;

    if let Some(v) = args.daemon_key {
        config.daemon_key = v;
        mask |= 1 << 0;
    }
    if let Some(v) = args.templates_program {
        require!(v != Pubkey::default(), EchelonError::TemplatesProgramNotSet);
        config.templates_program = v;
        mask |= 1 << 1;
    }
    let any_price =
        args.plus_price_micros.is_some()
            || args.privacy_price_micros.is_some()
            || args.operator_price_micros.is_some();
    if let Some(v) = args.plus_price_micros     { config.plus_price_micros = v; }
    if let Some(v) = args.privacy_price_micros  { config.privacy_price_micros = v; }
    if let Some(v) = args.operator_price_micros { config.operator_price_micros = v; }
    if any_price { mask |= 1 << 2; }
    if let Some(v) = args.seeker_discount_bps {
        require!(v <= 10_000, EchelonError::InvalidDiscountBps);
        config.seeker_discount_bps = v;
        mask |= 1 << 3;
    }
    if let Some(v) = args.paused {
        config.paused = v;
        mask |= 1 << 4;
    }

    emit!(ConfigUpdatedEvent {
        updated_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
        changed_fields_mask: mask,
    });
    Ok(())
}
