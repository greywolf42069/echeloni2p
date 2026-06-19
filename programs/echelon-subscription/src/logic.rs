//! Pure business logic — no Solana runtime types, fully unit-testable with
//! `cargo test --lib`. Instruction handlers call these after account validation
//! so the arithmetic path is independently verifiable.

use crate::constants::{BPS_DENOMINATOR, SECONDS_PER_MONTH};
use crate::state::SubscriptionTier;

/// Compute total price in micro-USDC for a subscription.
/// Returns `None` on unsupported tier (Free) or arithmetic overflow.
pub fn subscription_price(
    tier: SubscriptionTier,
    duration_months: u8,
    plus_micros: u64,
    privacy_micros: u64,
    operator_micros: u64,
) -> Option<u64> {
    let monthly = match tier {
        SubscriptionTier::Plus => plus_micros,
        SubscriptionTier::Privacy => privacy_micros,
        SubscriptionTier::Operator => operator_micros,
        SubscriptionTier::Free => return None,
    };
    monthly.checked_mul(duration_months as u64)
}

/// Apply a basis-point discount, returning the reduced price.
/// `discount_bps` must be ≤ 10_000 (caller is responsible; enforced in initialize/update_config).
pub fn apply_discount(price: u64, discount_bps: u16) -> Option<u64> {
    let discount = price.checked_mul(discount_bps as u64)? / BPS_DENOMINATOR;
    price.checked_sub(discount)
}

/// Compute the new `expires_at` timestamp for a subscribe or renewal.
///
/// Renewals stack from the current expiry so active subscribers don't lose
/// remaining time: `start = max(now, current_expiry)`.
pub fn new_expiry(now: i64, current_expiry: i64, duration_months: u8) -> Option<i64> {
    let start = now.max(current_expiry);
    let added = (duration_months as i64).checked_mul(SECONDS_PER_MONTH)?;
    start.checked_add(added)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{is_qualifying_collection, SAGA_GENESIS_COLLECTION};
    use crate::state::SubscriptionTier::*;
    use anchor_lang::prelude::Pubkey;

    const P: u64  = 9_000_000;   // Plus   $9  / month
    const PR: u64 = 29_000_000;  // Privacy $29 / month
    const OP: u64 = 99_000_000;  // Operator $99 / month

    fn price(t: SubscriptionTier, m: u8) -> Option<u64> {
        subscription_price(t, m, P, PR, OP)
    }

    // ─── subscription_price ────────────────────────────────────────────────
    #[test] fn price_plus_1m()   { assert_eq!(price(Plus,    1), Some(9_000_000));   }
    #[test] fn price_plus_12m()  { assert_eq!(price(Plus,   12), Some(108_000_000)); }
    #[test] fn price_privacy_1m(){ assert_eq!(price(Privacy, 1), Some(29_000_000));  }
    #[test] fn price_operator()  { assert_eq!(price(Operator,1), Some(99_000_000));  }
    #[test] fn price_free_none() { assert_eq!(price(Free,    1), None);              }
    #[test] fn price_overflow()  {
        // u64::MAX as monthly price × 2 months must overflow
        assert_eq!(subscription_price(Plus, 2, u64::MAX, 1, 1), None);
    }
    #[test] fn price_zero_months() {
        // 0-month duration: caller blocks this, but pure math should return Some(0)
        assert_eq!(price(Plus, 0), Some(0));
    }

    // ─── apply_discount ────────────────────────────────────────────────────
    #[test] fn discount_20pct() {
        // 20% off $9 = $7.20 (7_200_000 micro-USDC)
        assert_eq!(apply_discount(9_000_000, 2000), Some(7_200_000));
    }
    #[test] fn discount_zero_is_identity() {
        assert_eq!(apply_discount(9_000_000, 0), Some(9_000_000));
    }
    #[test] fn discount_full_bps_is_zero() {
        assert_eq!(apply_discount(9_000_000, 10_000), Some(0));
    }
    #[test] fn discount_floors_fractional() {
        // 1 micro-USDC × 20% → floor(0.2) = 0 discount → price stays 1
        assert_eq!(apply_discount(1, 2000), Some(1));
    }
    #[test] fn discount_overflow_large_price() {
        // u64::MAX × 2 bps overflows the intermediate multiply → None
        // (× 1 bps is fine; × 2 is the minimal overflow case)
        assert_eq!(apply_discount(u64::MAX, 2), None);
    }

    // ─── new_expiry ────────────────────────────────────────────────────────
    #[test] fn renewal_stacks_when_active() {
        // Active sub: starts at the current expiry, not now
        let (now, exp) = (1_000i64, 2_000i64);
        assert_eq!(new_expiry(now, exp, 1), Some(exp + SECONDS_PER_MONTH));
    }
    #[test] fn renewal_starts_now_when_lapsed() {
        // Expired sub: starts at now
        let (now, exp) = (3_000i64, 2_000i64);
        assert_eq!(new_expiry(now, exp, 1), Some(now + SECONDS_PER_MONTH));
    }
    #[test] fn renewal_multi_month() {
        assert_eq!(new_expiry(0, 0, 3), Some(3 * SECONDS_PER_MONTH));
    }
    #[test] fn expiry_overflow_returns_none() {
        assert_eq!(new_expiry(i64::MAX, i64::MAX, 1), None);
    }
    #[test] fn expiry_zero_duration() {
        // Allowed at math level; the instruction blocks it via duration range check
        assert_eq!(new_expiry(1_000, 2_000, 0), Some(2_000));
    }

    // ─── genesis collection check ─────────────────────────────────────────
    #[test] fn saga_collection_qualifies() {
        assert!(is_qualifying_collection(&SAGA_GENESIS_COLLECTION));
    }
    #[test] fn arbitrary_pubkey_does_not_qualify() {
        // Use a fixed non-qualifying pubkey — avoids solana_program::new_unique dep
        let non_qualifying = Pubkey::from([0x11u8; 32]);
        assert!(!is_qualifying_collection(&non_qualifying));
    }
    #[test] fn zero_pubkey_does_not_qualify() {
        let zero = Pubkey::default();
        assert!(!is_qualifying_collection(&zero));
    }

    // ─── SubscriptionTier classification ──────────────────────────────────
    #[test] fn paid_tiers_are_paid() {
        assert!(Plus.is_paid() && Privacy.is_paid() && Operator.is_paid());
    }
    #[test] fn free_is_not_paid() { assert!(!Free.is_paid()); }
}
