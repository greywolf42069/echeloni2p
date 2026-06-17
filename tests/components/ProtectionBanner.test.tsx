/**
 * ProtectionBanner tests — the VPN-style "are you protected" verdict,
 * derived locally from the daemon's doctor + autopilot (no beacon).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProtectionBanner from '../../components/ProtectionBanner';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
afterEach(() => { fetchSpy.mockRestore(); });

function mock(doctor: unknown, plan: unknown) {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        const body = url.includes('autofix-plan') ? plan : doctor;
        return Promise.resolve(new Response(JSON.stringify(body), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        }));
    });
}

const PLAN_OK = { mode: 'B_YGGDRASIL', reason: 'tunnels_healthy', safeAutoFixes: [], requiresUserAction: [] };

describe('ProtectionBanner', () => {
    it('shows PROTECTED when a live eepsite probe passes', async () => {
        mock({
            overall: 'ok',
            checks: [{ key: 'eepsite', status: 'pass', label: 'Live eepsite reachable', detail: '' }],
            recommendation: null,
        }, PLAN_OK);
        render(<ProtectionBanner />);
        await waitFor(() => expect(screen.getByText("You're protected")).toBeTruthy());
    });

    it('shows EXPOSED when routing is down', async () => {
        mock({
            overall: 'down',
            checks: [{ key: 'i2pd', status: 'fail', label: 'i2pd not reachable', detail: '' }],
            recommendation: { code: 'start_i2pd', title: 'Start i2pd', body: '', command: 'i2pd --daemon' },
        }, { mode: 'E_DEGRADED', reason: 'core_services_down', safeAutoFixes: [], requiresUserAction: ['start_i2pd'] });
        render(<ProtectionBanner />);
        await waitFor(() => expect(screen.getByText("You're not protected")).toBeTruthy());
    });

    it('shows DEGRADED with NAT messaging when Yggdrasil is needed', async () => {
        mock({
            overall: 'degraded',
            checks: [{ key: 'tunnels', status: 'fail', label: 'stalled', detail: '' }],
            recommendation: { code: 'enable_yggdrasil', title: 'Enable Yggdrasil', body: '', command: 'x' },
        }, { mode: 'E_DEGRADED', reason: 'symmetric_nat_stalled_client_tunnels', safeAutoFixes: ['client_i2pd_config'], requiresUserAction: ['install_yggdrasil'] });
        render(<ProtectionBanner />);
        await waitFor(() => expect(screen.getByText('Protection is degraded')).toBeTruthy());
        expect(screen.getByText(/route around it/i)).toBeTruthy();
    });
});
