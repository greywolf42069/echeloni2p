import { useEffect, useRef, useState } from 'react';
import { type EchelonConfig, useEchelonConfig, buildI2pConsoleUrl } from './useEchelonConfig.ts';

export type RouterStatus = 'unknown' | 'running' | 'down';

export interface RouterHealth {
    status: RouterStatus;
    consoleUrl: string;
    lastCheckedAt: Date | null;
}

/**
 * Polls the i2pd web console (default 127.0.0.1:7070) at a fixed interval
 * and returns whether it's reachable. Browsers cannot read cross-origin
 * HTML from i2pd's console, so we use a no-cors GET — a successful fetch
 * implies the port is open and serving HTTP.
 */
export function useI2pRouterHealth(intervalMs: number = 5000): RouterHealth & {
    config: EchelonConfig;
    refresh: () => void;
} {
    const { config } = useEchelonConfig();
    const [status, setStatus] = useState<RouterStatus>('unknown');
    const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
    const tickRef = useRef<number | null>(null);
    const inFlightRef = useRef<AbortController | null>(null);

    const consoleUrl = buildI2pConsoleUrl(config);

    const probe = async () => {
        if (inFlightRef.current) inFlightRef.current.abort();
        const ctrl = new AbortController();
        inFlightRef.current = ctrl;
        const timeout = setTimeout(() => ctrl.abort(), 4000);
        try {
            await fetch(consoleUrl, { mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' });
            setStatus('running');
        } catch {
            setStatus('down');
        } finally {
            clearTimeout(timeout);
            setLastCheckedAt(new Date());
        }
    };

    useEffect(() => {
        probe();
        tickRef.current = window.setInterval(probe, intervalMs);
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            if (inFlightRef.current) inFlightRef.current.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [consoleUrl, intervalMs]);

    return {
        status,
        consoleUrl,
        lastCheckedAt,
        config,
        refresh: probe,
    };
}
