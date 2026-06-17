import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import Subscription from '../../components/pages/Subscription';
import {
    applySubscribe,
    saveSubscription,
} from '../../hooks/subscriptionClient';
import { resetFeatureFlags, setFeatureFlag } from '../../featureFlags';

const W1 = 'TestWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('Subscription page', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
        resetFeatureFlags();
    });
    afterEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
        resetFeatureFlags();
    });

    it('shows "Connect a wallet" banner when wallet is null', () => {
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={null}
                onPickTier={vi.fn()}
            />,
        );
        expect(screen.getByText(/Connect a wallet/i)).toBeInTheDocument();
    });

    it('shows free-tier card when wallet has no record', () => {
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/No active subscription/i)).toBeInTheDocument();
    });

    it('shows active state + days remaining for an active subscription', () => {
        const rec = applySubscribe(null, {
            wallet: W1,
            tier: 'plus',
            durationMonths: 1,
            micros: 9_000_000,
            signature: 'sigABCDEFGH',
            isFirstSubscribe: true,
            isSeekerHolder: false,
        });
        saveSubscription(rec);
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        expect(screen.getByText(/Active/i)).toBeInTheDocument();
        expect(screen.getByText(/remaining/i)).toBeInTheDocument();
    });

    it('shows expired state when expiresAt is in the past', () => {
        // Make a record that expired yesterday
        const past = Math.floor(Date.now() / 1000) - 86400;
        saveSubscription({
            wallet: W1,
            tier: 'plus',
            monthsPaid: 1,
            renewalCount: 1,
            startedAt: past - 86400 * 30,
            expiresAt: past,
            totalUsdcPaid: 9_000_000,
            isSeekerHolder: false,
            totalEepgenTokensUsed: 0,
            totalTemplatePurchases: 0,
            lastPaymentSignature: 'sig',
        });
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        expect(screen.getByText(/Expired/i)).toBeInTheDocument();
    });

    it('shows airdrop weight breakdown when expanded', () => {
        const rec = applySubscribe(null, {
            wallet: W1,
            tier: 'plus',
            durationMonths: 6,
            micros: 54_000_000,
            signature: 'sig',
            isFirstSubscribe: true,
            isSeekerHolder: true,
        });
        saveSubscription(rec);
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        // weight = 6*4=24, *2 seeker = 48
        expect(screen.getByText('48')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Show breakdown/i }));
        expect(screen.getByText(/Tier multiplier \(plus\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Months paid/i)).toBeInTheDocument();
    });

    it('hides airdrop weight card when airdropTracking flag is off', () => {
        setFeatureFlag('airdropTracking', false);
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        // The card heading "Airdrop weight (v0.2)" should be gone
        expect(screen.queryByRole('heading', { name: /Airdrop weight/i })).toBeNull();
        // The "Show breakdown" button is gone too
        expect(screen.queryByRole('button', { name: /Show breakdown/i })).toBeNull();
    });

    it('Subscribe button calls onPickTier for non-current tiers', () => {
        const onPickTier = vi.fn();
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={onPickTier}
            />,
        );
        const subscribeBtns = screen.getAllByRole('button', { name: /^Subscribe$/i });
        fireEvent.click(subscribeBtns[0]); // first non-free tier (Plus)
        expect(onPickTier).toHaveBeenCalled();
        const argTier = onPickTier.mock.calls[0][0];
        expect(['plus', 'privacy', 'operator']).toContain(argTier.id);
    });

    it('Renew button shown for current tier; clicking calls onPickTier', () => {
        const rec = applySubscribe(null, {
            wallet: W1,
            tier: 'plus',
            durationMonths: 1,
            micros: 9_000_000,
            signature: 'sig',
            isFirstSubscribe: true,
            isSeekerHolder: false,
        });
        saveSubscription(rec);
        const onPickTier = vi.fn();
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={onPickTier}
            />,
        );
        const renewBtn = screen.getByRole('button', { name: /^Renew$/i });
        fireEvent.click(renewBtn);
        expect(onPickTier).toHaveBeenCalled();
        const argTier = onPickTier.mock.calls[0][0];
        expect(argTier.id).toBe('plus');
    });

    it('shows the v0.1 → v0.2 migration disclaimer', () => {
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        expect(screen.getByText(/local storage/i)).toBeInTheDocument();
        expect(screen.getByText(/v0\.2 migrates to on-chain/i)).toBeInTheDocument();
    });

    it('shows last payment signature when available', () => {
        const rec = applySubscribe(null, {
            wallet: W1,
            tier: 'plus',
            durationMonths: 1,
            micros: 9_000_000,
            signature: 'UniqueSigInTest12345',
            isFirstSubscribe: true,
            isSeekerHolder: false,
        });
        saveSubscription(rec);
        render(
            <Subscription
                setPage={vi.fn()}
                walletPubkey={W1}
                onPickTier={vi.fn()}
            />,
        );
        expect(screen.getByText(/UniqueSigInTest12345/)).toBeInTheDocument();
    });
});
