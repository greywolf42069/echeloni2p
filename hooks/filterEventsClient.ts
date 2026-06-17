/**
 * Filter events + subscription client.
 *
 * Wraps:
 *   GET    /filters/events?since=N  — recent block events
 *   GET    /filters/lists           — subscribed blocklists
 *   POST   /filters/lists           — add a subscription
 *   DELETE /filters/lists/{id}      — remove one
 *   POST   /filters/refresh         — refresh all
 *   GET    /filters/blocklist       — compiled blocklist size + sample
 */
import { type EchelonConfig, buildSyncDaemonUrl, daemonAuthHeaders } from './useEchelonConfig.ts';

export interface BlockEvent {
    seq: number;
    timestamp: number;     // unix seconds (UTC)
    domain: string;
    list_source: string;
    request_kind: string;  // 'http' | 'connect' | 'get' | 'post' | ...
}

export interface FilterEventsResponse {
    events: BlockEvent[];
    headSeq: number;
    bufferSize: number;
    bufferCap: number;
}

export interface FilterSubscription {
    id: string;
    name: string;
    url: string;
    fmt: string;
    etag: string | null;
    last_refresh: number;
    last_status: string;
    entry_count: number;
}

export interface WellKnownList {
    id: string;
    name: string;
    url: string;
    format: string;
}

export interface FilterListsResponse {
    filtersRoot: string;
    subscriptions: FilterSubscription[];
    wellKnown: WellKnownList[];
}

export interface FilterRefreshResponse {
    subscriptions: FilterSubscription[];
    blocklistSize: number;
}

export interface FilterBlocklistResponse {
    filtersRoot: string;
    blocklistSize: number;
    sample: string[];
}

export class FilterClientError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'FilterClientError';
    }
}

async function _fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    let resp: Response;
    // Merge the per-device auth token into every daemon call.
    const withAuth: RequestInit = {
        ...init,
        headers: daemonAuthHeaders(init?.headers as Record<string, string> | undefined),
    };
    try {
        resp = await fetch(url, withAuth);
    } catch (e) {
        throw new FilterClientError(`Could not reach sync daemon at ${url}.`, e);
    }
    if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json()).error ?? ''; } catch { /* */ }
        throw new FilterClientError(detail || `Sync daemon responded ${resp.status} ${resp.statusText}`);
    }
    return (await resp.json()) as T;
}

/* ─── Events ─────────────────────────────────────────────────────────── */

export async function getFilterEvents(
    config: EchelonConfig,
    since: number = 0,
): Promise<FilterEventsResponse> {
    const url = buildSyncDaemonUrl(config, `filters/events?since=${encodeURIComponent(since)}`);
    return _fetchJson<FilterEventsResponse>(url, { method: 'GET', cache: 'no-store' });
}

/* ─── Subscriptions ──────────────────────────────────────────────────── */

export async function getFilterLists(config: EchelonConfig): Promise<FilterListsResponse> {
    return _fetchJson<FilterListsResponse>(
        buildSyncDaemonUrl(config, 'filters/lists'),
        { method: 'GET', cache: 'no-store' },
    );
}

export async function addFilterList(
    config: EchelonConfig,
    spec: { name: string; url: string; format?: string },
): Promise<{ subscription: FilterSubscription }> {
    return _fetchJson<{ subscription: FilterSubscription }>(
        buildSyncDaemonUrl(config, 'filters/lists'),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: spec.name,
                url: spec.url,
                format: spec.format ?? 'hosts',
            }),
        },
    );
}

export async function removeFilterList(
    config: EchelonConfig,
    subId: string,
): Promise<{ removed: string }> {
    if (!/^[A-Za-z0-9]{1,64}$/.test(subId)) {
        throw new FilterClientError(`refusing to send unsafe subscription id: ${subId}`);
    }
    return _fetchJson<{ removed: string }>(
        buildSyncDaemonUrl(config, `filters/lists/${encodeURIComponent(subId)}`),
        { method: 'DELETE' },
    );
}

export async function refreshFilterLists(config: EchelonConfig): Promise<FilterRefreshResponse> {
    return _fetchJson<FilterRefreshResponse>(
        buildSyncDaemonUrl(config, 'filters/refresh'),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        },
    );
}

export async function getFilterBlocklist(config: EchelonConfig): Promise<FilterBlocklistResponse> {
    return _fetchJson<FilterBlocklistResponse>(
        buildSyncDaemonUrl(config, 'filters/blocklist'),
        { method: 'GET', cache: 'no-store' },
    );
}
