/**
 * Echelon feature flags — single source of truth.
 *
 * v0.1 ships with `tokenEconomy: false` so the dApp Store reviewer
 * never sees fake RTD numbers, fake staking APR, fake leaderboard
 * v0.2 (PumpSwap RTD launch) flips `tokenEconomy: true`
 * and the gated UI lights up against real on-chain state.
 *
 * Each flag has a single semantic. The defaults live in
 * `DEFAULT_FEATURE_FLAGS`. Per-flag overrides in localStorage allow
 * dev-time toggling without rebuilds:
 *
 *     localStorage.setItem('echelon.featureFlags.tokenEconomy', 'true');
 *
 * Reading flags is synchronous so we can use them inline in render
 * paths without race-condition spaghetti. Listeners receive a snapshot
 * and re-render when any flag changes (cross-tab via the storage
 * event, in-tab via a custom CustomEvent dispatched on `window`).
 *
 * Architectural rule: NEVER render token-economy UI behind any
 * heuristic OTHER than `featureFlags.tokenEconomy`. Don't check
 * "is RTD price > 0" or "does the user have a wallet" — that's the
 * road to a flag set being lit by an unrelated state change. One
 * flag, one truth.
 */

const STORAGE_PREFIX = 'echelon.featureFlags.';
const FLAG_CHANGE_EVENT = 'echelon:featureFlags:change';

export interface FeatureFlags {
    /**
     * Master switch for everything that depends on the RTD token
     * existing on-chain. Off in v0.1, on in v0.2+.
     *
     * Gates (when false, hidden / replaced with "Coming with v0.2"):
     *   - Staking page
     *   - Governance page
     *   - Bounties page
     *   - Emissions page
     *   - Referrals page
     *   - rtdBalance / staked / accruedStakingRewards in Dashboard
     *   - "Pay in RTD for 25% off" subscription affordances
     *   - Any "earn RTD" copy in the UI
     */
    tokenEconomy: boolean;

    /**
     * v0.1 surfaces airdrop-weight tracking even though the token
     * doesn't exist yet. Each subscription / template purchase
     * increments the user's accumulating weight (stored on-chain
     * in the SubscriptionPDA). At v0.2 launch the airdrop program
     * reads these PDAs and distributes 10M RTD pro-rata.
     *
     * When false, hides the "your accumulating airdrop weight" UI.
     */
    airdropTracking: boolean;

    /**
     * Plus / Privacy tier hosted EepGen via DeepInfra Gemma 3 4B.
     * When false, the AI assistant only shows the BYOK Gemini path.
     */
    hostedEepGen: boolean;

    /**
     * Premium template marketplace ($19 USDC one-time purchase
     * unlocks 17 designed eepsite templates).
     * When false, only the 3 free starter templates are shown.
     */
    premiumTemplates: boolean;

    /**
     * Outproxy configuration UI (clearnet bridge through user's
     * own i2pd). Already shipped in Phase B.
     */
    outproxyConfig: boolean;

    /**
     * Real ad / threat filter (daemon-side filtering proxy with
     * blocked-event ring buffer). Already shipped in Phase C.
     */
    threatFilter: boolean;

    /**
     * Browser saves visit history to IndexedDB. OFF by default —
     * privacy posture. Users can opt in via Settings.
     */
    saveBrowsingHistory: boolean;

    /**
     * Browser restores tabs across app launches. OFF by default
     * (tabs evaporate). Users can opt in via Settings.
     */
    restoreTabs: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    tokenEconomy: false,
    airdropTracking: true,
    hostedEepGen: true,
    premiumTemplates: true,
    outproxyConfig: true,
    threatFilter: true,
    saveBrowsingHistory: false,
    restoreTabs: false,
};

const FLAG_KEYS: (keyof FeatureFlags)[] = [
    'tokenEconomy',
    'airdropTracking',
    'hostedEepGen',
    'premiumTemplates',
    'outproxyConfig',
    'threatFilter',
    'saveBrowsingHistory',
    'restoreTabs',
];

function safeReadStorage(key: string): string | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function parseStoredFlag(raw: string | null): boolean | undefined {
    if (raw === null || raw === undefined) return undefined;
    const lower = raw.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'on') return true;
    if (lower === 'false' || lower === '0' || lower === 'off') return false;
    return undefined;
}

/**
 * Reads the current effective flag values: defaults overlaid with
 * any localStorage overrides. Returns a fresh frozen object on
 * every call.
 */
export function getFeatureFlags(): Readonly<FeatureFlags> {
    const merged = { ...DEFAULT_FEATURE_FLAGS };
    for (const key of FLAG_KEYS) {
        const stored = parseStoredFlag(safeReadStorage(STORAGE_PREFIX + key));
        if (stored !== undefined) {
            merged[key] = stored;
        }
    }
    return Object.freeze(merged);
}

/**
 * Convenience: read a single flag.
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
    return getFeatureFlags()[flag];
}

/**
 * Set or clear an override for a flag. Pass `undefined` to clear
 * the override and fall back to the default. Fires a CustomEvent
 * so React subscribers re-render in the same tab.
 */
export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean | undefined): void {
    try {
        if (typeof localStorage === 'undefined') return;
        const storageKey = STORAGE_PREFIX + flag;
        if (value === undefined) {
            localStorage.removeItem(storageKey);
        } else {
            localStorage.setItem(storageKey, value ? 'true' : 'false');
        }
    } catch {
        // localStorage may be unavailable (private mode, SSR) — silent noop.
        return;
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent(FLAG_CHANGE_EVENT, { detail: { flag } }));
        } catch {
            // ignore
        }
    }
}

/**
 * Reset all flag overrides — every flag returns to its compile-time default.
 */
export function resetFeatureFlags(): void {
    try {
        if (typeof localStorage === 'undefined') return;
        for (const key of FLAG_KEYS) {
            localStorage.removeItem(STORAGE_PREFIX + key);
        }
    } catch {
        return;
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent(FLAG_CHANGE_EVENT, { detail: { flag: '*' } }));
        } catch {
            // ignore
        }
    }
}

/**
 * Subscribe to flag changes. Returns an unsubscribe function.
 * Listens both to in-tab CustomEvent and cross-tab `storage` event.
 */
export function subscribeFeatureFlags(listener: (flags: Readonly<FeatureFlags>) => void): () => void {
    if (typeof window === 'undefined') {
        return () => undefined;
    }
    const onChange = () => listener(getFeatureFlags());
    const onStorage = (e: StorageEvent) => {
        if (e.key && e.key.startsWith(STORAGE_PREFIX)) {
            listener(getFeatureFlags());
        }
    };
    window.addEventListener(FLAG_CHANGE_EVENT, onChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(FLAG_CHANGE_EVENT, onChange as EventListener);
        window.removeEventListener('storage', onStorage);
    };
}

// ── Test-only helpers ────────────────────────────────────────────────
// Exposed for unit tests; do not import from production code.

/** @internal */
export const __FEATURE_FLAGS_INTERNALS__ = {
    STORAGE_PREFIX,
    FLAG_CHANGE_EVENT,
    FLAG_KEYS,
} as const;
