/**
 * Settings.tsx tests.
 *
 * Settings is the most stateful page: Gemini key UX (no-key form,
 * mask + reveal + clear), Termux/i2pd endpoint config (saved to
 * localStorage), live "Test connections" probe of three endpoints,
 * Termux quickstart command block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../../components/pages/Settings';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '../../hooks/useEchelonConfig';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    fetchSpy.mockRestore();
});

describe('<Settings /> Gemini key', () => {
    it('shows the password input when no key is stored', () => {
        render(<Settings />);
        expect(screen.getByPlaceholderText(/AIza/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Save Key/i })).toBeInTheDocument();
    });

    it('Save Key persists the typed key to localStorage and swaps to masked view', async () => {
        const user = userEvent.setup();
        render(<Settings />);

        const input = screen.getByPlaceholderText(/AIza/i);
        await user.type(input, 'AIza-secret-12345');
        await user.click(screen.getByRole('button', { name: /Save Key/i }));

        expect(window.localStorage.getItem(STORAGE_KEYS.geminiApiKey)).toBe('AIza-secret-12345');
        // The masked display ends with the last 4 chars of the key.
        await waitFor(() => {
            expect(screen.getByText(/2345$/)).toBeInTheDocument();
        });
        // Reveal + Clear buttons replace the Save Key button.
        expect(screen.getByRole('button', { name: /Reveal/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
    });

    it('Reveal toggles the full key into view; Hide hides it again', async () => {
        window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, 'AIza-revealed');
        const user = userEvent.setup();
        render(<Settings />);

        await user.click(screen.getByRole('button', { name: /Reveal/i }));
        expect(screen.getByText('AIza-revealed')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Hide/i }));
        expect(screen.queryByText('AIza-revealed')).not.toBeInTheDocument();
    });

    it('Clear removes the key from localStorage and re-shows the input form', async () => {
        window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, 'AIza-bye');
        const user = userEvent.setup();
        render(<Settings />);

        await user.click(screen.getByRole('button', { name: /Clear/i }));
        expect(window.localStorage.getItem(STORAGE_KEYS.geminiApiKey)).toBeNull();
        expect(screen.getByPlaceholderText(/AIza/i)).toBeInTheDocument();
    });

    it('Save Key is disabled when the input is empty', () => {
        render(<Settings />);
        expect(screen.getByRole('button', { name: /Save Key/i })).toBeDisabled();
    });
});

describe('<Settings /> Termux endpoint config', () => {
    it('prefills the form from DEFAULT_CONFIG when nothing is stored', () => {
        render(<Settings />);
        const inputs = screen.getAllByDisplayValue('127.0.0.1');
        // 3 host inputs (proxy / console / sync daemon).
        expect(inputs.length).toBeGreaterThanOrEqual(3);
        expect(screen.getByDisplayValue(String(DEFAULT_CONFIG.i2pdProxyPort))).toBeInTheDocument();
        expect(screen.getByDisplayValue(String(DEFAULT_CONFIG.i2pdConsolePort))).toBeInTheDocument();
        expect(screen.getByDisplayValue(String(DEFAULT_CONFIG.syncDaemonPort))).toBeInTheDocument();
    });

    it('Save Endpoints writes the new values to localStorage', async () => {
        const user = userEvent.setup();
        render(<Settings />);

        // Change the proxy port from 4444 to 5555.
        const proxyPortInput = screen.getByDisplayValue('4444');
        await user.clear(proxyPortInput);
        await user.type(proxyPortInput, '5555');

        await user.click(screen.getByRole('button', { name: /Save Endpoints/i }));

        await waitFor(() => {
            const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.config) || '{}');
            expect(stored.i2pdProxyPort).toBe(5555);
        });
    });

    it('"Reset to defaults" wipes saved config and restores DEFAULT_CONFIG values', async () => {
        window.localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({
            ...DEFAULT_CONFIG,
            i2pdProxyPort: 9999,
        }));
        const user = userEvent.setup();
        render(<Settings />);

        // Sanity: the stored value rendered.
        expect(screen.getByDisplayValue('9999')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Reset to defaults/i }));

        await waitFor(() => {
            expect(window.localStorage.getItem(STORAGE_KEYS.config)).toBeNull();
            expect(screen.getByDisplayValue(String(DEFAULT_CONFIG.i2pdProxyPort))).toBeInTheDocument();
        });
    });

    it('"Test connections" probes all three endpoints', async () => {
        fetchSpy.mockResolvedValue(new Response('', { status: 200 }));
        const user = userEvent.setup();
        render(<Settings />);

        await user.click(screen.getByRole('button', { name: /Test connections/i }));

        await waitFor(() => {
            const urls = fetchSpy.mock.calls.map(c => String(c[0]));
            // Proxy, console, sync daemon — all three on the configured ports.
            expect(urls.some(u => u.includes(':4444'))).toBe(true);
            expect(urls.some(u => u.includes(':7070'))).toBe(true);
            expect(urls.some(u => u.includes(':7071/health'))).toBe(true);
        });
    });
});

describe('<Settings /> Termux quickstart', () => {
    it('renders the copy-pasteable Termux command block', () => {
        render(<Settings />);
        // Heading is unique; "Termux Quickstart" string appears elsewhere too.
        expect(screen.getByRole('heading', { name: /Termux Quickstart/i })).toBeInTheDocument();
        expect(screen.getByText(/pkg install -y i2pd python/i)).toBeInTheDocument();
        expect(screen.getByText(/i2pd --daemon/i)).toBeInTheDocument();
    });
});
