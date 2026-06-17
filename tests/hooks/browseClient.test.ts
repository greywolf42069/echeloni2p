import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browseEepsite, BrowseError } from '../../hooks/browseClient';
import { DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
    vi.restoreAllMocks();
});

function htmlResponse(html: string, headers: Record<string, string> = {}) {
    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
    });
}

describe('browseClient', () => {
    it('returns sanitized html + parsed report headers on success', async () => {
        fetchSpy.mockResolvedValue(
            htmlResponse('<html><body>safe</body></html>', {
                'X-Echelon-Blocked': '4',
                'X-Echelon-Scripts-Removed': '2',
                'X-Echelon-Rewritten': '7',
                'X-Echelon-Final-Url': 'http://wiki.i2p/page',
            }),
        );
        const result = await browseEepsite(DEFAULT_CONFIG, 'wiki.i2p');
        expect(result.html).toContain('safe');
        expect(result.blocked).toBe(4);
        expect(result.scriptsRemoved).toBe(2);
        expect(result.rewritten).toBe(7);
        expect(result.finalUrl).toBe('http://wiki.i2p/page');
    });

    it('targets the daemon /browse endpoint with the url encoded', async () => {
        fetchSpy.mockResolvedValue(htmlResponse('<html></html>'));
        await browseEepsite(DEFAULT_CONFIG, 'wiki.i2p/a b');
        const calledUrl = (fetchSpy.mock.calls[0][0] as string);
        expect(calledUrl).toContain('/browse?url=');
        expect(calledUrl).toContain(encodeURIComponent('wiki.i2p/a b'));
    });

    it('maps a structured daemon error to a BrowseError with reason', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ error: 'tunnel timed out', reason: 'tunnel-timeout' }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(browseEepsite(DEFAULT_CONFIG, 'slow.i2p')).rejects.toMatchObject({
            reason: 'tunnel-timeout',
        });
    });

    it('maps a bad-host rejection', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ error: 'not an eepsite', reason: 'bad-host' }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        await expect(browseEepsite(DEFAULT_CONFIG, 'evil.com')).rejects.toMatchObject({
            reason: 'bad-host',
        });
    });

    it('treats daemon-unreachable (network throw) as no-i2pd', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(browseEepsite(DEFAULT_CONFIG, 'wiki.i2p')).rejects.toMatchObject({
            reason: 'no-i2pd',
        });
    });

    it('defaults counts to 0 when headers are absent', async () => {
        fetchSpy.mockResolvedValue(htmlResponse('<html></html>'));
        const result = await browseEepsite(DEFAULT_CONFIG, 'wiki.i2p');
        expect(result.blocked).toBe(0);
        expect(result.scriptsRemoved).toBe(0);
        expect(result.rewritten).toBe(0);
    });

    it('falls back to unknown reason for a non-JSON error body', async () => {
        fetchSpy.mockResolvedValue(new Response('<html>500</html>', { status: 500 }));
        await expect(browseEepsite(DEFAULT_CONFIG, 'wiki.i2p')).rejects.toMatchObject({
            reason: 'unknown',
        });
    });

    it('propagates AbortError without wrapping', async () => {
        const abortErr = new DOMException('aborted', 'AbortError');
        fetchSpy.mockRejectedValue(abortErr);
        await expect(browseEepsite(DEFAULT_CONFIG, 'wiki.i2p')).rejects.toBe(abortErr);
    });

    it('passes wf=1 when the WF defense is requested', async () => {
        fetchSpy.mockResolvedValue(htmlResponse('<html></html>'));
        await browseEepsite(DEFAULT_CONFIG, 'wiki.i2p', undefined, { wf: true });
        expect(fetchSpy.mock.calls[0][0] as string).toContain('&wf=1');
    });

    it('sends X-Echelon-Auth when a daemon token is stored', async () => {
        const { setSyncDaemonToken } = await import('../../hooks/useEchelonConfig');
        setSyncDaemonToken('a'.repeat(64));
        fetchSpy.mockResolvedValue(htmlResponse('<html></html>'));
        await browseEepsite(DEFAULT_CONFIG, 'wiki.i2p');
        const init = fetchSpy.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>)['X-Echelon-Auth']).toBe('a'.repeat(64));
        setSyncDaemonToken('');
    });

    it('recovers the exact sanitized HTML from a Tamaraw-framed body', async () => {
        const html = '<html><body>real eepsite content</body></html>';
        // Frame as [4-byte BE len][html][zero padding to a bucket].
        const enc = new TextEncoder().encode(html);
        const padded = new Uint8Array(2048); // simulate padding to bucket
        padded[0] = (enc.length >>> 24) & 0xff;
        padded[1] = (enc.length >>> 16) & 0xff;
        padded[2] = (enc.length >>> 8) & 0xff;
        padded[3] = enc.length & 0xff;
        padded.set(enc, 4);
        fetchSpy.mockResolvedValue(new Response(padded, {
            status: 200,
            headers: { 'Content-Type': 'text/html', 'X-Echelon-WF-Framed': 'tamaraw-v1' },
        }));
        const result = await browseEepsite(DEFAULT_CONFIG, 'wiki.i2p', undefined, { wf: true });
        expect(result.html).toBe(html); // exact recovery, padding stripped
    });
});
