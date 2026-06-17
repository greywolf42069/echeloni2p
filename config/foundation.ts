/**
 * Foundation on-chain addresses — single source of truth.
 *
 * These are the destinations Echelon pays into (USDC subscriptions,
 * premium template pack purchases). They MUST be set to real foundation
 * multisig addresses before mainnet. v0.1 ships with a loud placeholder
 * so a mis-deploy is obvious in the UI rather than silently sending
 * funds to a dead address.
 *
 * Override at runtime without a rebuild via a global set on window
 * (e.g. injected by the hosting page or a config endpoint):
 *
 *     window.ECHELON_FOUNDATION_USDC_RECIPIENT = '<real multisig>';
 *
 * Single module = one place to swap for mainnet, no scattered literals.
 */

/** The literal that screams "not configured yet". */
export const FOUNDATION_PLACEHOLDER = '__ECHELON_FOUNDATION_USDC_RECIPIENT__';

/**
 * The USDC recipient for subscriptions + template purchases.
 * Resolution order: runtime window override → placeholder.
 */
export function foundationUsdcRecipient(): string {
    if (typeof window !== 'undefined') {
        const override = (window as unknown as { ECHELON_FOUNDATION_USDC_RECIPIENT?: string })
            .ECHELON_FOUNDATION_USDC_RECIPIENT;
        if (typeof override === 'string' && override.trim()) {
            return override.trim();
        }
    }
    return FOUNDATION_PLACEHOLDER;
}

/** True when the recipient is still the unconfigured placeholder. */
export function isFoundationConfigured(): boolean {
    return foundationUsdcRecipient() !== FOUNDATION_PLACEHOLDER;
}
