import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import Dashboard from '../../components/pages/Dashboard';
import { resetFeatureFlags, setFeatureFlag } from '../../featureFlags';
import type { Eepsite, UserData } from '../../types';
import type { I2pStats } from '../../hooks/useI2pStats';
import type { BlockEvent } from '../../hooks/filterEventsClient';

const ZERO_USER: UserData = {
    subscription: 'Free',
    rtdBalance: 0,
    staked: 0,
    referrals: 0,
    accruedStakingRewards: 0,
    dataRelayed: 0,
    rank: 0,
};

const PLUS_USER: UserData = { ...ZERO_USER, subscription: 'Plus' };

const RUNNING_STATS: I2pStats = {
    running: true,
    version: '2.55.0',
    networkStatus: 'OK',
    uptimeSeconds: 0,
    tunnelCreationSuccessPercent: 100,
    receivedBps: 0,
    sentBps: 0,
    transitBps: 0,
    totalReceivedBytes: 0,
    totalSentBytes: 0,
    totalTransitBytes: 0,
    routers: 1234,
    floodfills: 27,
    leaseSets: 5,
    tunnelsClient: 0,
    tunnelsTransit: 0,
};

const DOWN_STATS: I2pStats = { ...RUNNING_STATS, running: false };

const NO_EVENTS: BlockEvent[] = [];

describe('Dashboard (v0.1, tokenEconomy=false)', () => {
    beforeEach(() => resetFeatureFlags());
    afterEach(() => resetFeatureFlags());

    it('renders the page heading + v0.1 beta banner', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.getByRole('heading', { name: /Dashboard/i })).toBeInTheDocument();
        expect(screen.getByText(/v0\.1 beta/i)).toBeInTheDocument();
    });

    it('does NOT render the "Stake RTD" quick action', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.queryByRole('button', { name: /Stake RTD/i })).toBeNull();
        // Wallet button takes its slot in v0.1
        expect(screen.getByRole('button', { name: /^Wallet$/i })).toBeInTheDocument();
    });

    it('shows USDC pricing on subscription tiers, not RTD pricing', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        // Plus tier $9 (also appears in upgrade-CTA copy → use getAllByText)
        expect(screen.getAllByText(/\$9/).length).toBeGreaterThan(0);
        // Privacy tier $29
        expect(screen.getByText(/\$29/)).toBeInTheDocument();
        // Operator tier $99
        expect(screen.getByText(/\$99/)).toBeInTheDocument();
    });

    it('does NOT show "+X% Staking APR Boost" on tiers in v0.1', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.queryByText(/Staking APR Boost/i)).toBeNull();
    });

    it('shows airdrop weight card when airdropTracking flag is on', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        // The card title appears once; the explanatory text mentions
        // "v0.2 RTD airdrop weight" — both should be in the document.
        expect(screen.getAllByText(/Airdrop weight/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/v0\.2 RTD airdrop weight/i)).toBeInTheDocument();
    });

    it('hides airdrop weight card when airdropTracking flag is off', () => {
        setFeatureFlag('airdropTracking', false);
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.queryByText(/Airdrop weight/i)).toBeNull();
    });

    it('renders MeshnetStatus when i2pd is reachable', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.getByText(/Meshnet Status/i)).toBeInTheDocument();
        expect(screen.getByText(/i2pd 2\.55\.0/)).toBeInTheDocument();
    });

    it('shows the "i2pd not detected" empty state when daemon is down', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={DOWN_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.getByText(/i2pd not detected/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Configure I2P/i })).toBeInTheDocument();
    });

    it('subscription card shows "Free" + Upgrade-to-Plus CTA for free users', () => {
        const onUpgrade = vi.fn();
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={onUpgrade}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        const upgradeBtn = screen.getByRole('button', { name: /Upgrade to Plus/i });
        expect(upgradeBtn).toBeInTheDocument();
    });

    it('subscription card hides Upgrade CTA for paid users', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={PLUS_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.queryByRole('button', { name: /Upgrade to Plus/i })).toBeNull();
    });

    it('eepsite card shows online / total counts', () => {
        const eepsites: Eepsite[] = [
            { id: '1', name: 'a.i2p', localDirectory: '/a', status: 'Online', createdAt: new Date(), files: {} },
            { id: '2', name: 'b.i2p', localDirectory: '/b', status: 'Offline', createdAt: new Date(), files: {} },
            { id: '3', name: 'c.i2p', localDirectory: '/c', status: 'Online', createdAt: new Date(), files: {} },
        ];
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={eepsites}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText(/3 online/)).toBeInTheDocument();
    });

    it('threat card shows real block-event count', () => {
        const events: BlockEvent[] = [
            { seq: 1, list_source: 'StevenBlack', domain: 'tracker.example', timestamp: 1, request_kind: 'http' },
            { seq: 2, list_source: 'StevenBlack', domain: 'ads.example', timestamp: 2, request_kind: 'http' },
        ];
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={events}
                walletPubkey={null}
            />,
        );
        expect(screen.getByText(/Threats blocked/i)).toBeInTheDocument();
        expect(screen.getByText(/in this session/i)).toBeInTheDocument();
    });
});

describe('Dashboard (v0.2, tokenEconomy=true)', () => {
    beforeEach(() => {
        resetFeatureFlags();
        setFeatureFlag('tokenEconomy', true);
    });
    afterEach(() => resetFeatureFlags());

    it('renders "Stake RTD" quick action and not Wallet', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        expect(screen.getByRole('button', { name: /Stake RTD/i })).toBeInTheDocument();
    });

    it('shows RTD price next to USDC on tiers', () => {
        render(
            <Dashboard
                setPage={vi.fn()}
                openModal={vi.fn()}
                userData={ZERO_USER}
                onUpgrade={vi.fn()}
                eepsites={[]}
                i2pStats={RUNNING_STATS}
                blockEvents={NO_EVENTS}
                walletPubkey={null}
            />,
        );
        // Plus RTD price
        expect(screen.getByText(/or 6\.75 RTD/i)).toBeInTheDocument();
    });
});
