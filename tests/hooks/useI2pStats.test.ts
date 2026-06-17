/**
 * useI2pStats hook tests.
 *
 * Covers:
 *  - success path: fetch returns parsed payload, error cleared
 *  - daemon down: error surfaced, stats fall back to EMPTY_STATS
 *  - polling: subsequent intervals re-fetch
 *  - refresh(): manual immediate re-fetch
 *  - unmount: cancels in-flight + timer
 *  - non-2xx: surfaces error, stats reset
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { EMPTY_STATS, useI2pStats, type I2pStats } from '../../hooks/useI2pStats';

const SAMPLE_STATS: I2pStats = {
    ...EMPTY_STATS,
    running: true,
    version: '2.55.0',
    networkStatus: 'OK',
    uptimeSeconds: 3661,
    routers: 3214,
    floodfills: 174,
    tunnelsClient: 12,
    tunnelsTransit: 47,
    receivedBps: 12345,
    sentBps: 6789,
    transitBps: 4321,
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
});

describe('useI2pStats', () => {
    it('initially returns EMPTY_STATS, then populates after the first fetch', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(SAMPLE_STATS), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        const { result } = renderHook(() => useI2pStats(60_000));

        // First render: still EMPTY before the fetch resolves.
        expect(result.current.stats.running).toBe(false);

        await waitFor(() => expect(result.current.stats.running).toBe(true));
        expect(result.current.stats.routers).toBe(3214);
        expect(result.current.stats.networkStatus).toBe('OK');
        expect(result.current.error).toBeNull();
        expect(result.current.lastFetchedAt).toBeInstanceOf(Date);
    });

    it('targets /i2pd/stats on the configured sync daemon', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(SAMPLE_STATS), { status: 200 }));

        renderHook(() => useI2pStats(60_000));
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/i2pd/stats');
    });

    it('surfaces a network error and falls back to EMPTY_STATS', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));

        const { result } = renderHook(() => useI2pStats(60_000));
        await waitFor(() => expect(result.current.error).not.toBeNull());

        expect(result.current.error).toMatch(/connection refused/);
        expect(result.current.stats).toEqual(EMPTY_STATS);
    });

    it('surfaces a non-2xx response as an error', async () => {
        fetchSpy.mockResolvedValue(new Response('boom', { status: 500, statusText: 'Server Error' }));

        const { result } = renderHook(() => useI2pStats(60_000));
        await waitFor(() => expect(result.current.error).not.toBeNull());

        expect(result.current.error).toMatch(/500/);
        expect(result.current.stats).toEqual(EMPTY_STATS);
    });

    it('clears error after a recovery', async () => {
        // Start in failure mode.
        fetchSpy.mockRejectedValueOnce(new TypeError('first fail'));
        // Then succeed.
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(SAMPLE_STATS), { status: 200 }));

        const { result } = renderHook(() => useI2pStats(60_000));

        await waitFor(() => expect(result.current.error).not.toBeNull());
        await act(async () => {
            await result.current.refresh();
        });
        await waitFor(() => expect(result.current.error).toBeNull());
        expect(result.current.stats.running).toBe(true);
    });

    it('refresh() triggers an immediate extra fetch', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(SAMPLE_STATS), { status: 200 }));

        const { result } = renderHook(() => useI2pStats(60_000));
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

        const before = fetchSpy.mock.calls.length;
        await act(async () => {
            await result.current.refresh();
        });
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(before);
    });

    it('re-polls on the configured interval', async () => {
        vi.useFakeTimers();
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(SAMPLE_STATS), { status: 200 }));

        renderHook(() => useI2pStats(1000));

        // Allow initial probe to settle.
        await act(async () => { await Promise.resolve(); });
        const initial = fetchSpy.mock.calls.length;
        expect(initial).toBeGreaterThanOrEqual(1);

        await act(async () => {
            vi.advanceTimersByTime(2500);
            await Promise.resolve();
        });
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(initial);
    });

    it('unmount cancels in-flight + stops the interval', async () => {
        vi.useFakeTimers();
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(SAMPLE_STATS), { status: 200 }));

        const { unmount } = renderHook(() => useI2pStats(1000));
        await act(async () => { await Promise.resolve(); });
        const before = fetchSpy.mock.calls.length;

        unmount();

        await act(async () => {
            vi.advanceTimersByTime(5000);
            await Promise.resolve();
        });
        expect(fetchSpy.mock.calls.length).toBe(before);
    });

    it('merges partial server payloads into EMPTY_STATS so missing fields stay zero', async () => {
        // Daemon returns only `running` + `routers` — UI shouldn't crash.
        fetchSpy.mockResolvedValue(new Response(
            JSON.stringify({ running: true, routers: 100 }),
            { status: 200 },
        ));

        const { result } = renderHook(() => useI2pStats(60_000));
        await waitFor(() => expect(result.current.stats.routers).toBe(100));

        // Other fields default to EMPTY_STATS values.
        expect(result.current.stats.tunnelsClient).toBe(0);
        expect(result.current.stats.networkStatus).toBe('Unknown');
        expect(result.current.stats.version).toBeNull();
    });
});
