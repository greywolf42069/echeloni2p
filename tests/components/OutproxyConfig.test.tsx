/**
 * OutproxyConfig.tsx tests.
 *
 * Mocks outproxyClient. Verifies safety affordances are rendered, mode
 * changes flow into save payload, error states surface, and the UI
 * cannot un-lock the bind host (read-only field can't be edited).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../hooks/outproxyClient', async () => {
    const actual = await vi.importActual<typeof import('../../hooks/outproxyClient')>(
        '../../hooks/outproxyClient',
    );
    return {
        ...actual,
        getOutproxy: vi.fn(),
        setOutproxy: vi.fn(),
    };
});

import OutproxyConfig from '../../components/pages/OutproxyConfig';
import {
    getOutproxy,
    setOutproxy,
    OutproxyClientError,
} from '../../hooks/outproxyClient';

const baseSpec = {
    mode: 'disabled' as const,
    upstream_host: '127.0.0.1',
    http_upstream_port: 8118,
    socks_upstream_port: 1080,
    advertise: false,
};

beforeEach(() => {
    vi.mocked(getOutproxy).mockReset();
    vi.mocked(setOutproxy).mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('<OutproxyConfig /> initial load', () => {
    it('renders heading + Termux explainer + tunnels.conf path', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/home/u/.i2pd/tunnels.conf',
            spec: baseSpec,
            lockedBindHost: '127.0.0.1',
        });

        render(<OutproxyConfig setPage={vi.fn()} />);

        expect(screen.getByRole('heading', { name: /^Outproxy$/i })).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText(/tunnels\.conf:/i)).toBeInTheDocument();
        });
        // Always-visible safety warning about backend egress.
        expect(screen.getByText(/i2pd does not perform clearnet egress/i)).toBeInTheDocument();
    });

    it('shows the Disabled mode selected by default + hides upstream config', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: baseSpec, lockedBindHost: '127.0.0.1',
        });

        render(<OutproxyConfig setPage={vi.fn()} />);

        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        // The mode radio for "Disabled" should be checked.
        expect(screen.getByRole('radio', { name: /Disabled/i })).toBeChecked();
        // Backend port inputs are hidden while disabled.
        expect(screen.queryByLabelText(/HTTP upstream port/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/SOCKS upstream port/i)).not.toBeInTheDocument();
    });

    it('surfaces a daemon error in a red card on GET failure', async () => {
        vi.mocked(getOutproxy).mockRejectedValue(
            new OutproxyClientError('Could not reach sync daemon at http://127.0.0.1:7071/i2pd/outproxy.'),
        );

        render(<OutproxyConfig setPage={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByText(/Could not reach sync daemon/)).toBeInTheDocument();
        });
    });
});

describe('<OutproxyConfig /> mode interaction', () => {
    it('shows backend ports when switching to HTTP', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: baseSpec, lockedBindHost: '127.0.0.1',
        });
        const user = userEvent.setup();
        render(<OutproxyConfig setPage={vi.fn()} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        await user.click(screen.getByRole('radio', { name: /HTTP only/i }));
        expect(screen.getByLabelText(/HTTP upstream port/i)).toHaveValue(8118);
        // SOCKS still hidden in 'http' mode.
        expect(screen.queryByLabelText(/SOCKS upstream port/i)).not.toBeInTheDocument();
    });

    it('shows both ports when switching to "HTTP + SOCKS"', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: baseSpec, lockedBindHost: '127.0.0.1',
        });
        const user = userEvent.setup();
        render(<OutproxyConfig setPage={vi.fn()} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        await user.click(screen.getByRole('radio', { name: /HTTP \+ SOCKS/i }));
        expect(screen.getByLabelText(/HTTP upstream port/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/SOCKS upstream port/i)).toBeInTheDocument();
    });

    it('the locked-bind-host field is disabled (cannot be edited)', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: { ...baseSpec, mode: 'http' }, lockedBindHost: '127.0.0.1',
        });
        render(<OutproxyConfig setPage={vi.fn()} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        // Multiple inputs render with value 127.0.0.1; only the "Bind host
        // (locked)" one should be `disabled` and uneditable.
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[disabled]'));
        const disabledLocked = inputs.find(el => el.value === '127.0.0.1');
        expect(disabledLocked).toBeDefined();
        expect(disabledLocked?.disabled).toBe(true);
    });
});

describe('<OutproxyConfig /> save flow', () => {
    it('Save sends the right payload and shows a success toast', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: baseSpec, lockedBindHost: '127.0.0.1',
        });
        vi.mocked(setOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg',
            spec: { ...baseSpec, mode: 'both', http_upstream_port: 8120, advertise: true },
            lockedBindHost: '127.0.0.1',
        });

        const showToast = vi.fn();
        const user = userEvent.setup();
        render(<OutproxyConfig setPage={vi.fn()} showToast={showToast} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        await user.click(screen.getByRole('radio', { name: /HTTP \+ SOCKS/i }));
        const httpPort = screen.getByLabelText(/HTTP upstream port/i);
        await user.clear(httpPort);
        await user.type(httpPort, '8120');
        await user.click(screen.getByLabelText(/Advertise destination/i));
        await user.click(screen.getByRole('button', { name: /Save outproxy config/i }));

        await waitFor(() => expect(setOutproxy).toHaveBeenCalled());
        const [, sent] = vi.mocked(setOutproxy).mock.calls[0];
        expect(sent.mode).toBe('both');
        expect(sent.http_upstream_port).toBe(8120);
        expect(sent.advertise).toBe(true);
        // We never let the UI override bind host.
        expect((sent as { upstream_host?: string }).upstream_host).toBe('127.0.0.1');

        expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/updated/), 'success');
    });

    it('Save failure surfaces the daemon error inline + as a toast', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: { ...baseSpec, mode: 'http' }, lockedBindHost: '127.0.0.1',
        });
        vi.mocked(setOutproxy).mockRejectedValue(
            new OutproxyClientError("invalid upstream_host: '0.0.0.0'"),
        );

        const showToast = vi.fn();
        const user = userEvent.setup();
        render(<OutproxyConfig setPage={vi.fn()} showToast={showToast} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: /Save outproxy config/i }));

        await waitFor(() => {
            expect(screen.getByText(/invalid upstream_host/)).toBeInTheDocument();
        });
        expect(showToast).toHaveBeenCalledWith(
            expect.stringMatching(/invalid upstream_host/),
            'error',
        );
    });

    it('Save button label flips to "Disable outproxy" when mode is disabled', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: baseSpec, lockedBindHost: '127.0.0.1',
        });
        render(<OutproxyConfig setPage={vi.fn()} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        expect(screen.getByRole('button', { name: /Disable outproxy/i })).toBeInTheDocument();
    });

    it('"Back to Protect" / Reload buttons work', async () => {
        vi.mocked(getOutproxy).mockResolvedValue({
            tunnelsPath: '/cfg', spec: baseSpec, lockedBindHost: '127.0.0.1',
        });
        const setPage = vi.fn();
        const user = userEvent.setup();
        render(<OutproxyConfig setPage={setPage} />);
        await waitFor(() => expect(getOutproxy).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: /Back to Protect/i }));
        expect(setPage).toHaveBeenCalledWith('protect');

        const before = vi.mocked(getOutproxy).mock.calls.length;
        await user.click(screen.getByRole('button', { name: /Reload/i }));
        await waitFor(() => {
            expect(vi.mocked(getOutproxy).mock.calls.length).toBeGreaterThan(before);
        });
    });
});
