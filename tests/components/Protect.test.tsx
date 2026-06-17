/**
 * Protect.tsx tests.
 *
 * Verifies the meshnet hub status + Termux controls + the live threat
 * feed wired to /filters/events. The Protect page now consumes
 * useFilterEvents() internally, so we don't pass threatLog as a prop.
 *
 * Multiple hooks under Protect (useI2pRouterHealth, useI2pStats,
 * useFilterEvents) all hit fetch — distinguish by URL substring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Protect from '../../components/pages/Protect';
import type { Eepsite } from '../../types';

const ep = (id: string, name: string, status: Eepsite['status'] = 'Online'): Eepsite => ({
    id,
    name,
    localDirectory: `/${name}`,
    status,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    files: { 'index.html': { content: '<h1>x</h1>' } },
});

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    fetchSpy.mockRestore();
});

/**
 * Default fetch behaviour: every URL responds 200 with an empty body
 * (so JSON.parse() fails and the hooks fall back to their empty states).
 */
function _setDefaultFetch(spy: ReturnType<typeof vi.spyOn>) {
    spy.mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/filters/events')) {
            return Promise.resolve(new Response(JSON.stringify({
                events: [], headSeq: 0, bufferSize: 0, bufferCap: 200,
            }), { status: 200 }));
        }
        // i2pd console probe + i2pd/stats both happy with empty body.
        return Promise.resolve(new Response('', { status: 200 }));
    });
}

describe('<Protect />', () => {
    it('renders the hub heading + sub-cards (eepsite, threat feed, controls)', async () => {
        _setDefaultFetch(fetchSpy);

        render(<Protect setPage={vi.fn()} eepsites={[ep('a', 'a.i2p')]} />);

        expect(screen.getByRole('heading', { name: /Protection Hub/i })).toBeInTheDocument();
        expect(screen.getByText(/Eepsite Hosting/i)).toBeInTheDocument();
        expect(screen.getByText(/Live Threat Feed/i)).toBeInTheDocument();
        expect(screen.getByText(/Router Controls \(Termux\)/i)).toBeInTheDocument();
    });

    it('shows "router is running" once the i2pd console probe succeeds', async () => {
        _setDefaultFetch(fetchSpy);

        render(<Protect setPage={vi.fn()} eepsites={[]} />);

        await waitFor(() => {
            expect(screen.getByText(/i2pd router is running/i)).toBeInTheDocument();
        });
    });

    it('shows "router is down" when the probe rejects', async () => {
        fetchSpy.mockImplementation((input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.includes(':7070')) return Promise.reject(new TypeError('connection refused'));
            if (url.includes('/filters/events')) {
                return Promise.resolve(new Response(JSON.stringify({
                    events: [], headSeq: 0, bufferSize: 0, bufferCap: 200,
                }), { status: 200 }));
            }
            return Promise.resolve(new Response('', { status: 200 }));
        });

        render(<Protect setPage={vi.fn()} eepsites={[]} />);

        await waitFor(() => {
            expect(screen.getByText(/i2pd router is down/i)).toBeInTheDocument();
        });
    });

    it('"Refresh" triggers another fetch against the i2pd console', async () => {
        _setDefaultFetch(fetchSpy);
        const user = userEvent.setup();

        render(<Protect setPage={vi.fn()} eepsites={[]} />);
        await waitFor(() => expect(screen.getByText(/i2pd router is running/i)).toBeInTheDocument());

        fetchSpy.mockClear();
        _setDefaultFetch(fetchSpy);
        await user.click(screen.getByRole('button', { name: /Refresh/i }));
        await waitFor(() => {
            const calls = fetchSpy.mock.calls.map(c => String(c[0]));
            expect(calls.some(u => u.includes(':7070'))).toBe(true);
        });
    });

    it('copy buttons send the right Termux command to clipboard', async () => {
        _setDefaultFetch(fetchSpy);
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<Protect setPage={vi.fn()} eepsites={[]} />);

        const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
        expect(copyButtons.length).toBeGreaterThanOrEqual(2);

        await user.click(copyButtons[0]);
        expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/i2pd --daemon/));

        await user.click(copyButtons[1]);
        expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/pkill i2pd/));
    });

    it('renders the threat feed entries when /filters/events returns events', async () => {
        fetchSpy.mockImplementation((input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.includes('/filters/events')) {
                return Promise.resolve(new Response(JSON.stringify({
                    events: [
                        { seq: 1, timestamp: 1700000000, domain: 'doubleclick.net',
                          list_source: 'StevenBlack', request_kind: 'get' },
                        { seq: 2, timestamp: 1700000005, domain: 'evil.example',
                          list_source: 'Phishing Army', request_kind: 'get' },
                    ],
                    headSeq: 2, bufferSize: 2, bufferCap: 200,
                }), { status: 200 }));
            }
            return Promise.resolve(new Response('', { status: 200 }));
        });

        render(<Protect setPage={vi.fn()} eepsites={[]} />);

        await waitFor(() => {
            expect(screen.getByText('doubleclick.net')).toBeInTheDocument();
            expect(screen.getByText('evil.example')).toBeInTheDocument();
        });
        // Each entry shows its source list.
        expect(screen.getByText(/StevenBlack/)).toBeInTheDocument();
        expect(screen.getByText(/Phishing Army/)).toBeInTheDocument();
    });

    it('shows the daemon error banner when /filters/events fails', async () => {
        fetchSpy.mockImplementation((input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.includes('/filters/events')) {
                return Promise.reject(new TypeError('connection refused'));
            }
            return Promise.resolve(new Response('', { status: 200 }));
        });

        render(<Protect setPage={vi.fn()} eepsites={[]} />);
        await waitFor(() => {
            expect(screen.getByText(/Could not reach sync daemon/)).toBeInTheDocument();
        });
    });

    it('"Full Termux quickstart →" jumps to the native page', async () => {
        _setDefaultFetch(fetchSpy);
        const user = userEvent.setup();
        const setPage = vi.fn();

        render(<Protect setPage={setPage} eepsites={[]} />);
        await user.click(screen.getByRole('button', { name: /Full Termux quickstart/i }));

        expect(setPage).toHaveBeenCalledWith('native');
    });

    it('"View Emissions" jumps to the emissions page', async () => {
        _setDefaultFetch(fetchSpy);
        const user = userEvent.setup();
        const setPage = vi.fn();

        render(<Protect setPage={setPage} eepsites={[]} />);
        await user.click(screen.getByRole('button', { name: /View Emissions/i }));

        expect(setPage).toHaveBeenCalledWith('emissions');
    });

    it('renders the MeshnetStatus card when /i2pd/stats reports running', async () => {
        fetchSpy.mockImplementation((input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.includes('/i2pd/stats')) {
                return Promise.resolve(new Response(JSON.stringify({
                    running: true,
                    version: '2.55.0',
                    networkStatus: 'OK',
                    routers: 3214,
                    floodfills: 174,
                    tunnelsClient: 12,
                    tunnelsTransit: 47,
                }), { status: 200 }));
            }
            if (url.includes('/filters/events')) {
                return Promise.resolve(new Response(JSON.stringify({
                    events: [], headSeq: 0, bufferSize: 0, bufferCap: 200,
                }), { status: 200 }));
            }
            return Promise.resolve(new Response('', { status: 200 }));
        });

        render(<Protect setPage={vi.fn()} eepsites={[]} />);

        await waitFor(() => {
            expect(screen.getByText(/Meshnet Status/i)).toBeInTheDocument();
            expect(screen.getByText(/3,214/)).toBeInTheDocument();
        });
    });

    it('does NOT render MeshnetStatus when stats are unavailable', async () => {
        _setDefaultFetch(fetchSpy);
        render(<Protect setPage={vi.fn()} eepsites={[]} />);

        await waitFor(() => {
            expect(screen.getByText(/i2pd router is running/i)).toBeInTheDocument();
        });
        expect(screen.queryByText(/Meshnet Status/i)).not.toBeInTheDocument();
    });
});
