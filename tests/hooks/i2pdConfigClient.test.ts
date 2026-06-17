/**
 * i2pdConfigClient tests using a stubbed global.fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';
import {
    I2pdConfigError,
    getI2pdConfig,
    setI2pdConfig,
} from '../../hooks/i2pdConfigClient';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    fetchSpy.mockRestore();
});

describe('getI2pdConfig', () => {
    it('GETs /i2pd/config and parses the response', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            configPath: '/home/user/.i2pd/i2pd.conf',
            values: { bandwidth: 'X', share: '50' },
            knownKeys: ['bandwidth', 'share'],
        }), { status: 200 }));

        const result = await getI2pdConfig(DEFAULT_CONFIG);
        expect(result.configPath).toBe('/home/user/.i2pd/i2pd.conf');
        expect(result.values.bandwidth).toBe('X');

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/i2pd/config');
        expect(init?.method).toBe('GET');
    });

    it('throws I2pdConfigError on a network failure', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        await expect(getI2pdConfig(DEFAULT_CONFIG))
            .rejects.toBeInstanceOf(I2pdConfigError);
    });

    it('throws I2pdConfigError on a non-2xx response', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 500 }));
        await expect(getI2pdConfig(DEFAULT_CONFIG))
            .rejects.toBeInstanceOf(I2pdConfigError);
    });
});

describe('setI2pdConfig', () => {
    it('POSTs the values payload and returns the result', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            configPath: '/cfg',
            values: { bandwidth: 'L', share: '25' },
            writtenCount: 2,
        }), { status: 200 }));

        const result = await setI2pdConfig(DEFAULT_CONFIG, {
            bandwidth: 'L',
            share: '25',
        });
        expect(result.writtenCount).toBe(2);
        expect(result.values.bandwidth).toBe('L');

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:7071/i2pd/config');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init!.body as string);
        expect(body.values.bandwidth).toBe('L');
        expect(body.values.share).toBe('25');
    });

    it('surfaces the daemon-side error message on 400', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            error: 'invalid value for bandwidth: \'Z\'',
        }), { status: 400 }));

        await expect(setI2pdConfig(DEFAULT_CONFIG, { bandwidth: 'Z' }))
            .rejects.toThrow(/invalid value for bandwidth/);
    });

    it('throws I2pdConfigError on a network failure', async () => {
        fetchSpy.mockRejectedValue(new TypeError('connection refused'));
        await expect(setI2pdConfig(DEFAULT_CONFIG, { bandwidth: 'L' }))
            .rejects.toBeInstanceOf(I2pdConfigError);
    });
});
