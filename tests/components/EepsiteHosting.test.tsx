/**
 * EepsiteHosting.tsx tests.
 *
 * The page is the user-facing entry to publishing eepsites. We verify
 * the publish/unpublish/delete flows wire to the daemon client (which
 * we mock) and that the parent's onToggleStatus / onDelete / onAddNew
 * callbacks are invoked at the right moments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the daemon client so no real fetches happen.
vi.mock('../../hooks/syncDaemonClient', async () => {
    const actual = await vi.importActual<typeof import('../../hooks/syncDaemonClient')>(
        '../../hooks/syncDaemonClient',
    );
    return {
        ...actual,
        publishEepsiteToDaemon: vi.fn(),
        unpublishEepsiteFromDaemon: vi.fn(),
    };
});

import EepsiteHosting from '../../components/pages/EepsiteHosting';
import {
    publishEepsiteToDaemon,
    unpublishEepsiteFromDaemon,
    SyncDaemonError,
} from '../../hooks/syncDaemonClient';
import type { Eepsite } from '../../types';

const ep = (id: string, name: string, status: Eepsite['status'] = 'Offline'): Eepsite => ({
    id,
    name,
    localDirectory: `/sites/${name}`,
    status,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    files: { 'index.html': { content: '<h1>x</h1>' } },
});

beforeEach(() => {
    vi.mocked(publishEepsiteToDaemon).mockReset();
    vi.mocked(unpublishEepsiteFromDaemon).mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('<EepsiteHosting />', () => {
    it('shows the empty state when there are no eepsites', () => {
        render(
            <EepsiteHosting
                eepsites={[]}
                onToggleStatus={vi.fn()}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
            />,
        );
        expect(screen.getByText(/No Eepsites Hosted/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Host New Eepsite/i })).toBeInTheDocument();
    });

    it('renders one card per eepsite', () => {
        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Online'), ep('b', 'b.i2p', 'Offline')]}
                onToggleStatus={vi.fn()}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
            />,
        );
        expect(screen.getByText('a.i2p')).toBeInTheDocument();
        expect(screen.getByText('b.i2p')).toBeInTheDocument();
        // Exact-string status indicators (avoid /Published/i matching "Unpublished").
        expect(screen.getByText('Published')).toBeInTheDocument();
        expect(screen.getByText('Unpublished')).toBeInTheDocument();
    });

    it('"Host New Eepsite" calls onAddNew', async () => {
        const user = userEvent.setup();
        const onAddNew = vi.fn();
        render(
            <EepsiteHosting
                eepsites={[]}
                onToggleStatus={vi.fn()}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={onAddNew}
                onOpenEditor={vi.fn()}
            />,
        );
        await user.click(screen.getByRole('button', { name: /Host New Eepsite/i }));
        expect(onAddNew).toHaveBeenCalledTimes(1);
    });

    it('Publish button calls publishEepsiteToDaemon then onToggleStatus("Online") + success toast', async () => {
        vi.mocked(publishEepsiteToDaemon).mockResolvedValue({
            eepsite: 'a.i2p', writtenCount: 2, files: ['index.html', 'css/style.css'], diskPath: '/tmp/a.i2p',
        });
        const onToggleStatus = vi.fn();
        const showToast = vi.fn();
        const user = userEvent.setup();

        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Offline')]}
                onToggleStatus={onToggleStatus}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
                showToast={showToast}
            />,
        );

        const publishBtn = screen.getByTitle(/Publish to local Termux sync daemon/i);
        await user.click(publishBtn);

        await waitFor(() => {
            expect(publishEepsiteToDaemon).toHaveBeenCalledTimes(1);
            expect(onToggleStatus).toHaveBeenCalledWith('a', 'Online');
            expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Published 2 file/), 'success');
        });
    });

    it('Publish failure flips status to "Error" + surfaces the daemon error message', async () => {
        vi.mocked(publishEepsiteToDaemon).mockRejectedValue(
            new SyncDaemonError('Could not reach sync daemon at http://127.0.0.1:7071/publish.'),
        );
        const onToggleStatus = vi.fn();
        const showToast = vi.fn();
        const user = userEvent.setup();

        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Offline')]}
                onToggleStatus={onToggleStatus}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
                showToast={showToast}
            />,
        );

        await user.click(screen.getByTitle(/Publish to local Termux sync daemon/i));

        await waitFor(() => {
            expect(onToggleStatus).toHaveBeenCalledWith('a', 'Error');
            expect(showToast).toHaveBeenCalledWith(
                expect.stringMatching(/Could not reach sync daemon/),
                'error',
            );
        });
    });

    it('toggling Offline → Online publishes and marks the site Online', async () => {
        vi.mocked(publishEepsiteToDaemon).mockResolvedValue({
            eepsite: 'a.i2p', writtenCount: 1, files: ['index.html'], diskPath: '/tmp/a.i2p',
        });
        const onToggleStatus = vi.fn();
        const user = userEvent.setup();

        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Offline')]}
                onToggleStatus={onToggleStatus}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
                showToast={vi.fn()}
            />,
        );

        const toggle = screen.getByRole('checkbox');
        await user.click(toggle);

        await waitFor(() => {
            expect(publishEepsiteToDaemon).toHaveBeenCalledTimes(1);
            expect(onToggleStatus).toHaveBeenCalledWith('a', 'Online');
        });
    });

    it('toggling Online → Offline unpublishes and marks the site Offline', async () => {
        vi.mocked(unpublishEepsiteFromDaemon).mockResolvedValue();
        const onToggleStatus = vi.fn();
        const user = userEvent.setup();

        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Online')]}
                onToggleStatus={onToggleStatus}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
                showToast={vi.fn()}
            />,
        );

        const toggle = screen.getByRole('checkbox');
        await user.click(toggle);

        await waitFor(() => {
            expect(unpublishEepsiteFromDaemon).toHaveBeenCalledWith(expect.anything(), 'a.i2p');
            expect(onToggleStatus).toHaveBeenCalledWith('a', 'Offline');
        });
    });

    it('Delete calls onDelete (and best-effort tells the daemon to clean up)', async () => {
        vi.mocked(unpublishEepsiteFromDaemon).mockResolvedValue();
        const onDelete = vi.fn();
        const user = userEvent.setup();

        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Online')]}
                onToggleStatus={vi.fn()}
                onDelete={onDelete}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
                showToast={vi.fn()}
            />,
        );

        await user.click(screen.getByTitle(/^Delete$/i));

        await waitFor(() => {
            expect(unpublishEepsiteFromDaemon).toHaveBeenCalled();
            expect(onDelete).toHaveBeenCalledWith('a');
        });
    });

    it('Delete still calls onDelete even when the daemon unpublish fails', async () => {
        vi.mocked(unpublishEepsiteFromDaemon).mockRejectedValue(new SyncDaemonError('daemon down'));
        const onDelete = vi.fn();
        const user = userEvent.setup();

        render(
            <EepsiteHosting
                eepsites={[ep('a', 'a.i2p', 'Online')]}
                onToggleStatus={vi.fn()}
                onDelete={onDelete}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={vi.fn()}
                showToast={vi.fn()}
            />,
        );

        await user.click(screen.getByTitle(/^Delete$/i));

        // Best-effort: local state still proceeds even though daemon rejected.
        await waitFor(() => expect(onDelete).toHaveBeenCalledWith('a'));
    });

    it('Open editor button calls onOpenEditor with the eepsite', async () => {
        const onOpenEditor = vi.fn();
        const user = userEvent.setup();
        const site = ep('a', 'a.i2p', 'Online');

        render(
            <EepsiteHosting
                eepsites={[site]}
                onToggleStatus={vi.fn()}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onAddNew={vi.fn()}
                onOpenEditor={onOpenEditor}
                showToast={vi.fn()}
            />,
        );

        await user.click(screen.getByTitle(/Open Editor/i));

        expect(onOpenEditor).toHaveBeenCalledWith(site);
    });
});
