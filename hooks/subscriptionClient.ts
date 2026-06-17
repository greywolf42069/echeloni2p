import { useCallback, useEffect, useState } from 'react';
import type { SubscriptionTier as TierDef } from '../types.ts';

export type SubscriptionTier = 'free' | 'plus' | 'privacy' | 'operator';

export interface SubscriptionRecord {
    wallet: string;
    tier: SubscriptionTier;
    monthsPaid: number;
    renewalCount: number;
    startedAt: number;
    expiresAt: number;
    totalUsdcPaid: number;
    isSeekerHolder: boolean;
    totalEepgenTokensUsed: number;
    totalTemplatePurchases: number;
    lastPaymentSignature: string | null;
}

const STORAGE_KEY_PREFIX = 'echelon.subscription.';
const CHANGE_EVENT = 'echelon:subscription:change';
const API_ROOT = 'http://127.0.0.1:7071';

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_MONTH = SECONDS_PER_DAY * 30;

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
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch { /* ignore */ }
}
function safeRemove(key: string): void {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch { /* ignore */ }
}
function fireChange(wallet: string | null) {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { wallet } })); } catch { /* ignore */ }
}

export function freeRecord(wallet: string): SubscriptionRecord {
    return {
        wallet,
        tier: 'free',
        monthsPaid: 0,
        renewalCount: 0,
        startedAt: 0,
        expiresAt: 0,
        totalUsdcPaid: 0,
        isSeekerHolder: false,
        totalEepgenTokensUsed: 0,
        totalTemplatePurchases: 0,
        lastPaymentSignature: null,
    };
}

export function getSubscription(wallet: string | null): SubscriptionRecord | null {
    const key = storageKeyFor(wallet);
    if (!key) return null;
    const raw = safeRead(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as SubscriptionRecord;
        if (parsed.wallet !== wallet) return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function fetchQuota(wallet: string): Promise<any | null> {
    try {
        const res = await fetch(`${API_ROOT}/quota?wallet=${encodeURIComponent(wallet)}`, { method: 'GET' });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export function isActiveSubscription(rec: SubscriptionRecord | null, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
    if (!rec) return false;
    if (rec.tier === 'free') return false;
    return rec.expiresAt > nowSec;
}

export function saveSubscription(rec: SubscriptionRecord): void {
    const key = storageKeyFor(rec.wallet);
    if (!key) return;
    safeWrite(key, JSON.stringify(rec));
    fireChange(rec.wallet);
}

export function clearSubscription(wallet: string | null): void {
    const key = storageKeyFor(wallet);
    if (!key) return;
    safeRemove(key);
    fireChange(wallet);
}

export interface SubscribeArgs {
    wallet: string;
    tier: SubscriptionTier;
    durationMonths: number;
    micros: number;
    signature: string;
    isFirstSubscribe: boolean;
    isSeekerHolder: boolean;
    nowSec?: number;
}

export function applySubscribe(
    existing: SubscriptionRecord | null,
    args: SubscribeArgs,
): SubscriptionRecord {
    const now = args.nowSec ?? Math.floor(Date.now() / 1000);
    const base = existing ?? freeRecord(args.wallet);
    const startedAt = Math.max(now, base.expiresAt || now);
    const expiresAt = startedAt + args.durationMonths * SECONDS_PER_MONTH;
    return {
        ...base,
        tier: args.tier,
        monthsPaid: base.monthsPaid + args.durationMonths,
        renewalCount: base.renewalCount + 1,
        startedAt,
        expiresAt,
        totalUsdcPaid: base.totalUsdcPaid + args.micros,
        isSeekerHolder: base.isSeekerHolder || (args.isFirstSubscribe && args.isSeekerHolder),
        lastPaymentSignature: args.signature,
    };
}

export function recordEepgenUsage(wallet: string, additionalTokens: number): void {
    const existing = getSubscription(wallet);
    if (!existing) return;
    saveSubscription({
        ...existing,
        totalEepgenTokensUsed: existing.totalEepgenTokensUsed + Math.max(0, additionalTokens),
    });
}

export function recordTemplatePurchase(wallet: string): void {
    const existing = getSubscription(wallet) ?? freeRecord(wallet);
    saveSubscription({
        ...existing,
        totalTemplatePurchases: Math.min(1, existing.totalTemplatePurchases + 1),
    });
}

const TIER_MULTIPLIER: Record<SubscriptionTier, number> = {
    free: 0,
    plus: 4,
    privacy: 12,
    operator: 40,
};


export function tierIdFromName(name: string | null | undefined): SubscriptionTier {
    const n = (name ?? '').toLowerCase();
    if (n.includes('operator')) return 'operator';
    if (n.includes('privacy')) return 'privacy';
    if (n.includes('plus')) return 'plus';
    return 'free';
}

export function computeAirdropWeight(rec: SubscriptionRecord): number {
    const tierWeight = rec.monthsPaid * TIER_MULTIPLIER[rec.tier];
    const templateWeight = rec.totalTemplatePurchases > 0 ? 5 : 0;
    const eepgenWeight = Math.min(20, Math.floor(rec.totalEepgenTokensUsed / 1_000_000) * 2);
    const seeker = rec.isSeekerHolder ? 2.0 : 1.0;
    return Math.floor((tierWeight + templateWeight + eepgenWeight) * seeker);
}

export function useSubscription(wallet: string | null) {
    const [subscription, setSubscription] = useState<SubscriptionRecord | null>(() => getSubscription(wallet));
    const [remoteQuota, setRemoteQuota] = useState<any | null>(null);

    useEffect(() => {
        setSubscription(getSubscription(wallet));
        if (!wallet) {
            setRemoteQuota(null);
            return;
        }
        let alive = true;
        fetchQuota(wallet).then(q => { if (alive) setRemoteQuota(q); });
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent).detail as { wallet?: string } | undefined;
            if (!detail || !wallet || detail.wallet === wallet) {
                setSubscription(getSubscription(wallet));
                fetchQuota(wallet).then(q => { if (alive) setRemoteQuota(q); });
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener(CHANGE_EVENT, onChange as EventListener);
        }
        return () => {
            alive = false;
            if (typeof window !== 'undefined') {
                window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
            }
        };
    }, [wallet]);

    const nowSec = Math.floor(Date.now() / 1000);
    const isActive = isActiveSubscription(subscription, nowSec);
    const daysRemaining = subscription ? Math.max(0, Math.ceil((subscription.expiresAt - nowSec) / SECONDS_PER_DAY)) : 0;

    return { subscription, isActive, daysRemaining, remoteQuota };
}

export { SECONDS_PER_DAY, SECONDS_PER_MONTH };


