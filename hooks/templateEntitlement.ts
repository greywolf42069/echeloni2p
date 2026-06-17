/**
 * Premium template pack entitlement.
 *
 * v0.1 model: a one-time $19 USDC purchase to a foundation address
 * unlocks the premium template tier for the buying wallet, FOREVER.
 *
 * Entitlement is tracked in two layers:
 *
 *   1. **localStorage cache** — instant UI response. Keyed by wallet
 *      pubkey so a multi-wallet user sees the right state on switch.
 *      Holds a record of {paid, signature, paidAt} once the payment
 *      lands.
 *
 *   2. **Chain-derived truth** (when v0.2 ships): the
 *      `programs/echelon-templates/` Anchor program will create a
 *      TemplatePackPurchasePDA[wallet] PDA when the SPL transfer
 *      lands; UI verifies on every load.
 *
 * For v0.1 we use layer 1 only. Anyone can clear localStorage to
 * re-display the lock screen; the entitlement gate is honest, not
 * adversarial. The economic model says: once $19 USDC is in the
 * foundation wallet, the buyer has the right to use the templates;
 * we trust the user to not gaslight themselves.
 *
 * The chain query layer (verifying via SPL transfers to the
 * foundation address) is reserved for v0.2 — when devnet keypair
 * exists, we add `verifyEntitlementOnChain(wallet)` that queries
 * recent signatures and returns true if a 19-USDC transfer to the
 * foundation address is present.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY_PREFIX = 'echelon.templatePack.entitlement.';

export interface TemplateEntitlement {
    /** Wallet that paid. */
    wallet: string;
    /** Solana transaction signature of the USDC transfer. */
    signature: string;
    /** Unix ms. */
    paidAt: number;
}

function storageKeyFor(wallet: string | null): string | null {
    if (!wallet) return null;
    return STORAGE_KEY_PREFIX + wallet;
}

function safeRead(key: string): string | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeWrite(key: string, value: string): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeRemove(key: string): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

/**
 * Read entitlement record for a wallet. Returns null if no purchase
 * is recorded.
 */
export function getEntitlement(wallet: string | null): TemplateEntitlement | null {
    const key = storageKeyFor(wallet);
    if (!key) return null;
    const raw = safeRead(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as TemplateEntitlement;
        if (parsed.wallet === wallet && typeof parsed.signature === 'string') {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Record a successful purchase. Persists to localStorage. The chain
 * query is the canonical truth post-v0.2 but we cache for instant UI.
 */
export function recordEntitlement(record: TemplateEntitlement): void {
    const key = storageKeyFor(record.wallet);
    if (!key) return;
    safeWrite(key, JSON.stringify(record));
    // Notify in-tab subscribers (cross-tab handled by storage event).
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        try {
            window.dispatchEvent(
                new CustomEvent('echelon:entitlement:change', { detail: { wallet: record.wallet } }),
            );
        } catch {
            // ignore
        }
    }
}

/** Clear an entitlement record (test / wallet-disconnect helper). */
export function clearEntitlement(wallet: string | null): void {
    const key = storageKeyFor(wallet);
    if (!key) return;
    safeRemove(key);
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        try {
            window.dispatchEvent(
                new CustomEvent('echelon:entitlement:change', { detail: { wallet } }),
            );
        } catch {
            // ignore
        }
    }
}

/**
 * React hook returning {entitled, entitlement, refresh} for the
 * current wallet. Re-evaluates on storage events + custom events.
 */
export function useTemplateEntitlement(wallet: string | null): {
    entitled: boolean;
    entitlement: TemplateEntitlement | null;
    refresh: () => void;
} {
    const [entitlement, setEntitlement] = useState<TemplateEntitlement | null>(() => getEntitlement(wallet));

    const refresh = useCallback(() => {
        setEntitlement(getEntitlement(wallet));
    }, [wallet]);

    useEffect(() => {
        refresh();
        if (typeof window === 'undefined') return;
        const onStorage = (e: StorageEvent) => {
            if (e.key && e.key.startsWith(STORAGE_KEY_PREFIX)) refresh();
        };
        const onCustom = () => refresh();
        window.addEventListener('storage', onStorage);
        window.addEventListener('echelon:entitlement:change', onCustom);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('echelon:entitlement:change', onCustom);
        };
    }, [wallet, refresh]);

    return {
        entitled: entitlement !== null,
        entitlement,
        refresh,
    };
}
