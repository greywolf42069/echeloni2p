/**
 * useI2pRouterHealth tests using fake timers + fetch mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useI2pRouterHealth } from '../../hooks/useI2pRouterHealth';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.useFakeTimers();
});

afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
});

describe('useI2pRouterHealth', () => {
    it('reports running when the console is reachable', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));

        const { result } = renderHook(() => useI2pRouterHealth(5000));

        await act(async () => {
            // Allow the initial probe (microtask) to flush.
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.status).toBe('running');
        expect(result.current.consoleUrl).toBe('http://127.0.0.1:7070/');
        expect(result.current.lastCheckedAt).toBeInstanceOf(Date);
    });

    it('reports down when fetch rejects', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));

        const { result } = renderHook(() => useI2pRouterHealth(5000));
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.status).toBe('down');
    });

    it('re-probes on the polling interval', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));

        renderHook(() => useI2pRouterHealth(1000));

        // Initial probe.
        await act(async () => { await Promise.resolve(); });
        const callsAfterInitial = fetchSpy.mock.calls.length;
        expect(callsAfterInitial).toBeGreaterThanOrEqual(1);

        // Advance past two intervals.
        await act(async () => {
            vi.advanceTimersByTime(2500);
            await Promise.resolve();
        });
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('refresh() triggers an immediate extra probe', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const { result } = renderHook(() => useI2pRouterHealth(60_000));
        await act(async () => { await Promise.resolve(); });

        const before = fetchSpy.mock.calls.length;
        await act(async () => {
            result.current.refresh();
            await Promise.resolve();
        });
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(before);
    });

    it('cancels the interval on unmount', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const { unmount } = renderHook(() => useI2pRouterHealth(1000));
        await act(async () => { await Promise.resolve(); });
        const callsBefore = fetchSpy.mock.calls.length;

        unmount();

        await act(async () => {
            vi.advanceTimersByTime(5000);
            await Promise.resolve();
        });
        // No additional probes after unmount.
        expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    });
});
