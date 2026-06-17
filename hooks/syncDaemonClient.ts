import type { Eepsite, FileTree, FileContent } from '../types.ts';
import { type EchelonConfig, buildSyncDaemonUrl, daemonAuthHeaders } from './useEchelonConfig.ts';

/** Recursively flatten a FileTree into { "path/to/file.html": "...contents..." }. */
export function flattenFileTree(tree: FileTree, prefix: string = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, node] of Object.entries(tree)) {
        const cleanedName = name.replace(/\/$/, '');
        const path = prefix ? `${prefix}/${cleanedName}` : cleanedName;
        if (node && typeof node === 'object' && 'content' in node) {
            out[path] = (node as FileContent).content;
        } else if (node && typeof node === 'object') {
            Object.assign(out, flattenFileTree(node as FileTree, path));
        }
    }
    return out;
}

export interface PublishResult {
    eepsite: string;
    writtenCount: number;
    files: string[];
    diskPath: string;
    quota?: SubscriptionQuotaSummary | null;
}

export interface SubscriptionQuotaSummary {
    tier: string;
    ok: boolean;
    reason?: string;
    entitlement?: {
        page_views_today?: number;
        eepsites_hosted?: number;
        ai_tokens_today?: number;
        publish_bytes_today?: number;
        bandwidth_bytes_today?: number;
    };
    quotas?: {
        daily_page_views?: number;
        hosted_eepsites?: number;
        daily_ai_tokens?: number;
        daily_bandwidth_bytes?: number;
        outproxy?: boolean;
    };
}

export class SyncDaemonError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'SyncDaemonError';
    }
}

/** POST the eepsite's files to the local Echelon sync daemon. */
export async function publishEepsiteToDaemon(
    config: EchelonConfig,
    eepsite: Eepsite,
): Promise<PublishResult> {
    const url = buildSyncDaemonUrl(config, 'publish');
    const flattened = flattenFileTree(eepsite.files);
    const body = JSON.stringify({ eepsite: eepsite.name, files: flattened });

    let resp: Response;
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
            body,
        });
    } catch (e) {
        throw new SyncDaemonError(
            `Could not reach sync daemon at ${url}. Is Termux running and is 'python3 echelon_sync_daemon.py' active?`,
            e,
        );
    }

    if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json()).error ?? ''; } catch { /* ignore */ }
        throw new SyncDaemonError(
            `Sync daemon responded ${resp.status} ${resp.statusText}${detail ? `: ${detail}` : ''}`,
        );
    }

    return await resp.json() as PublishResult;
}

/** Delete a published eepsite from the daemon's webroot. */
export async function unpublishEepsiteFromDaemon(
    config: EchelonConfig,
    eepsiteName: string,
): Promise<void> {
    const url = buildSyncDaemonUrl(config, `eepsite/${encodeURIComponent(eepsiteName)}`);
    let resp: Response;
    try {
        resp = await fetch(url, { method: 'DELETE', headers: daemonAuthHeaders() });
    } catch (e) {
        throw new SyncDaemonError(`Could not reach sync daemon at ${url}.`, e);
    }
    if (!resp.ok) {
        throw new SyncDaemonError(`Sync daemon responded ${resp.status} ${resp.statusText}`);
    }
}

/** GET /health — true if the daemon is up. */
export async function probeSyncDaemon(config: EchelonConfig): Promise<boolean> {
    const url = buildSyncDaemonUrl(config, 'health');
    try {
        const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
        return resp.ok;
    } catch {
        return false;
    }
}


/** GET /quota — current entitlement/quota state for a wallet. */
export async function fetchQuota(config: EchelonConfig, wallet: string): Promise<SubscriptionQuotaSummary | null> {
    const url = buildSyncDaemonUrl(config, `quota?wallet=${encodeURIComponent(wallet)}`);
    try {
        const resp = await fetch(url, { method: 'GET', headers: daemonAuthHeaders(), cache: 'no-store' });
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

/** POST /quota/check — ask daemon whether an action is permitted. */
export async function checkQuota(config: EchelonConfig, wallet: string, action: string, amount: number = 1): Promise<SubscriptionQuotaSummary | null> {
    const url = buildSyncDaemonUrl(config, `quota/check`);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ wallet, action, amount }),
        });
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}




export function buildBandwidthSidecarUrl(pathname: string): string {
    const host = '127.0.0.1';
    const port = Number((globalThis as any).__ECHELON_BW_PORT__ ?? 7072);
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `http://${host}:${port}${path}`;
}
