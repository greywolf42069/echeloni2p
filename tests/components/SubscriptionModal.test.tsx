import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import SubscriptionModal from '../../components/SubscriptionModal';
import { resetFeatureFlags, setFeatureFlag } from '../../featureFlags';
import type { SubscriptionTier, TokenBalance, UserData } from '../../types';

const PLUS_TIER: SubscriptionTier = {
    id: 'plus',
    name: 'Plus',
    prices: { RTD: 6.75, SOL: 0.06, USDC: 9, XMR: 0.06 },
    description: '50 GB bandwidth. Hosted EepGen 100K tokens/day.',
    aprBoost: 0,
};

const ZERO_USER_DATA: UserData = {
    subscription: 'Free',
    rtdBalance: 0,
    staked: 0,
    referrals: 0,
    accruedStakingRewards: 0,
    dataRelayed: 0,
    rank: 0,
};

const RICH_USER_DATA: UserData = {
    ...ZERO_USER_DATA,
    rtdBalance: 100,
};

const USDC_RICH_BALANCES: TokenBalance[] = [
    { name: 'USDC', symbol: 'USDC', logoUrl: '', balance: 50, usdValue: 50 },
];

describe('SubscriptionModal', () => {
    beforeEach(() => resetFeatureFlags());
    afterEach(() => resetFeatureFlags());

    describe('with featureFlags.tokenEconomy = false (v0.1)', () => {
        it('defaults to USDC payment method', () => {
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={ZERO_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            // The cost line should show USDC, not RTD
            expect(screen.getByText(/9 USDC \/ month/i)).toBeInTheDocument();
        });

        it('disables RTD and XMR payment buttons', () => {
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={ZERO_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            const rtdBtn = screen.getByRole('button', { name: /RTD/ });
            const xmrBtn = screen.getByRole('button', { name: /XMR/ });
            const usdcBtn = screen.getByRole('button', { name: /USDC/ });
            expect(rtdBtn).toBeDisabled();
            expect(xmrBtn).toBeDisabled();
            expect(usdcBtn).not.toBeDisabled();
        });

        it('shows the v0.2-only disclaimer', () => {
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={ZERO_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            expect(screen.getByText(/RTD.*XMR.*v0\.2/i)).toBeInTheDocument();
        });

        it('does NOT show the staking APR boost line even if tier had one', () => {
            const withBoost = { ...PLUS_TIER, aprBoost: 0.15 };
            render(
                <SubscriptionModal
                    tier={withBoost}
                    userData={ZERO_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            expect(screen.queryByText(/Staking APR Boost/i)).toBeNull();
        });

        it('confirm button calls onConfirm with USDC when balance is sufficient', () => {
            const onConfirm = vi.fn();
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={ZERO_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={onConfirm}
                />,
            );
            fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
            expect(onConfirm).toHaveBeenCalledWith(PLUS_TIER, 'USDC');
        });

        it('disables confirm button when USDC balance is insufficient', () => {
            const poorBalances: TokenBalance[] = [
                { name: 'USDC', symbol: 'USDC', logoUrl: '', balance: 1, usdValue: 1 },
            ];
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={ZERO_USER_DATA}
                    balances={poorBalances}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            const confirmBtn = screen.getByRole('button', { name: /^Confirm$/ });
            expect(confirmBtn).toBeDisabled();
            expect(screen.getByText(/do not have enough USDC/i)).toBeInTheDocument();
        });
    });

    describe('with featureFlags.tokenEconomy = true (v0.2)', () => {
        beforeEach(() => setFeatureFlag('tokenEconomy', true));

        it('defaults to RTD payment method', () => {
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={RICH_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            expect(screen.getByText(/6\.75 RTD \/ month/i)).toBeInTheDocument();
        });

        it('enables all four payment buttons', () => {
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={RICH_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            expect(screen.getByRole('button', { name: /RTD/ })).not.toBeDisabled();
            expect(screen.getByRole('button', { name: /USDC/ })).not.toBeDisabled();
            expect(screen.getByRole('button', { name: /SOL/ })).not.toBeDisabled();
            expect(screen.getByRole('button', { name: /XMR/ })).not.toBeDisabled();
        });

        it('shows staking APR boost when tier has one', () => {
            const withBoost = { ...PLUS_TIER, aprBoost: 0.15 };
            render(
                <SubscriptionModal
                    tier={withBoost}
                    userData={RICH_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            expect(screen.getByText(/\+15% Staking APR Boost/i)).toBeInTheDocument();
        });

        it('does NOT show the v0.2 disclaimer (already on v0.2)', () => {
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={RICH_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={vi.fn()}
                />,
            );
            expect(screen.queryByText(/v0\.2 token launch/i)).toBeNull();
        });

        it('switches payment method on click', () => {
            const onConfirm = vi.fn();
            render(
                <SubscriptionModal
                    tier={PLUS_TIER}
                    userData={RICH_USER_DATA}
                    balances={USDC_RICH_BALANCES}
                    onClose={vi.fn()}
                    onConfirm={onConfirm}
                />,
            );
            fireEvent.click(screen.getByRole('button', { name: /USDC/ }));
            fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
            expect(onConfirm).toHaveBeenCalledWith(PLUS_TIER, 'USDC');
        });
    });
});
