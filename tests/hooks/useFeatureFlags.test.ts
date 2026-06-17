import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import {
    DEFAULT_FEATURE_FLAGS,
    resetFeatureFlags,
    setFeatureFlag,
} from '../../featureFlags';

describe('useFeatureFlags', () => {
    beforeEach(() => {
        resetFeatureFlags();
    });
    afterEach(() => {
        resetFeatureFlags();
    });

    it('returns defaults on initial render', () => {
        const { result } = renderHook(() => useFeatureFlags());
        expect(result.current).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('returns the override value when one is set before render', () => {
        setFeatureFlag('tokenEconomy', true);
        const { result } = renderHook(() => useFeatureFlags());
        expect(result.current.tokenEconomy).toBe(true);
    });

    it('re-renders with new value when a flag changes during the component lifetime', () => {
        const { result } = renderHook(() => useFeatureFlags());
        expect(result.current.tokenEconomy).toBe(false);
        act(() => {
            setFeatureFlag('tokenEconomy', true);
        });
        expect(result.current.tokenEconomy).toBe(true);
    });

    it('handles a sequence of flag changes', () => {
        const { result } = renderHook(() => useFeatureFlags());
        act(() => setFeatureFlag('tokenEconomy', true));
        expect(result.current.tokenEconomy).toBe(true);
        act(() => setFeatureFlag('hostedEepGen', false));
        expect(result.current.hostedEepGen).toBe(false);
        expect(result.current.tokenEconomy).toBe(true);
        act(() => resetFeatureFlags());
        expect(result.current).toEqual(DEFAULT_FEATURE_FLAGS);
    });

    it('cleans up the subscription on unmount', () => {
        const { result, unmount } = renderHook(() => useFeatureFlags());
        unmount();
        // Subsequent flag changes must not throw, and the (now-stale)
        // result snapshot should NOT update.
        const beforeChange = result.current;
        setFeatureFlag('tokenEconomy', true);
        expect(result.current).toBe(beforeChange);
    });
});
