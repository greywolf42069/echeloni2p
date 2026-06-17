import { useCallback, useEffect, useRef, useState } from 'react';
import {
    type EchelonConfig,
    useEchelonConfig,
    buildSyncDaemonUrl,
    daemonAuthHeaders,
} from './useEchelonConfig.ts';

/**
 * Shape mirrored from `scripts/i2pd_stats.empty_stats()`.
 * Every field is always present so consumers don't need to null-check.
 */
export interface I2pStats {
    running: boolean;
    version: string | null;
    networkStatus: string;
    uptimeSeconds: number;
    tunnelCreationSuccessPercent: number;
    receivedBps: number;
    sentBps: number;
    transitBps: number;
    totalReceivedBytes: number;
    totalSentBytes: number;
    totalTransitBytes: number;
    routers: number;
    floodfills: number;
    leaseSets: number;
    tunnelsClient: number;
    tunnelsTransit: number;
}

export const EMPTY_STATS: I2pStats = {
    running: false,
    version: null,
    networkStatus: 'Unknown',
    uptimeSeconds: 0,
    tunnelCreationSuccessPercent: 0,
    receivedBps: 0,
    sentBps: 0,
    transitBps: 0,
    totalReceivedBytes: 0,
    totalSentBytes: 0,
    totalTransitBytes: 0,
    routers: 0,
    floodfills: 0,
    leaseSets: 0,
    tunnelsClient: 0,
    tunnelsTransit: 0,
};

export interface UseI2pStatsResult {
    stats: I2pStats;
    /** Most recent fetch error, if any. Cleared on each successful fetch. */
    error: string | null;
    loading: boolean;
    /** Trigger an immediate refresh. */
    refresh: () => void;
    /** Timestamp of the last successful fetch. */
    lastFetchedAt: Date | null;
    config: EchelonConfig;
}

/**
 * Polls the local Echelon sync daemon's `/i2pd/stats` endpoint at a fixed
 * interval. The daemon does the actual i2pd console scraping; we just
 * surface its JSON to React.
 *
 * On any error (daemon down, JSON parse failure, network) the hook
 * returns `EMPTY_STATS` with `error` populated. The interval keeps
 * firing — recovery is automatic when the daemon comes back up.
 */
export function useI2pStats(intervalMs: number = 5000): UseI2pStatsResult {
    const { config } = useEchelonConfig();
    const [stats, setStats] = useState<I2pStats>(EMPTY_STATS);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
    const tickRef = useRef<number | null>(null);
    const inFlightRef = useRef<AbortController | null>(null);

    const url = buildSyncDaemonUrl(config, 'i2pd/stats');

    const fetchOnce = useCallback(async () => {
        if (inFlightRef.current) inFlightRef.current.abort();
        const ctrl = new AbortController();
        inFlightRef.current = ctrl;
        setLoading(true);
        try {
            const resp = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: daemonAuthHeaders() });
            if (!resp.ok) {
                throw new Error(`sync daemon ${resp.status} ${resp.statusText}`);
            }
            const json = (await resp.json()) as Partial<I2pStats>;
            // Merge into EMPTY_STATS so missing fields don't crash consumers.
            setStats({ ...EMPTY_STATS, ...json });
            setError(null);
            setLastFetchedAt(new Date());
        } catch (e) {
            if ((e as DOMException).name === 'AbortError') return;
            setStats(EMPTY_STATS);
            setError(e instanceof Error ? e.message : 'unknown error');
        } finally {
            setLoading(false);
        }
    }, [url]);

    useEffect(() => {
        fetchOnce();
        tickRef.current = window.setInterval(fetchOnce, intervalMs);
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            if (inFlightRef.current) inFlightRef.current.abort();
        };
    }, [fetchOnce, intervalMs]);

    return {
        stats,
        error,
        loading,
        refresh: fetchOnce,
        lastFetchedAt,
        config,
    };
}
