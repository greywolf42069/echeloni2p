import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAutofixPlan, applySafeConfig, runNetworkDoctor } from '../../hooks/networkDoctorClient';
import { DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
afterEach(() => { vi.restoreAllMocks(); });

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
    });
}

describe('networkDoctorClient autopilot', () => {
    it('getAutofixPlan returns the parsed plan', async () => {
        fetchSpy.mockResolvedValue(json({
            mode: 'B_YGGDRASIL', reason: 'tunnels_healthy',
            safeAutoFixes: [], requiresUserAction: [],
        }));
        const plan = await getAutofixPlan(DEFAULT_CONFIG);
        expect(plan.mode).toBe('B_YGGDRASIL');
        expect(fetchSpy.mock.calls[0][0] as string).toContain('/network/autofix-plan');
    });

    it('getAutofixPlan synthesizes a degraded plan when the daemon is unreachable', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const plan = await getAutofixPlan(DEFAULT_CONFIG);
        expect(plan.mode).toBe('E_DEGRADED');
        expect(plan.requiresUserAction).toContain('start_daemon');
    });

    it('applySafeConfig POSTs the requested fixes', async () => {
        fetchSpy.mockResolvedValue(json({
            applied: ['client_i2pd_config'], refused: [], writtenKeys: ['notransit'], note: 'ok',
        }));
        const res = await applySafeConfig(DEFAULT_CONFIG, ['client_i2pd_config']);
        expect(res.applied).toEqual(['client_i2pd_config']);
        const init = fetchSpy.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({ fixes: ['client_i2pd_config'] });
    });

    it('runNetworkDoctor synthesizes the down case when daemon is unreachable', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const d = await runNetworkDoctor(DEFAULT_CONFIG);
        expect(d.overall).toBe('down');
        expect(d.recommendation?.code).toBe('start_daemon');
    });
});
