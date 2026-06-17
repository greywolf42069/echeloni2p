import { useCallback, useEffect, useRef, useState } from 'react';
import { useEchelonConfig } from './useEchelonConfig.ts';
import {
    type BlockEvent,
    FilterClientError,
    getFilterEvents,
} from './filterEventsClient.ts';

export interface UseFilterEventsOptions {
    /** Poll interval, ms. Default 5000. */
    intervalMs?: number;
    /** Maximum events kept in the local accumulator (oldest dropped). Default 100. */
    maxEvents?: number;
}

export interface UseFilterEventsResult {
    events: BlockEvent[];          // newest LAST in this list (chronological)
    error: string | null;          // last fetch error; cleared on success
    headSeq: number;
    refresh: () => void;
}

/**
 * Polls /filters/events for new block-events from the local sync daemon.
 *
 * Each poll asks for events with `seq > lastSeenSeq`. New entries are
 * appended to the tail of `events`; when the list exceeds `maxEvents`
 * the oldest entries are dropped.
 *
 * If the daemon is unreachable (proxy not running, daemon not started)
 * the hook keeps polling and reports `error` — events stay empty rather
 * than fabricating anything. The previous Math.random() simulation is
 * gone for good.
 */
export function useFilterEvents(opts: UseFilterEventsOptions = {}): UseFilterEventsResult {
    const intervalMs = opts.intervalMs ?? 5000;
    const maxEvents = opts.maxEvents ?? 100;

    const { config } = useEchelonConfig();
    const [events, setEvents] = useState<BlockEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [headSeq, setHeadSeq] = useState<number>(0);

    const lastSeenRef = useRef<number>(0);
    const tickRef = useRef<number | null>(null);
    const inFlightRef = useRef<AbortController | null>(null);

    const fetchOnce = useCallback(async () => {
        if (inFlightRef.current) inFlightRef.current.abort();
        const ctrl = new AbortController();
        inFlightRef.current = ctrl;
        try {
            const resp = await getFilterEvents(config, lastSeenRef.current);
            // Discard if a newer fetch superseded this one.
            if (ctrl.signal.aborted) return;
            if (resp.events.length > 0) {
                setEvents(prev => {
                    const merged = [...prev, ...resp.events];
                    return merged.length > maxEvents
                        ? merged.slice(merged.length - maxEvents)
                        : merged;
                });
                lastSeenRef.current = Math.max(
                    lastSeenRef.current,
                    ...resp.events.map(e => e.seq),
                );
            }
            setHeadSeq(resp.headSeq);
            setError(null);
        } catch (e) {
            if (ctrl.signal.aborted) return;
            const msg = e instanceof FilterClientError ? e.message
                      : e instanceof Error ? e.message : 'unknown error';
            setError(msg);
        }
    }, [config, maxEvents]);

    useEffect(() => {
        fetchOnce();
        tickRef.current = window.setInterval(fetchOnce, intervalMs);
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            if (inFlightRef.current) inFlightRef.current.abort();
        };
    }, [fetchOnce, intervalMs]);

    return { events, error, headSeq, refresh: fetchOnce };
}
