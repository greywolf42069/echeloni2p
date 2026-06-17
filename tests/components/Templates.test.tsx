import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import Templates from '../../components/pages/Templates';
import { recordEntitlement, clearEntitlement } from '../../hooks/templateEntitlement';
import { resetFeatureFlags, setFeatureFlag } from '../../featureFlags';

const TEST_WALLET = 'TestWallet1111111111111111111111111111';

describe('Templates page', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
        resetFeatureFlags();
    });
    afterEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
        resetFeatureFlags();
    });

    it('renders the heading + free templates', () => {
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        expect(screen.getByRole('heading', { name: /Templates/i, level: 1 })).toBeInTheDocument();
        expect(screen.getByText('Blank')).toBeInTheDocument();
        expect(screen.getByText('Personal Blog')).toBeInTheDocument();
        expect(screen.getByText('Linktree')).toBeInTheDocument();
    });

    it('renders the premium section with locked CTAs when not entitled', () => {
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        expect(screen.getByRole('heading', { name: /Premium/i })).toBeInTheDocument();
        // Locked buttons say "🔒 Unlock to use"
        const lockedBtns = screen.getAllByRole('button', { name: /Unlock to use/i });
        expect(lockedBtns.length).toBeGreaterThanOrEqual(3);
    });

    it('clicking a premium template when locked opens the purchase modal', () => {
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        const lockedBtns = screen.getAllByRole('button', { name: /Unlock to use/i });
        fireEvent.click(lockedBtns[0]);
        expect(screen.getByRole('dialog', { name: /Premium template purchase/i })).toBeInTheDocument();
        // "$19 USDC" appears in both the banner and the modal — getAllByText
        expect(screen.getAllByText(/\$19 USDC/i).length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Premium unlocked" banner when entitled', () => {
        recordEntitlement({ wallet: TEST_WALLET, signature: 'sig', paidAt: 1 });
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        expect(screen.getByText(/Premium unlocked/i)).toBeInTheDocument();
    });

    it('clicking a premium template when entitled triggers onCreateEepsite + setPage', () => {
        recordEntitlement({ wallet: TEST_WALLET, signature: 'sig', paidAt: 1 });
        const setPage = vi.fn();
        const onCreateEepsite = vi.fn();
        // Stub the prompt the component uses for naming
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('mysite.i2p');
        render(
            <Templates
                setPage={setPage}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={onCreateEepsite}
            />,
        );
        // After entitlement, all "Use this template" buttons (not Unlock)
        const useBtns = screen.getAllByRole('button', { name: /Use this template/i });
        // 3 free + 3 premium = 6
        expect(useBtns.length).toBe(6);
        fireEvent.click(useBtns[3]); // first premium one
        expect(promptSpy).toHaveBeenCalled();
        expect(onCreateEepsite).toHaveBeenCalled();
        expect(setPage).toHaveBeenCalledWith('code-editor');
        promptSpy.mockRestore();
    });

    it('hides premium section entirely when premiumTemplates flag is off', () => {
        setFeatureFlag('premiumTemplates', false);
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        expect(screen.queryByRole('heading', { name: /Premium/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Unlock to use/i })).toBeNull();
    });

    it('Record-purchase flow updates entitlement', () => {
        const { rerender } = render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        // Open modal
        fireEvent.click(screen.getAllByRole('button', { name: /Unlock to use/i })[0]);
        // Type a long-enough signature
        const input = screen.getByPlaceholderText(/5JK9/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: '5JK9aBcDeFgHiJkLmNoPqRsTuVwXyZ123456' } });
        fireEvent.click(screen.getByRole('button', { name: /Record purchase/i }));
        // Modal should close, banner should swap
        rerender(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        expect(screen.getByText(/Premium unlocked/i)).toBeInTheDocument();
        clearEntitlement(TEST_WALLET);
    });

    it('rejects garbage signatures in the purchase form', () => {
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={TEST_WALLET}
                onCreateEepsite={vi.fn()}
            />,
        );
        fireEvent.click(screen.getAllByRole('button', { name: /Unlock to use/i })[0]);
        const input = screen.getByPlaceholderText(/5JK9/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'short' } });
        fireEvent.click(screen.getByRole('button', { name: /Record purchase/i }));
        expect(screen.getByText(/does not look like a Solana transaction signature/i)).toBeInTheDocument();
    });

    it('rejects purchase when wallet is null', () => {
        render(
            <Templates
                setPage={vi.fn()}
                walletPubkey={null}
                onCreateEepsite={vi.fn()}
            />,
        );
        fireEvent.click(screen.getAllByRole('button', { name: /Unlock to use/i })[0]);
        const input = screen.getByPlaceholderText(/5JK9/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: '5JK9aBcDeFgHiJkLmNoPqRsTuVwXyZ123456' } });
        fireEvent.click(screen.getByRole('button', { name: /Record purchase/i }));
        expect(screen.getByText(/Connect your wallet first/i)).toBeInTheDocument();
    });
});
