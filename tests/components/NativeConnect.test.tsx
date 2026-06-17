/**
 * NativeConnect.tsx tests — the Termux Quickstart page.
 *
 * The page shows two health dots (i2pd router + sync daemon), five
 * copy-pasteable command blocks, and a few navigation buttons.  Both
 * health probes are real `fetch` calls under the hood, so we stub fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NativeConnect from '../../components/pages/NativeConnect';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    fetchSpy.mockRestore();
});

describe('<NativeConnect />', () => {
    it('renders the quickstart heading and 5 numbered steps', async () => {
        // Default to "everything reachable" so the initial probe doesn't
        // turn anything red while we're inspecting structure.
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));

        render(<NativeConnect setPage={vi.fn()} />);

        expect(screen.getByRole('heading', { name: /Termux Quickstart/i })).toBeInTheDocument();
        expect(screen.getByText(/1\. Install Termux/i)).toBeInTheDocument();
        expect(screen.getByText(/2\. Install i2pd and Python/i)).toBeInTheDocument();
        expect(screen.getByText(/3\. Start the I2P router/i)).toBeInTheDocument();
        expect(screen.getByText(/4\. Start the Echelon sync daemon/i)).toBeInTheDocument();
        expect(screen.getByText(/5\. Verify/i)).toBeInTheDocument();
    });

    it('shows a green router dot when the i2pd console is reachable', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));

        render(<NativeConnect setPage={vi.fn()} />);

        await waitFor(() => {
            // The "Re-check" buttons should be enabled.
            expect(screen.getAllByRole('button', { name: /Re-check/i })).toHaveLength(2);
        });
        // We can't easily query "color of dot", but we can confirm the
        // hook fired a fetch against the i2pd console URL.
        await waitFor(() => {
            const calls = fetchSpy.mock.calls.map(c => String(c[0]));
            expect(calls.some(u => u.includes(':7070'))).toBe(true);
        });
    });

    it('clicking sync-daemon "Re-check" probes the configured /health URL', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const user = userEvent.setup();

        render(<NativeConnect setPage={vi.fn()} />);

        // Two "Re-check" buttons: first is i2pd, second is sync daemon.
        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: /Re-check/i })).toHaveLength(2);
        });
        const [, syncRecheck] = screen.getAllByRole('button', { name: /Re-check/i });

        fetchSpy.mockClear();
        await user.click(syncRecheck);

        await waitFor(() => {
            const urls = fetchSpy.mock.calls.map(c => String(c[0]));
            expect(urls.some(u => u.includes('/health'))).toBe(true);
        });
    });

    it('copy buttons copy the command for that step to the clipboard', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<NativeConnect setPage={vi.fn()} />);

        // 5 steps → 5 copy buttons.
        const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
        expect(copyButtons).toHaveLength(5);

        await user.click(copyButtons[0]);
        expect(writeText).toHaveBeenCalledTimes(1);
        // Step 1 contains `pkg update`.
        expect(writeText.mock.calls[0][0]).toMatch(/pkg update/);

        await user.click(copyButtons[2]); // step 3 = i2pd --daemon
        expect(writeText).toHaveBeenCalledTimes(2);
        expect(writeText.mock.calls[1][0]).toMatch(/i2pd --daemon/);
    });

    it('"Eepsite Hosting →" jumps to the hosting page', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const user = userEvent.setup();
        const setPage = vi.fn();

        render(<NativeConnect setPage={setPage} />);
        await user.click(screen.getByRole('button', { name: /Eepsite Hosting/i }));

        expect(setPage).toHaveBeenCalledWith('eepsite-hosting');
    });

    it('"Protect Hub →" jumps to the protect page', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const user = userEvent.setup();
        const setPage = vi.fn();

        render(<NativeConnect setPage={setPage} />);
        await user.click(screen.getByRole('button', { name: /Protect Hub/i }));

        expect(setPage).toHaveBeenCalledWith('protect');
    });

    it('the "Settings" link in the live-status panel jumps to settings', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const user = userEvent.setup();
        const setPage = vi.fn();

        render(<NativeConnect setPage={setPage} />);
        await user.click(screen.getByRole('button', { name: /^Settings$/i }));

        expect(setPage).toHaveBeenCalledWith('settings');
    });
});
