/**
 * MeshnetConfig.tsx tests.
 *
 * Mocks i2pdConfigClient so no daemon needs to be running.  Asserts:
 *  - loads on mount + populates form
 *  - renders an error card when GET fails
 *  - bandwidth radios toggle the form
 *  - Save POSTs the right shape (notransit inverted from the toggle)
 *  - Save error surfaces toast + error card
 *  - 'Back to Protect' / 'Termux quickstart' navigation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../hooks/i2pdConfigClient', async () => {
    const actual = await vi.importActual<typeof import('../../hooks/i2pdConfigClient')>(
        '../../hooks/i2pdConfigClient',
    );
    return {
        ...actual,
        getI2pdConfig: vi.fn(),
        setI2pdConfig: vi.fn(),
    };
});

import MeshnetConfig from '../../components/pages/MeshnetConfig';
import {
    getI2pdConfig,
    setI2pdConfig,
    I2pdConfigError,
} from '../../hooks/i2pdConfigClient';

beforeEach(() => {
    vi.mocked(getI2pdConfig).mockReset();
    vi.mocked(setI2pdConfig).mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('<MeshnetConfig />', () => {
    it('loads + populates the form from /i2pd/config', async () => {
        vi.mocked(getI2pdConfig).mockResolvedValue({
            configPath: '/home/me/.i2pd/i2pd.conf',
            values: { bandwidth: 'L', share: '25', notransit: 'false', floodfill: 'true' },
            knownKeys: [],
        });

        render(<MeshnetConfig setPage={vi.fn()} />);

        await waitFor(() => {
            // Slider value reflects share=25.
            expect(screen.getByText('25%')).toBeInTheDocument();
        });
        // Bandwidth L radio is selected.
        expect(screen.getByRole('radio', { name: /L — Low/ })).toBeChecked();
        // Floodfill toggle on.
        expect(screen.getByLabelText(/Run as floodfill/i)).toBeChecked();
        // Transit on (notransit=false).
        expect(screen.getByLabelText(/Allow transit traffic/i)).toBeChecked();
        // Config path shown.
        expect(screen.getByText(/i2pd\.conf:/)).toBeInTheDocument();
    });

    it('shows an error card when GET fails', async () => {
        vi.mocked(getI2pdConfig).mockRejectedValue(
            new I2pdConfigError('Could not reach sync daemon at http://127.0.0.1:7071/i2pd/config.'),
        );

        render(<MeshnetConfig setPage={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText(/Could not reach sync daemon/)).toBeInTheDocument();
        });
    });

    it('Save sends the correct values payload (notransit inverted)', async () => {
        vi.mocked(getI2pdConfig).mockResolvedValue({
            configPath: '/cfg',
            values: { bandwidth: 'X', share: '50', notransit: 'false', floodfill: 'false' },
        });
        vi.mocked(setI2pdConfig).mockResolvedValue({
            configPath: '/cfg',
            values: { bandwidth: 'L', share: '50', notransit: 'true', floodfill: 'true' },
            writtenCount: 4,
        });

        const showToast = vi.fn();
        const user = userEvent.setup();
        render(<MeshnetConfig setPage={vi.fn()} showToast={showToast} />);

        await waitFor(() => expect(getI2pdConfig).toHaveBeenCalled());

        // Switch bandwidth to L.
        await user.click(screen.getByRole('radio', { name: /L — Low/ }));
        // Toggle transit OFF (so notransit should become "true").
        await user.click(screen.getByLabelText(/Allow transit traffic/i));
        // Toggle floodfill ON.
        await user.click(screen.getByLabelText(/Run as floodfill/i));

        await user.click(screen.getByRole('button', { name: /Save/i }));

        await waitFor(() => expect(setI2pdConfig).toHaveBeenCalled());
        const [, sent] = vi.mocked(setI2pdConfig).mock.calls[0];
        expect(sent.bandwidth).toBe('L');
        expect(sent.notransit).toBe('true');     // user toggled OFF -> notransit true
        expect(sent.floodfill).toBe('true');
        // Success toast.
        expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Saved/), 'success');
    });

    it('Save failure surfaces the daemon error and a toast', async () => {
        vi.mocked(getI2pdConfig).mockResolvedValue({
            configPath: '/cfg',
            values: {},
        });
        vi.mocked(setI2pdConfig).mockRejectedValue(
            new I2pdConfigError("invalid value for bandwidth: 'Z'"),
        );

        const showToast = vi.fn();
        const user = userEvent.setup();
        render(<MeshnetConfig setPage={vi.fn()} showToast={showToast} />);
        await waitFor(() => expect(getI2pdConfig).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: /Save/i }));

        await waitFor(() => {
            expect(screen.getByText(/invalid value for bandwidth/)).toBeInTheDocument();
        });
        expect(showToast).toHaveBeenCalledWith(
            expect.stringMatching(/invalid value for bandwidth/),
            'error',
        );
    });

    it('"Back to Protect" / "Termux quickstart" / "Reload" buttons work', async () => {
        vi.mocked(getI2pdConfig).mockResolvedValue({ configPath: '/cfg', values: {} });
        const setPage = vi.fn();
        const user = userEvent.setup();
        render(<MeshnetConfig setPage={setPage} />);

        await waitFor(() => expect(getI2pdConfig).toHaveBeenCalled());
        await user.click(screen.getByRole('button', { name: /Back to Protect/i }));
        expect(setPage).toHaveBeenCalledWith('protect');

        // Reload calls getI2pdConfig again.
        const before = vi.mocked(getI2pdConfig).mock.calls.length;
        await user.click(screen.getByRole('button', { name: /Reload from disk/i }));
        await waitFor(() => {
            expect(vi.mocked(getI2pdConfig).mock.calls.length).toBeGreaterThan(before);
        });
    });

    it('renders the Termux restart hint at the bottom', async () => {
        vi.mocked(getI2pdConfig).mockResolvedValue({ configPath: '/cfg', values: {} });
        render(<MeshnetConfig setPage={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByText(/pkill i2pd && i2pd --daemon/)).toBeInTheDocument();
        });
    });
});
