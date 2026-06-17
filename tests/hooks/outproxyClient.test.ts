import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';
import {
    OutproxyClientError,
    getOutproxy,
    setOutproxy,
} from '../../hooks/outproxyClient';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
afterEach(() => { fetchSpy.mockRestore(); });

describe('getOutproxy', () => {
    it('GETs /i2pd/outproxy and parses the response', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            tunnelsPath: '/home/u/.i2pd/tunnels.conf',
            spec: {
                mode: 'http',
                upstream_host: '127.0.0.1',
                http_upstream_port: 8118,
                socks_upstream_port: 1080,
                advertise: false,
            },
            lockedBindHost: '127.0.0.1',
        }), { status: 200 }));

        const result = await getOutproxy(DEFAULT_CONFIG);
        expect(result.spec.mode).toBe('http');
        expect(result.lockedBindHost).toBe('127.0.0.1');

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/i2pd/outproxy');
        expect(init?.method).toBe('GET');
    });

    it('throws OutproxyClientError on a network failure', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        await expect(getOutproxy(DEFAULT_CONFIG))
            .rejects.toBeInstanceOf(OutproxyClientError);
    });

    it('throws OutproxyClientError on a non-2xx response', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 503 }));
        await expect(getOutproxy(DEFAULT_CONFIG))
            .rejects.toBeInstanceOf(OutproxyClientError);
    });
});

describe('setOutproxy', () => {
    it('POSTs the requested spec', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            tunnelsPath: '/cfg', spec: {
                mode: 'both', upstream_host: '127.0.0.1',
                http_upstream_port: 8123, socks_upstream_port: 1085,
                advertise: true,
            }, lockedBindHost: '127.0.0.1',
        }), { status: 200 }));

        const result = await setOutproxy(DEFAULT_CONFIG, {
            mode: 'both',
            upstream_host: '127.0.0.1',
            http_upstream_port: 8123,
            socks_upstream_port: 1085,
            advertise: true,
        });
        expect(result.spec.mode).toBe('both');

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/i2pd/outproxy');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init!.body as string);
        expect(body.mode).toBe('both');
        expect(body.http_upstream_port).toBe(8123);
        expect(body.advertise).toBe(true);
    });

    it('surfaces the daemon error message on 400', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            error: 'invalid upstream_host: \'0.0.0.0\'',
        }), { status: 400 }));

        await expect(setOutproxy(DEFAULT_CONFIG, {
            mode: 'http', upstream_host: '0.0.0.0',
            http_upstream_port: 8118, socks_upstream_port: 1080, advertise: false,
        })).rejects.toThrow(/invalid upstream_host/);
    });

    it('throws OutproxyClientError on network failure', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        await expect(setOutproxy(DEFAULT_CONFIG, {
            mode: 'disabled', upstream_host: '127.0.0.1',
            http_upstream_port: 8118, socks_upstream_port: 1080, advertise: false,
        })).rejects.toBeInstanceOf(OutproxyClientError);
    });
});
