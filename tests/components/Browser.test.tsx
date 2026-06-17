/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Browser from '../../components/pages/Browser';
import * as browserStore from '../../hooks/browserStore';
import type { Eepsite } from '../../types';

const ep = (id: string, name: string, status: Eepsite['status'] = 'Online'): Eepsite => ({
    id,
    name,
    localDirectory: `/${name}`,
    status,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    files: { 'index.html': { content: '<h1>x</h1>' } },
});

// Helpers ---------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.spyOn>;

async function clearBookmarks() {
    const all = await browserStore.loadAllBookmarks();
    for (const b of all) await browserStore.removeBookmark(b.id);
}

beforeEach(async () => {
    await clearBookmarks();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    vi.restoreAllMocks();
});

function stubProxyAndOutproxy(opts: { proxyOk: boolean; outproxyMode?: 'disabled' | 'http' | 'socks' | 'both' }) {
    fetchSpy.mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        // Outproxy GET
        if (url.includes('/i2pd/outproxy')) {
            return new Response(JSON.stringify({
                tunnelsPath: '/tmp/tunnels.conf',
                spec: {
                    mode: opts.outproxyMode ?? 'disabled',
                    upstream_host: '127.0.0.1',
                    http_upstream_port: 8118,
                    socks_upstream_port: 1080,
                    advertise: false,
                },
                lockedBindHost: '127.0.0.1',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        // Daemon /browse (the sanitizing eepsite fetch)
        if (url.includes('/browse?url=')) {
            if (!opts.proxyOk) {
                // Daemon reports i2pd is down via structured JSON error.
                return new Response(
                    JSON.stringify({ error: 'i2pd HTTP proxy refused', reason: 'no-i2pd' }),
                    { status: 502, headers: { 'Content-Type': 'application/json' } },
                );
            }
            return new Response('<html><body><h1>sanitized eepsite</h1></body></html>', {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Echelon-Blocked': '2',
                    'X-Echelon-Scripts-Removed': '1',
                    'X-Echelon-Rewritten': '3',
                    'X-Echelon-Final-Url': 'http://wiki.i2p/',
                },
            });
        }
        if (opts.proxyOk) {
            return new Response('', { status: 200 });
        }
        return Promise.reject(new TypeError('Failed to fetch'));
    }) as typeof globalThis.fetch);
}

describe('Browser (Phase J — multi-tab + smart routing)', () => {
    describe('initial render', () => {
        it('renders heading + tab bar with one initial blank tab', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            render(<Browser setPage={vi.fn()} />);
            expect(screen.getByRole('heading', { name: /Browser/i })).toBeInTheDocument();
            // tab bar role=tablist
            expect(screen.getByRole('tablist')).toBeInTheDocument();
            // exactly one tab, marked blank
            const tabs = screen.getAllByRole('tab');
            expect(tabs).toHaveLength(1);
            expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
        });

        it('shows the eepsite directory homepage on the initial blank tab', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            render(<Browser setPage={vi.fn()} />);
            // The homepage renders our greeting + bookmark seed
            expect(await screen.findByText(/Where do you want to go/i)).toBeInTheDocument();
            // wait for default bookmarks to seed + render
            await screen.findByText(/I2P Project Homepage/i);
        });

        it('shows the "N trackers blocked" badge after a successful sanitized load', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'wiki.i2p');
            await user.keyboard('{Enter}');
            // The stub /browse returns X-Echelon-Blocked: 2
            await waitFor(() => {
                expect(screen.getByText(/2 clearnet trackers blocked/i)).toBeInTheDocument();
            });
        });
    });

    describe('navigation', () => {
        it('typing an .i2p address and submitting opens an eepsite tab', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'wiki.i2p');
            await user.keyboard('{Enter}');
            // Eepsite pill should be visible somewhere
            await waitFor(() => {
                expect(screen.getAllByText(/Eepsite/i).length).toBeGreaterThan(0);
            });
        });

        it('typing a clearnet URL with outproxy disabled shows error page', async () => {
            stubProxyAndOutproxy({ proxyOk: true, outproxyMode: 'disabled' });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'https://example.com');
            await user.keyboard('{Enter}');
            // Should show the no-outproxy SmartErrorPage
            await waitFor(() => {
                expect(screen.getByText(/Clearnet bridge disabled/i)).toBeInTheDocument();
            });
        });

        it('with outproxy enabled, clearnet navigation does NOT show no-outproxy error', async () => {
            stubProxyAndOutproxy({ proxyOk: true, outproxyMode: 'http' });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            // Wait for outproxy state to settle
            await waitFor(async () => {
                expect(fetchSpy).toHaveBeenCalled();
            });
            await user.clear(input);
            await user.type(input, 'https://example.com');
            await user.keyboard('{Enter}');
            // No clearnet-blocked error
            await waitFor(() => {
                expect(screen.queryByText(/Clearnet bridge disabled/i)).toBeNull();
            });
        });

        it('typing free-text classifies as Search', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'how to use i2p');
            // Pill updates as the user types (before submit)
            await waitFor(() => {
                expect(screen.getAllByText(/Search/i).length).toBeGreaterThan(0);
            });
        });
    });

    describe('error state with proxy unreachable', () => {
        it('navigating with proxy down marks tab as no-i2pd', async () => {
            stubProxyAndOutproxy({ proxyOk: false });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'wiki.i2p');
            await user.keyboard('{Enter}');
            await waitFor(() => {
                expect(screen.getByText(/i2pd is not running/i)).toBeInTheDocument();
            });
        });

        it('error page primary action on no-i2pd routes to Protect page', async () => {
            stubProxyAndOutproxy({ proxyOk: false });
            const setPage = vi.fn();
            const user = userEvent.setup();
            render(<Browser setPage={setPage} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'wiki.i2p');
            await user.keyboard('{Enter}');
            const setupBtn = await screen.findByRole('button', { name: /Set up I2P/i });
            await user.click(setupBtn);
            expect(setPage).toHaveBeenCalledWith('protect');
        });
    });

    describe('tabs', () => {
        it('clicking new-tab button opens an additional tab', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            await screen.findByRole('tablist');
            // Use exact match to avoid colliding with the tab labeled "New Tab"
            const newTabBtn = screen.getByLabelText('New tab');
            await user.click(newTabBtn);
            const tabs = screen.getAllByRole('tab');
            expect(tabs).toHaveLength(2);
        });
    });

    describe('bookmarks', () => {
        it('star button toggles bookmark state for the active URL', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            const user = userEvent.setup();
            render(<Browser setPage={vi.fn()} />);
            const input = await screen.findByLabelText(/Address bar/i);
            await user.type(input, 'mysite.i2p');
            await user.keyboard('{Enter}');
            // Wait for the navigation
            await waitFor(() => {
                expect(screen.getAllByText(/Eepsite/i).length).toBeGreaterThan(0);
            });
            const star = screen.getByRole('button', { name: /Add bookmark/i });
            await user.click(star);
            // Now the button should be in "Remove bookmark" state
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Remove bookmark/i })).toBeInTheDocument();
            });
        });
    });

    describe('user eepsites', () => {
        it('renders user eepsites in the directory homepage when running', async () => {
            stubProxyAndOutproxy({ proxyOk: true });
            render(
                <Browser
                    setPage={vi.fn()}
                    eepsites={[ep('1', 'mysite.i2p', 'Online'), ep('2', 'offline.i2p', 'Offline')]}
                />,
            );
            await screen.findByText(/Your published eepsites/i);
            // Online eepsite shown
            expect(screen.getByText('mysite.i2p')).toBeInTheDocument();
            // Offline NOT shown
            expect(screen.queryByText('offline.i2p')).toBeNull();
        });
    });
});
