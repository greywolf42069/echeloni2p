/**
 * Browser-side wrapper around the daemon's /i2pd/config endpoint.
 *
 * The daemon (scripts/i2pd_config.py) is the only piece that ever
 * touches ~/.i2pd/i2pd.conf. From the UI side we just send/receive
 * a flat dict of whitelisted keys.
 */
import { type EchelonConfig, buildSyncDaemonUrl, daemonAuthHeaders } from './useEchelonConfig.ts';

export type I2pdConfigKey =
    | 'bandwidth'
    | 'share'
    | 'notransit'
    | 'floodfill'
    | 'http.address'
    | 'http.port'
    | 'httpproxy.address'
    | 'httpproxy.port'
    | 'socksproxy.address'
    | 'socksproxy.port';

export type I2pdConfigValues = Partial<Record<I2pdConfigKey, string>>;

export interface I2pdConfigResponse {
    configPath: string;
    values: I2pdConfigValues;
    /** Returned by GET only — the full whitelist of keys the daemon accepts. */
    knownKeys?: I2pdConfigKey[];
    /** Returned by POST only — number of keys actually written. */
    writtenCount?: number;
}

export class I2pdConfigError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'I2pdConfigError';
    }
}

export async function getI2pdConfig(config: EchelonConfig): Promise<I2pdConfigResponse> {
    const url = buildSyncDaemonUrl(config, 'i2pd/config');
    let resp: Response;
    try {
        resp = await fetch(url, { method: 'GET', cache: 'no-store', headers: daemonAuthHeaders() });
    } catch (e) {
        throw new I2pdConfigError(`Could not reach sync daemon at ${url}.`, e);
    }
    if (!resp.ok) {
        throw new I2pdConfigError(`Sync daemon responded ${resp.status} ${resp.statusText}`);
    }
    return (await resp.json()) as I2pdConfigResponse;
}

export async function setI2pdConfig(
    config: EchelonConfig,
    values: I2pdConfigValues,
): Promise<I2pdConfigResponse> {
    const url = buildSyncDaemonUrl(config, 'i2pd/config');
    let resp: Response;
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ values }),
        });
    } catch (e) {
        throw new I2pdConfigError(`Could not reach sync daemon at ${url}.`, e);
    }
    if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json()).error ?? ''; } catch { /* */ }
        throw new I2pdConfigError(
            detail || `Sync daemon responded ${resp.status} ${resp.statusText}`,
        );
    }
    return (await resp.json()) as I2pdConfigResponse;
}
