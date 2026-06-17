/**
 * syncDaemonClient tests using a stubbed global.fetch.
 *
 * No real daemon needed — we assert request shape + error mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';
import {
    SyncDaemonError,
    flattenFileTree,
    probeSyncDaemon,
    publishEepsiteToDaemon,
    unpublishEepsiteFromDaemon,
} from '../../hooks/syncDaemonClient';
import type { Eepsite } from '../../types';

const fixtureEepsite: Eepsite = {
    id: 'e1',
    name: 'demo.i2p',
    localDirectory: '/x',
    status: 'Offline',
    createdAt: new Date(),
    files: {
        'index.html': { content: '<h1>hi</h1>' },
        'css/': { 'style.css': { content: 'body{}' } },
        'nested/': { 'deep/': { 'a.txt': { content: 'A' } } },
    },
};

/* ----------------------------------------------------------- flattenFileTree */

describe('flattenFileTree', () => {
    it('flattens a nested file tree to path keys', () => {
        const flat = flattenFileTree(fixtureEepsite.files);
        expect(flat['index.html']).toBe('<h1>hi</h1>');
        expect(flat['css/style.css']).toBe('body{}');
        expect(flat['nested/deep/a.txt']).toBe('A');
    });

    it('returns {} for an empty tree', () => {
        expect(flattenFileTree({})).toEqual({});
    });

    it('strips trailing slashes from directory names', () => {
        const flat = flattenFileTree({
            'js/': { 'app.js': { content: 'x' } },
        });
        expect(Object.keys(flat)).toEqual(['js/app.js']);
    });
});

/* ----------------------------------------------------------------- HTTP path */

describe('publishEepsiteToDaemon', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('POSTs the flattened tree to /publish and returns the parsed result', async () => {
        const responseBody = {
            eepsite: 'demo.i2p',
            writtenCount: 3,
            files: ['index.html', 'css/style.css', 'nested/deep/a.txt'],
            diskPath: '/tmp/demo.i2p',
        };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        const result = await publishEepsiteToDaemon(DEFAULT_CONFIG, fixtureEepsite);
        expect(result).toEqual(responseBody);

        // Inspect the request that was sent.
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/publish');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init!.body as string);
        expect(body.eepsite).toBe('demo.i2p');
        expect(body.files['index.html']).toBe('<h1>hi</h1>');
        expect(body.files['css/style.css']).toBe('body{}');
    });

    it('wraps a network failure in SyncDaemonError', async () => {
        fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
        await expect(publishEepsiteToDaemon(DEFAULT_CONFIG, fixtureEepsite))
            .rejects.toBeInstanceOf(SyncDaemonError);
    });

    it('surfaces a daemon-level error message on 4xx', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'unsafe path' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        }));
        await expect(publishEepsiteToDaemon(DEFAULT_CONFIG, fixtureEepsite))
            .rejects.toThrowError(/unsafe path/);
    });

    it('still throws on 5xx without a JSON body', async () => {
        fetchSpy.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
        await expect(publishEepsiteToDaemon(DEFAULT_CONFIG, fixtureEepsite))
            .rejects.toBeInstanceOf(SyncDaemonError);
    });
});

describe('unpublishEepsiteFromDaemon', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
    afterEach(() => { fetchSpy.mockRestore(); });

    it('issues a DELETE on /eepsite/<name>', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ deleted: 'demo.i2p' }), { status: 200 }));
        await unpublishEepsiteFromDaemon(DEFAULT_CONFIG, 'demo.i2p');
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/eepsite/demo.i2p');
        expect(init?.method).toBe('DELETE');
    });

    it('throws SyncDaemonError on a non-2xx response', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
        await expect(unpublishEepsiteFromDaemon(DEFAULT_CONFIG, 'missing.i2p'))
            .rejects.toBeInstanceOf(SyncDaemonError);
    });
});

describe('probeSyncDaemon', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
    afterEach(() => { fetchSpy.mockRestore(); });

    it('returns true when /health responds 200', async () => {
        fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
        await expect(probeSyncDaemon(DEFAULT_CONFIG)).resolves.toBe(true);
    });

    it('returns false when fetch throws', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        await expect(probeSyncDaemon(DEFAULT_CONFIG)).resolves.toBe(false);
    });

    it('returns false when fetch resolves with a non-OK status', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 503 }));
        await expect(probeSyncDaemon(DEFAULT_CONFIG)).resolves.toBe(false);
    });
});
