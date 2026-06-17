import { useCallback, useEffect, useState } from 'react';

/**
 * Centralized client-side config for Echelon.
 *
 * Echelon is a self-host / public tool. Users provide their own
 * Gemini API key and point Echelon at their own local i2pd / Termux
 * services. Everything here is stored in localStorage on-device only.
 *
 * No secrets are ever sent off-device by this hook itself; the Gemini
 * key only leaves the device when the user (or the app on their
 * behalf) calls Google's Gemini API.
 */

export const STORAGE_KEYS = {
    geminiApiKey: 'echelon_gemini_api_key',
    config: 'echelon_config_v1',
    syncDaemonToken: 'echelon_sync_daemon_token',
} as const;

export interface EchelonConfig {
    /** Hostname or IP of the i2pd HTTP proxy (default 127.0.0.1 on the same device). */
    i2pdProxyHost: string;
    /** i2pd HTTP proxy port. i2pd default is 4444. */
    i2pdProxyPort: number;
    /** i2pd web console host. Used for health checks / status. */
    i2pdConsoleHost: string;
    /** i2pd web console port. i2pd default is 7070. */
    i2pdConsolePort: number;
    /** Local file/sync daemon host (where Echelon publishes eepsite files). */
    syncDaemonHost: string;
    /** Local file/sync daemon port. */
    syncDaemonPort: number;
    /** Whether the user has enabled HTTPS for any of the local endpoints. */
    useHttps: boolean;
}

export const DEFAULT_CONFIG: EchelonConfig = {
    i2pdProxyHost: '127.0.0.1',
    i2pdProxyPort: 4444,
    i2pdConsoleHost: '127.0.0.1',
    i2pdConsolePort: 7070,
    syncDaemonHost: '127.0.0.1',
    syncDaemonPort: 7071,
    useHttps: false,
};

function loadConfig(): EchelonConfig {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.config);
        if (!raw) return DEFAULT_CONFIG;
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch (e) {
        console.warn('[useEchelonConfig] Failed to parse stored config:', e);
        return DEFAULT_CONFIG;
    }
}

/** Hook for the Gemini API key. */
export function useGeminiKey() {
    const [apiKey, setApiKeyState] = useState<string>(() => {
        if (typeof window === 'undefined') return '';
        return window.localStorage.getItem(STORAGE_KEYS.geminiApiKey) || '';
    });

    // Stay in sync if another tab / component changes the key.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEYS.geminiApiKey) {
                setApiKeyState(e.newValue || '');
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const setApiKey = useCallback((key: string) => {
        const trimmed = key.trim();
        if (trimmed) {
            window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, trimmed);
        } else {
            window.localStorage.removeItem(STORAGE_KEYS.geminiApiKey);
        }
        setApiKeyState(trimmed);
    }, []);

    const clearApiKey = useCallback(() => setApiKey(''), [setApiKey]);

    return { apiKey, setApiKey, clearApiKey, hasKey: !!apiKey };
}

/** Hook for Termux / i2pd endpoint config. */
export function useEchelonConfig() {
    const [config, setConfigState] = useState<EchelonConfig>(loadConfig);

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEYS.config) setConfigState(loadConfig());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const updateConfig = useCallback((patch: Partial<EchelonConfig>) => {
        setConfigState(prev => {
            const next = { ...prev, ...patch };
            try {
                window.localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
            } catch (e) {
                console.warn('[useEchelonConfig] Failed to persist config:', e);
            }
            return next;
        });
    }, []);

    const resetConfig = useCallback(() => {
        window.localStorage.removeItem(STORAGE_KEYS.config);
        setConfigState(DEFAULT_CONFIG);
    }, []);

    return { config, updateConfig, resetConfig };
}

/** Build a URL pointing at the i2pd HTTP proxy, used to fetch eepsites. */
export function buildI2pProxyUrl(config: EchelonConfig, eepsiteAddress: string): string {
    const scheme = config.useHttps ? 'https' : 'http';
    const cleaned = eepsiteAddress
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^\/+/, '');
    // i2pd's HTTP proxy resolves any "*.i2p" host you address through it,
    // including the path portion. So the request shape is:
    //   http://<proxyHost>:<proxyPort>/<eepsite>/<path>
    // For browser-side fetches it's simpler to use the proxy as the origin
    // and place the .i2p host as the first path segment, which i2pd
    // accepts when used as a regular HTTP proxy via fetch.
    return `${scheme}://${config.i2pdProxyHost}:${config.i2pdProxyPort}/${cleaned}`;
}

/** Build a URL for the i2pd web console (status, peers, tunnels). */
export function buildI2pConsoleUrl(config: EchelonConfig, path: string = ''): string {
    const scheme = config.useHttps ? 'https' : 'http';
    const cleaned = path.replace(/^\/+/, '');
    return `${scheme}://${config.i2pdConsoleHost}:${config.i2pdConsolePort}/${cleaned}`;
}

/** Build a URL for the local Echelon sync daemon (file publishing). */
export function buildSyncDaemonUrl(config: EchelonConfig, path: string = ''): string {
    const scheme = config.useHttps ? 'https' : 'http';
    const cleaned = path.replace(/^\/+/, '');
    return `${scheme}://${config.syncDaemonHost}:${config.syncDaemonPort}/${cleaned}`;
}

/**
 * The per-device sync-daemon auth token (from `cat ~/.echelon/secret`,
 * pasted once in Settings). When set, it's sent as X-Echelon-Auth on every
 * daemon call so the daemon can run with ECHELON_REQUIRE_AUTH=1 — closing
 * the "any local app can drive the daemon" hole. Stored on-device only.
 */
export function getSyncDaemonToken(): string {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(STORAGE_KEYS.syncDaemonToken) || '';
}

export function setSyncDaemonToken(token: string): void {
    const t = token.trim();
    if (t) window.localStorage.setItem(STORAGE_KEYS.syncDaemonToken, t);
    else window.localStorage.removeItem(STORAGE_KEYS.syncDaemonToken);
}

/** Headers to merge into every sync-daemon fetch. Adds X-Echelon-Auth when a token is set. */
export function daemonAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = getSyncDaemonToken();
    return token ? { ...extra, 'X-Echelon-Auth': token } : { ...extra };
}

/** React hook for the sync-daemon auth token (Settings UI). */
export function useSyncDaemonToken() {
    const [token, setTokenState] = useState<string>(getSyncDaemonToken);
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEYS.syncDaemonToken) setTokenState(e.newValue || '');
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    const setToken = useCallback((t: string) => { setSyncDaemonToken(t); setTokenState(t.trim()); }, []);
    return { token, setToken, hasToken: !!token };
}
