import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_FEATURE_FLAGS,
    __FEATURE_FLAGS_INTERNALS__,
    getFeatureFlags,
    isFeatureEnabled,
    resetFeatureFlags,
    setFeatureFlag,
    subscribeFeatureFlags,
} from '../featureFlags';

const { STORAGE_PREFIX } = __FEATURE_FLAGS_INTERNALS__;

describe('featureFlags', () => {
    beforeEach(() => {
        // Clear ALL echelon flag overrides before each test.
        resetFeatureFlags();
    });

    afterEach(() => {
        resetFeatureFlags();
    });

    describe('defaults', () => {
        it('tokenEconomy defaults to false in v0.1', () => {
            expect(DEFAULT_FEATURE_FLAGS.tokenEconomy).toBe(false);
        });

        it('product features default to true', () => {
            expect(DEFAULT_FEATURE_FLAGS.airdropTracking).toBe(true);
            expect(DEFAULT_FEATURE_FLAGS.hostedEepGen).toBe(true);
            expect(DEFAULT_FEATURE_FLAGS.premiumTemplates).toBe(true);
            expect(DEFAULT_FEATURE_FLAGS.outproxyConfig).toBe(true);
            expect(DEFAULT_FEATURE_FLAGS.threatFilter).toBe(true);
        });

        it('getFeatureFlags returns defaults when nothing is overridden', () => {
            expect(getFeatureFlags()).toEqual(DEFAULT_FEATURE_FLAGS);
        });

        it('returned flags object is frozen', () => {
            const flags = getFeatureFlags();
            expect(Object.isFrozen(flags)).toBe(true);
        });
    });

    describe('setFeatureFlag', () => {
        it('persists to localStorage with the prefixed key', () => {
            setFeatureFlag('tokenEconomy', true);
            expect(localStorage.getItem(STORAGE_PREFIX + 'tokenEconomy')).toBe('true');
        });

        it('reads back the override via getFeatureFlags', () => {
            setFeatureFlag('tokenEconomy', true);
            expect(getFeatureFlags().tokenEconomy).toBe(true);
        });

        it('clears override when called with undefined', () => {
            setFeatureFlag('tokenEconomy', true);
            expect(getFeatureFlags().tokenEconomy).toBe(true);
            setFeatureFlag('tokenEconomy', undefined);
            expect(getFeatureFlags().tokenEconomy).toBe(DEFAULT_FEATURE_FLAGS.tokenEconomy);
        });

        it('does not affect other flags', () => {
            setFeatureFlag('tokenEconomy', true);
            const flags = getFeatureFlags();
            expect(flags.airdropTracking).toBe(DEFAULT_FEATURE_FLAGS.airdropTracking);
            expect(flags.hostedEepGen).toBe(DEFAULT_FEATURE_FLAGS.hostedEepGen);
            expect(flags.premiumTemplates).toBe(DEFAULT_FEATURE_FLAGS.premiumTemplates);
        });

        it('handles false override too', () => {
            setFeatureFlag('hostedEepGen', false);
            expect(getFeatureFlags().hostedEepGen).toBe(false);
        });
    });

    describe('isFeatureEnabled', () => {
        it('mirrors getFeatureFlags', () => {
            expect(isFeatureEnabled('tokenEconomy')).toBe(false);
            setFeatureFlag('tokenEconomy', true);
            expect(isFeatureEnabled('tokenEconomy')).toBe(true);
        });
    });

    describe('parseStoredFlag tolerance', () => {
        it('accepts "1" as true', () => {
            localStorage.setItem(STORAGE_PREFIX + 'tokenEconomy', '1');
            expect(getFeatureFlags().tokenEconomy).toBe(true);
        });

        it('accepts "0" as false', () => {
            localStorage.setItem(STORAGE_PREFIX + 'hostedEepGen', '0');
            expect(getFeatureFlags().hostedEepGen).toBe(false);
        });

        it('is case-insensitive ("TRUE")', () => {
            localStorage.setItem(STORAGE_PREFIX + 'tokenEconomy', 'TRUE');
            expect(getFeatureFlags().tokenEconomy).toBe(true);
        });

        it('falls back to default on garbage input', () => {
            localStorage.setItem(STORAGE_PREFIX + 'tokenEconomy', 'maybe-perhaps');
            expect(getFeatureFlags().tokenEconomy).toBe(DEFAULT_FEATURE_FLAGS.tokenEconomy);
        });

        it('falls back to default on empty string', () => {
            localStorage.setItem(STORAGE_PREFIX + 'tokenEconomy', '');
            expect(getFeatureFlags().tokenEconomy).toBe(DEFAULT_FEATURE_FLAGS.tokenEconomy);
        });
    });

    describe('resetFeatureFlags', () => {
        it('removes all overrides', () => {
            setFeatureFlag('tokenEconomy', true);
            setFeatureFlag('hostedEepGen', false);
            setFeatureFlag('premiumTemplates', false);
            resetFeatureFlags();
            expect(getFeatureFlags()).toEqual(DEFAULT_FEATURE_FLAGS);
        });

        it('does not touch unrelated localStorage keys', () => {
            localStorage.setItem('echelon.unrelated', 'keep-me');
            setFeatureFlag('tokenEconomy', true);
            resetFeatureFlags();
            expect(localStorage.getItem('echelon.unrelated')).toBe('keep-me');
        });
    });

    describe('subscribeFeatureFlags', () => {
        it('fires the listener when a flag changes via setFeatureFlag', () => {
            const listener = vi.fn();
            const unsub = subscribeFeatureFlags(listener);
            setFeatureFlag('tokenEconomy', true);
            expect(listener).toHaveBeenCalled();
            const lastArg = listener.mock.calls[listener.mock.calls.length - 1][0];
            expect(lastArg.tokenEconomy).toBe(true);
            unsub();
        });

        it('does NOT fire after unsubscribe', () => {
            const listener = vi.fn();
            const unsub = subscribeFeatureFlags(listener);
            unsub();
            setFeatureFlag('tokenEconomy', true);
            expect(listener).not.toHaveBeenCalled();
        });

        it('fires on cross-tab storage events for echelon flag keys', () => {
            const listener = vi.fn();
            const unsub = subscribeFeatureFlags(listener);
            // Simulate another tab writing a flag
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key: STORAGE_PREFIX + 'tokenEconomy',
                    newValue: 'true',
                    oldValue: null,
                }),
            );
            expect(listener).toHaveBeenCalled();
            unsub();
        });

        it('ignores storage events for unrelated keys', () => {
            const listener = vi.fn();
            const unsub = subscribeFeatureFlags(listener);
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key: 'someUnrelatedKey',
                    newValue: 'whatever',
                    oldValue: null,
                }),
            );
            expect(listener).not.toHaveBeenCalled();
            unsub();
        });

        it('fires once per setFeatureFlag call', () => {
            const listener = vi.fn();
            const unsub = subscribeFeatureFlags(listener);
            setFeatureFlag('tokenEconomy', true);
            setFeatureFlag('tokenEconomy', false);
            setFeatureFlag('tokenEconomy', true);
            expect(listener).toHaveBeenCalledTimes(3);
            unsub();
        });

        it('handles resetFeatureFlags', () => {
            setFeatureFlag('tokenEconomy', true);
            const listener = vi.fn();
            const unsub = subscribeFeatureFlags(listener);
            resetFeatureFlags();
            expect(listener).toHaveBeenCalled();
            const lastArg = listener.mock.calls[listener.mock.calls.length - 1][0];
            expect(lastArg.tokenEconomy).toBe(DEFAULT_FEATURE_FLAGS.tokenEconomy);
            unsub();
        });
    });
});
