import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    applySubscribe,
    clearSubscription,
    computeAirdropWeight,
    freeRecord,
    getSubscription,
    isActiveSubscription,
    recordEepgenUsage,
    recordTemplatePurchase,
    saveSubscription,
    tierIdFromName,
    type SubscriptionRecord,
} from '../../hooks/subscriptionClient';

const W1 = 'TestWallet1AAAAAAAAAAAAAAAAAAAAAAAAAAA';
const W2 = 'TestWallet2BBBBBBBBBBBBBBBBBBBBBBBBBBB';
const NOW = 1_700_000_000; // arbitrary fixed timestamp
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_MONTH = SECONDS_PER_DAY * 30;

describe('subscriptionClient', () => {
    beforeEach(() => { try { localStorage.clear(); } catch { /* no-op */ } });
    afterEach(() => { try { localStorage.clear(); } catch { /* no-op */ } });

    describe('storage round-trip', () => {
        it('getSubscription returns null for a wallet that never subscribed', () => {
            expect(getSubscription(W1)).toBeNull();
        });

        it('saveSubscription + getSubscription is a round-trip', () => {
            const rec: SubscriptionRecord = freeRecord(W1);
            rec.tier = 'plus';
            rec.monthsPaid = 1;
            rec.expiresAt = NOW + SECONDS_PER_MONTH;
            saveSubscription(rec);
            const got = getSubscription(W1);
            expect(got?.tier).toBe('plus');
            expect(got?.monthsPaid).toBe(1);
        });

        it('record under wrong wallet returns null', () => {
            const rec = freeRecord(W1);
            rec.tier = 'plus';
            saveSubscription(rec);
            // Tampered key for W2 holding W1's record
            localStorage.setItem('echelon.subscription.' + W2, JSON.stringify(rec));
            expect(getSubscription(W2)).toBeNull();
        });

        it('garbage in localStorage returns null', () => {
            localStorage.setItem('echelon.subscription.' + W1, 'not-json');
            expect(getSubscription(W1)).toBeNull();
        });

        it('clearSubscription removes the record', () => {
            const rec = freeRecord(W1);
            rec.tier = 'plus';
            saveSubscription(rec);
            clearSubscription(W1);
            expect(getSubscription(W1)).toBeNull();
        });

        it('per-wallet isolation', () => {
            const r1 = freeRecord(W1);
            r1.tier = 'plus';
            saveSubscription(r1);
            const r2 = freeRecord(W2);
            r2.tier = 'privacy';
            saveSubscription(r2);
            expect(getSubscription(W1)?.tier).toBe('plus');
            expect(getSubscription(W2)?.tier).toBe('privacy');
        });
    });

    describe('isActiveSubscription', () => {
        it('false for null', () => {
            expect(isActiveSubscription(null)).toBe(false);
        });
        it('false for free tier', () => {
            const rec = freeRecord(W1);
            expect(isActiveSubscription(rec, NOW)).toBe(false);
        });
        it('true when expiresAt is in the future', () => {
            const rec: SubscriptionRecord = { ...freeRecord(W1), tier: 'plus', expiresAt: NOW + 100 };
            expect(isActiveSubscription(rec, NOW)).toBe(true);
        });
        it('false when expiresAt is in the past', () => {
            const rec: SubscriptionRecord = { ...freeRecord(W1), tier: 'plus', expiresAt: NOW - 100 };
            expect(isActiveSubscription(rec, NOW)).toBe(false);
        });
        it('false at exactly expiresAt (strict >)', () => {
            const rec: SubscriptionRecord = { ...freeRecord(W1), tier: 'plus', expiresAt: NOW };
            expect(isActiveSubscription(rec, NOW)).toBe(false);
        });
    });

    describe('applySubscribe', () => {
        it('first subscribe sets tier, expires 30d × N months from now', () => {
            const updated = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig123',
                isFirstSubscribe: true,
                isSeekerHolder: false,
                nowSec: NOW,
            });
            expect(updated.tier).toBe('plus');
            expect(updated.monthsPaid).toBe(1);
            expect(updated.renewalCount).toBe(1);
            expect(updated.startedAt).toBe(NOW);
            expect(updated.expiresAt).toBe(NOW + SECONDS_PER_MONTH);
            expect(updated.totalUsdcPaid).toBe(9_000_000);
            expect(updated.isSeekerHolder).toBe(false);
            expect(updated.lastPaymentSignature).toBe('sig123');
        });

        it('Seeker holder flag is set when isFirstSubscribe + isSeekerHolder', () => {
            const updated = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig',
                isFirstSubscribe: true,
                isSeekerHolder: true,
                nowSec: NOW,
            });
            expect(updated.isSeekerHolder).toBe(true);
        });

        it('Seeker flag NOT set on subsequent renewals', () => {
            // First subscribe — non-Seeker
            let rec = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig',
                isFirstSubscribe: true,
                isSeekerHolder: false,
                nowSec: NOW,
            });
            // Renew, claim Seeker now (too late)
            rec = applySubscribe(rec, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig2',
                isFirstSubscribe: false,
                isSeekerHolder: true,
                nowSec: NOW + 100,
            });
            expect(rec.isSeekerHolder).toBe(false);
        });

        it('Seeker flag is sticky once true', () => {
            let rec = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig',
                isFirstSubscribe: true,
                isSeekerHolder: true,
                nowSec: NOW,
            });
            // Renew with isSeekerHolder=false → stays true
            rec = applySubscribe(rec, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig2',
                isFirstSubscribe: false,
                isSeekerHolder: false,
                nowSec: NOW + 100,
            });
            expect(rec.isSeekerHolder).toBe(true);
        });

        it('renewal stacks expiresAt instead of overwriting', () => {
            const first = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig',
                isFirstSubscribe: true,
                isSeekerHolder: false,
                nowSec: NOW,
            });
            // Renew 1 day in (still active), should extend from first.expiresAt
            const renewed = applySubscribe(first, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig2',
                isFirstSubscribe: false,
                isSeekerHolder: false,
                nowSec: NOW + SECONDS_PER_DAY,
            });
            expect(renewed.expiresAt).toBe(first.expiresAt + SECONDS_PER_MONTH);
        });

        it('renewal after expiry restarts from now', () => {
            const first = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig',
                isFirstSubscribe: true,
                isSeekerHolder: false,
                nowSec: NOW,
            });
            const renewedLater = applySubscribe(first, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig2',
                isFirstSubscribe: false,
                isSeekerHolder: false,
                nowSec: NOW + 60 * SECONDS_PER_DAY,
            });
            expect(renewedLater.expiresAt).toBe(NOW + 60 * SECONDS_PER_DAY + SECONDS_PER_MONTH);
        });

        it('upgrade tracks new tier', () => {
            let rec = applySubscribe(null, {
                wallet: W1,
                tier: 'plus',
                durationMonths: 1,
                micros: 9_000_000,
                signature: 'sig',
                isFirstSubscribe: true,
                isSeekerHolder: false,
                nowSec: NOW,
            });
            rec = applySubscribe(rec, {
                wallet: W1,
                tier: 'privacy',
                durationMonths: 1,
                micros: 29_000_000,
                signature: 'sig2',
                isFirstSubscribe: false,
                isSeekerHolder: false,
                nowSec: NOW + SECONDS_PER_DAY,
            });
            expect(rec.tier).toBe('privacy');
            expect(rec.totalUsdcPaid).toBe(38_000_000);
        });
    });

    describe('recordEepgenUsage / recordTemplatePurchase', () => {
        it('recordEepgenUsage adds to total and clamps negative', () => {
            const rec = freeRecord(W1);
            rec.tier = 'plus';
            saveSubscription(rec);
            recordEepgenUsage(W1, 5000);
            recordEepgenUsage(W1, -100); // ignored
            expect(getSubscription(W1)?.totalEepgenTokensUsed).toBe(5000);
        });

        it('recordEepgenUsage no-ops on un-subscribed wallet', () => {
            recordEepgenUsage(W1, 100);
            expect(getSubscription(W1)).toBeNull();
        });

        it('recordTemplatePurchase caps at 1', () => {
            recordTemplatePurchase(W1);
            recordTemplatePurchase(W1);
            recordTemplatePurchase(W1);
            expect(getSubscription(W1)?.totalTemplatePurchases).toBe(1);
        });
    });

    describe('computeAirdropWeight', () => {
        it('zero for free tier', () => {
            expect(computeAirdropWeight(freeRecord(W1))).toBe(0);
        });

        it('Plus 6mo = 6 × 4 = 24', () => {
            const rec: SubscriptionRecord = { ...freeRecord(W1), tier: 'plus', monthsPaid: 6 };
            expect(computeAirdropWeight(rec)).toBe(24);
        });

        it('Privacy 12mo = 12 × 12 = 144', () => {
            const rec: SubscriptionRecord = { ...freeRecord(W1), tier: 'privacy', monthsPaid: 12 };
            expect(computeAirdropWeight(rec)).toBe(144);
        });

        it('Operator 12mo = 12 × 40 = 480', () => {
            const rec: SubscriptionRecord = { ...freeRecord(W1), tier: 'operator', monthsPaid: 12 };
            expect(computeAirdropWeight(rec)).toBe(480);
        });

        it('Seeker holder = 2× weight', () => {
            const rec: SubscriptionRecord = {
                ...freeRecord(W1),
                tier: 'plus',
                monthsPaid: 6,
                isSeekerHolder: true,
            };
            expect(computeAirdropWeight(rec)).toBe(48);
        });

        it('Template purchase adds +5', () => {
            const rec: SubscriptionRecord = {
                ...freeRecord(W1),
                tier: 'plus',
                monthsPaid: 1,
                totalTemplatePurchases: 1,
            };
            // 1*4 + 5 = 9
            expect(computeAirdropWeight(rec)).toBe(9);
        });

        it('EepGen tokens add +2 per million, capped at 20', () => {
            const a: SubscriptionRecord = {
                ...freeRecord(W1),
                tier: 'plus',
                monthsPaid: 0,
                totalEepgenTokensUsed: 5_000_000,
            };
            // 0*4 + 0 + min(20, 5*2) = 10
            expect(computeAirdropWeight(a)).toBe(10);

            const b: SubscriptionRecord = { ...a, totalEepgenTokensUsed: 50_000_000 };
            // capped at 20
            expect(computeAirdropWeight(b)).toBe(20);
        });

        it('full stack: Plus 6mo + Seeker + template + 3M EepGen', () => {
            const rec: SubscriptionRecord = {
                ...freeRecord(W1),
                tier: 'plus',
                monthsPaid: 6,
                totalTemplatePurchases: 1,
                totalEepgenTokensUsed: 3_000_000,
                isSeekerHolder: true,
            };
            // base = 6*4=24, +5 template, +6 eepgen = 35, *2 seeker = 70
            expect(computeAirdropWeight(rec)).toBe(70);
        });
    });

    describe('tierIdFromName', () => {
        it('maps known names', () => {
            expect(tierIdFromName('Plus')).toBe('plus');
            expect(tierIdFromName('Privacy')).toBe('privacy');
            expect(tierIdFromName('OPERATOR')).toBe('operator');
            expect(tierIdFromName('Free')).toBe('free');
        });
        it('falls back to free for unknown names', () => {
            expect(tierIdFromName('Whatever')).toBe('free');
            expect(tierIdFromName('')).toBe('free');
        });
    });
});
