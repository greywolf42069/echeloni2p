/**
 * Browser-side wrapper around the daemon's /i2pd/outproxy endpoint.
 *
 * The daemon is the only thing that touches ~/.i2pd/tunnels.conf —
 * we just send/receive the desired spec.
 */
import { type EchelonConfig, buildSyncDaemonUrl, daemonAuthHeaders } from './useEchelonConfig.ts';

export type OutproxyMode = 'disabled' | 'http' | 'socks' | 'both';

export interface OutproxySpec {
    mode: OutproxyMode;
    upstream_host: string;
    http_upstream_port: number;
    socks_upstream_port: number;
    advertise: boolean;
    /** Returned by the daemon — read-only on the client. */
    http_keys_file?: string;
    socks_keys_file?: string;
}

export interface OutproxyResponse {
    tunnelsPath: string;
    spec: OutproxySpec;
    /** Locked by the daemon (always 127.0.0.1). Surfaced for UX clarity. */
    lockedBindHost: string;
}

export class OutproxyClientError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'OutproxyClientError';
    }
}

export async function getOutproxy(config: EchelonConfig): Promise<OutproxyResponse> {
    const url = buildSyncDaemonUrl(config, 'i2pd/outproxy');
    let resp: Response;
    try {
        resp = await fetch(url, { method: 'GET', cache: 'no-store', headers: daemonAuthHeaders() });
    } catch (e) {
        throw new OutproxyClientError(`Could not reach sync daemon at ${url}.`, e);
    }
    if (!resp.ok) {
        throw new OutproxyClientError(`Sync daemon responded ${resp.status} ${resp.statusText}`);
    }
    return (await resp.json()) as OutproxyResponse;
}

export async function setOutproxy(
    config: EchelonConfig,
    spec: Pick<OutproxySpec, 'mode' | 'upstream_host' | 'http_upstream_port' | 'socks_upstream_port' | 'advertise'>,
): Promise<OutproxyResponse> {
    const url = buildSyncDaemonUrl(config, 'i2pd/outproxy');
    let resp: Response;
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(spec),
        });
    } catch (e) {
        throw new OutproxyClientError(`Could not reach sync daemon at ${url}.`, e);
    }
    if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json()).error ?? ''; } catch { /* */ }
        throw new OutproxyClientError(detail || `Sync daemon responded ${resp.status} ${resp.statusText}`);
    }
    return (await resp.json()) as OutproxyResponse;
}
