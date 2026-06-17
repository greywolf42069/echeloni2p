/**
 * filterEventsClient + useFilterEvents tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';
import {
    FilterClientError,
    getFilterEvents,
    getFilterLists,
    addFilterList,
    removeFilterList,
    refreshFilterLists,
    getFilterBlocklist,
} from '../../hooks/filterEventsClient';
import { useFilterEvents } from '../../hooks/useFilterEvents';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
afterEach(() => { fetchSpy.mockRestore(); vi.useRealTimers(); });

/* ─── client ─────────────────────────────────────────────────────────── */

describe('getFilterEvents', () => {
    it('GETs /filters/events with the since param', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            events: [], headSeq: 0, bufferSize: 0, bufferCap: 200,
        }), { status: 200 }));
        await getFilterEvents(DEFAULT_CONFIG, 42);
        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/filters/events?since=42');
    });

    it('throws FilterClientError on network failure', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        await expect(getFilterEvents(DEFAULT_CONFIG, 0))
            .rejects.toBeInstanceOf(FilterClientError);
    });
});

describe('subscription endpoints', () => {
    it('getFilterLists hits the right URL', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            filtersRoot: '/x', subscriptions: [], wellKnown: [],
        }), { status: 200 }));
        await getFilterLists(DEFAULT_CONFIG);
        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/filters/lists');
    });

    it('addFilterList POSTs the right body', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            subscription: { id: 'abc', name: 'L', url: 'https://x', fmt: 'hosts',
                            etag: null, last_refresh: 0, last_status: 'never', entry_count: 0 },
        }), { status: 200 }));
        await addFilterList(DEFAULT_CONFIG, { name: 'L', url: 'https://x' });
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init!.body as string);
        expect(body.name).toBe('L');
        expect(body.url).toBe('https://x');
        expect(body.format).toBe('hosts');
    });

    it('addFilterList surfaces the daemon error message on 400', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            error: 'unsafe list url: javascript:alert(1)',
        }), { status: 400 }));
        await expect(addFilterList(DEFAULT_CONFIG, { name: 'X', url: 'javascript:alert(1)' }))
            .rejects.toThrow(/unsafe list url/);
    });

    it('removeFilterList refuses unsafe ids client-side', async () => {
        await expect(removeFilterList(DEFAULT_CONFIG, '../etc/passwd'))
            .rejects.toBeInstanceOf(FilterClientError);
        // No fetch was made.
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refreshFilterLists POSTs to /filters/refresh', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            subscriptions: [], blocklistSize: 0,
        }), { status: 200 }));
        await refreshFilterLists(DEFAULT_CONFIG);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/filters/refresh');
        expect(init?.method).toBe('POST');
    });

    it('getFilterBlocklist hits /filters/blocklist', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            filtersRoot: '/x', blocklistSize: 100, sample: [],
        }), { status: 200 }));
        await getFilterBlocklist(DEFAULT_CONFIG);
        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/filters/blocklist');
    });
});

/* ─── useFilterEvents hook ───────────────────────────────────────────── */

const sampleEvent = (seq: number, domain: string) => ({
    seq, timestamp: 1700000000 + seq, domain,
    list_source: 'StevenBlack', request_kind: 'get',
});

describe('useFilterEvents', () => {
    it('appends new events to the tail of events list', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            events: [sampleEvent(1, 'a.com'), sampleEvent(2, 'b.com')],
            headSeq: 2, bufferSize: 2, bufferCap: 200,
        }), { status: 200 }));

        const { result } = renderHook(() => useFilterEvents({ intervalMs: 60_000 }));
        await waitFor(() => expect(result.current.events).toHaveLength(2));
        expect(result.current.events[0].domain).toBe('a.com');
        expect(result.current.events[1].domain).toBe('b.com');
        expect(result.current.headSeq).toBe(2);
        expect(result.current.error).toBeNull();
    });

    it('uses the highest seen seq on subsequent fetches', async () => {
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
            events: [sampleEvent(1, 'a.com')],
            headSeq: 1, bufferSize: 1, bufferCap: 200,
        }), { status: 200 }));
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            events: [sampleEvent(5, 'b.com')],
            headSeq: 5, bufferSize: 2, bufferCap: 200,
        }), { status: 200 }));

        const { result } = renderHook(() => useFilterEvents({ intervalMs: 60_000 }));
        await waitFor(() => expect(result.current.events).toHaveLength(1));

        await act(async () => { await result.current.refresh(); });
        await waitFor(() => expect(result.current.events).toHaveLength(2));

        // Second fetch sent since=1 (highest of first batch).
        const [url2] = fetchSpy.mock.calls[1] as [string, RequestInit];
        expect(url2).toContain('since=1');
    });

    it('caps total events to maxEvents (oldest dropped)', async () => {
        // Fetch returns 5 events at once; maxEvents=3 → only newest 3 kept.
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            events: [
                sampleEvent(1, 'd1.com'), sampleEvent(2, 'd2.com'),
                sampleEvent(3, 'd3.com'), sampleEvent(4, 'd4.com'),
                sampleEvent(5, 'd5.com'),
            ],
            headSeq: 5, bufferSize: 5, bufferCap: 200,
        }), { status: 200 }));

        const { result } = renderHook(() => useFilterEvents({ intervalMs: 60_000, maxEvents: 3 }));
        await waitFor(() => expect(result.current.events).toHaveLength(3));
        expect(result.current.events.map(e => e.domain)).toEqual(['d3.com', 'd4.com', 'd5.com']);
    });

    it('surfaces an error when the daemon is unreachable + keeps polling', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        const { result } = renderHook(() => useFilterEvents({ intervalMs: 60_000 }));
        await waitFor(() => expect(result.current.error).not.toBeNull());
        // The client wraps low-level errors with a friendly message.
        expect(result.current.error).toMatch(/Could not reach sync daemon/);
        expect(result.current.events).toEqual([]);
    });

    it('clears error after a recovery', async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError('first fail'));
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            events: [sampleEvent(1, 'ok.com')],
            headSeq: 1, bufferSize: 1, bufferCap: 200,
        }), { status: 200 }));
        const { result } = renderHook(() => useFilterEvents({ intervalMs: 60_000 }));
        await waitFor(() => expect(result.current.error).not.toBeNull());

        await act(async () => { await result.current.refresh(); });
        await waitFor(() => expect(result.current.error).toBeNull());
        expect(result.current.events).toHaveLength(1);
    });

    it('cleans up interval + in-flight on unmount', async () => {
        vi.useFakeTimers();
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            events: [], headSeq: 0, bufferSize: 0, bufferCap: 200,
        }), { status: 200 }));
        const { unmount } = renderHook(() => useFilterEvents({ intervalMs: 1000 }));
        await act(async () => { await Promise.resolve(); });
        const before = fetchSpy.mock.calls.length;
        unmount();
        await act(async () => {
            vi.advanceTimersByTime(5000);
            await Promise.resolve();
        });
        expect(fetchSpy.mock.calls.length).toBe(before);
    });
});
