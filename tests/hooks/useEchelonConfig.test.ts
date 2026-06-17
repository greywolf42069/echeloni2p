/**
 * useGeminiKey + useEchelonConfig tests.
 *
 * Covers persistence, defaults, partial updates, and cross-tab sync via
 * the `storage` event.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    STORAGE_KEYS,
    buildI2pConsoleUrl,
    buildI2pProxyUrl,
    buildSyncDaemonUrl,
    daemonAuthHeaders,
    getSyncDaemonToken,
    setSyncDaemonToken,
    useEchelonConfig,
    useGeminiKey,
} from '../../hooks/useEchelonConfig';

/* -------------------------------------------------------------- useGeminiKey */

describe('useGeminiKey', () => {
    it('starts empty when localStorage has no entry', () => {
        const { result } = renderHook(() => useGeminiKey());
        expect(result.current.apiKey).toBe('');
        expect(result.current.hasKey).toBe(false);
    });

    it('hydrates from localStorage on mount', () => {
        window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, 'AIza-stored');
        const { result } = renderHook(() => useGeminiKey());
        expect(result.current.apiKey).toBe('AIza-stored');
        expect(result.current.hasKey).toBe(true);
    });

    it('persists set values to localStorage and trims whitespace', () => {
        const { result } = renderHook(() => useGeminiKey());
        act(() => result.current.setApiKey('  AIza-new  '));
        expect(result.current.apiKey).toBe('AIza-new');
        expect(window.localStorage.getItem(STORAGE_KEYS.geminiApiKey)).toBe('AIza-new');
    });

    it('clearApiKey removes the entry from localStorage', () => {
        window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, 'AIza-old');
        const { result } = renderHook(() => useGeminiKey());
        act(() => result.current.clearApiKey());
        expect(result.current.apiKey).toBe('');
        expect(result.current.hasKey).toBe(false);
        expect(window.localStorage.getItem(STORAGE_KEYS.geminiApiKey)).toBeNull();
    });

    it('setApiKey("") removes the entry (treated as a clear)', () => {
        const { result } = renderHook(() => useGeminiKey());
        act(() => result.current.setApiKey('AIza-temp'));
        act(() => result.current.setApiKey(''));
        expect(result.current.apiKey).toBe('');
        expect(window.localStorage.getItem(STORAGE_KEYS.geminiApiKey)).toBeNull();
    });

    it('reflects cross-tab updates via the storage event', async () => {
        const { result } = renderHook(() => useGeminiKey());
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', {
                key: STORAGE_KEYS.geminiApiKey,
                newValue: 'AIza-from-other-tab',
            }));
        });
        await waitFor(() => expect(result.current.apiKey).toBe('AIza-from-other-tab'));
    });

    it('ignores unrelated storage events', () => {
        const { result } = renderHook(() => useGeminiKey());
        act(() => result.current.setApiKey('AIza-mine'));
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'xx' }));
        });
        expect(result.current.apiKey).toBe('AIza-mine');
    });
});

/* ------------------------------------------------------------ useEchelonConfig */

describe('useEchelonConfig', () => {
    it('returns DEFAULT_CONFIG when no stored config exists', () => {
        const { result } = renderHook(() => useEchelonConfig());
        expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('hydrates a stored config and merges with defaults', () => {
        window.localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({
            i2pdProxyHost: '10.0.0.5',
            i2pdProxyPort: 9999,
        }));
        const { result } = renderHook(() => useEchelonConfig());
        expect(result.current.config.i2pdProxyHost).toBe('10.0.0.5');
        expect(result.current.config.i2pdProxyPort).toBe(9999);
        // Unspecified keys fall back to defaults.
        expect(result.current.config.i2pdConsolePort).toBe(DEFAULT_CONFIG.i2pdConsolePort);
    });

    it('falls back to defaults when stored JSON is corrupt', () => {
        window.localStorage.setItem(STORAGE_KEYS.config, '{not json');
        const { result } = renderHook(() => useEchelonConfig());
        expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it('updateConfig persists partial updates', () => {
        const { result } = renderHook(() => useEchelonConfig());
        act(() => result.current.updateConfig({ syncDaemonPort: 8888 }));
        expect(result.current.config.syncDaemonPort).toBe(8888);
        // Other keys retained.
        expect(result.current.config.i2pdProxyPort).toBe(DEFAULT_CONFIG.i2pdProxyPort);
        // Persisted to storage.
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.config)!);
        expect(stored.syncDaemonPort).toBe(8888);
    });

    it('resetConfig wipes storage and returns to defaults', () => {
        const { result } = renderHook(() => useEchelonConfig());
        act(() => result.current.updateConfig({ useHttps: true }));
        expect(result.current.config.useHttps).toBe(true);
        act(() => result.current.resetConfig());
        expect(result.current.config).toEqual(DEFAULT_CONFIG);
        expect(window.localStorage.getItem(STORAGE_KEYS.config)).toBeNull();
    });

    it('updates state on cross-tab storage events', async () => {
        const { result } = renderHook(() => useEchelonConfig());
        const newCfg = { ...DEFAULT_CONFIG, i2pdProxyPort: 12345 };
        window.localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(newCfg));
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', {
                key: STORAGE_KEYS.config,
                newValue: JSON.stringify(newCfg),
            }));
        });
        await waitFor(() => expect(result.current.config.i2pdProxyPort).toBe(12345));
    });
});

/* --------------------------------------------------------------- URL builders */

describe('URL builders', () => {
    it('buildI2pProxyUrl normalizes the eepsite address', () => {
        const cfg = { ...DEFAULT_CONFIG };
        expect(buildI2pProxyUrl(cfg, 'foo.i2p')).toBe('http://127.0.0.1:4444/foo.i2p');
        expect(buildI2pProxyUrl(cfg, 'http://foo.i2p')).toBe('http://127.0.0.1:4444/foo.i2p');
        expect(buildI2pProxyUrl(cfg, 'https://foo.i2p/')).toBe('http://127.0.0.1:4444/foo.i2p/');
        expect(buildI2pProxyUrl(cfg, '  foo.i2p  ')).toBe('http://127.0.0.1:4444/foo.i2p');
    });

    it('buildI2pConsoleUrl respects the console host/port and https flag', () => {
        expect(buildI2pConsoleUrl(DEFAULT_CONFIG, '?page=peers'))
            .toBe('http://127.0.0.1:7070/?page=peers');
        expect(buildI2pConsoleUrl({ ...DEFAULT_CONFIG, useHttps: true }, ''))
            .toBe('https://127.0.0.1:7070/');
    });

    it('buildSyncDaemonUrl handles arbitrary paths', () => {
        expect(buildSyncDaemonUrl(DEFAULT_CONFIG, 'health')).toBe('http://127.0.0.1:7071/health');
        expect(buildSyncDaemonUrl(DEFAULT_CONFIG, '/publish')).toBe('http://127.0.0.1:7071/publish');
    });
});

/* ----------------------------------------------------- daemon auth token */

describe('daemonAuthHeaders / sync daemon token', () => {
    it('omits X-Echelon-Auth when no token is set', () => {
        setSyncDaemonToken('');
        expect(daemonAuthHeaders()).toEqual({});
        expect(daemonAuthHeaders({ 'Content-Type': 'application/json' }))
            .toEqual({ 'Content-Type': 'application/json' });
    });

    it('injects X-Echelon-Auth when a token is set', () => {
        setSyncDaemonToken('deadbeef'.repeat(8));
        expect(daemonAuthHeaders()['X-Echelon-Auth']).toBe('deadbeef'.repeat(8));
        const merged = daemonAuthHeaders({ 'Content-Type': 'application/json' });
        expect(merged['Content-Type']).toBe('application/json');
        expect(merged['X-Echelon-Auth']).toBe('deadbeef'.repeat(8));
        setSyncDaemonToken('');
    });

    it('trims and clears the token', () => {
        setSyncDaemonToken('  tok  ');
        expect(getSyncDaemonToken()).toBe('tok');
        setSyncDaemonToken('');
        expect(getSyncDaemonToken()).toBe('');
    });
});
