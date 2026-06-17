import React from 'react';
import Card from '../ui/Card.tsx';
import Banner from '../ui/Banner.tsx';
import MeshnetStatus from '../MeshnetStatus.tsx';
import type { Page, UserData, SubscriptionTier, Eepsite } from '../../types';
import type { BlockEvent } from '../../hooks/filterEventsClient.ts';
import { SUBSCRIPTION_TIERS } from '../../data.ts';
import type { I2pStats } from '../../hooks/useI2pStats.ts';
import { useFeatureFlags } from '../../hooks/useFeatureFlags.ts';
import { useSubscription, freeRecord, computeAirdropWeight } from '../../hooks/subscriptionClient.ts';

// ── Icons ───────────────────────────────────────────────────────────

const ShieldCheckIcon = ({ className = "h-8 w-8" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.286zm0 13.036h.008v.008h-.008v-.008z" />
    </svg>
);

const BrowserIcon = ({ className = "h-8 w-8" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="9" strokeLinejoin="round" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18" />
    </svg>
);

const EditorIcon = ({ className = "h-8 w-8" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const WalletIcon = ({ className = "h-8 w-8" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 6h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm12 7a1 1 0 100 2 1 1 0 000-2z" />
    </svg>
);

const StakeIcon = ({ className = "h-8 w-8" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 21z" />
    </svg>
);

const CheckCircleIcon = ({ className = "h-5 w-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const GiftIcon = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
);

// ── Sub-components ──────────────────────────────────────────────────

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
    <button
        onClick={onClick}
        className="flex flex-col items-center justify-center text-center p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-700/80 hover:border-slate-600 transition-all duration-200 space-y-2"
    >
        {icon}
        <span className="font-semibold text-sm text-gray-300">{label}</span>
    </button>
);

const SubscriptionStatusCard: React.FC<{
    userData: UserData;
    onPickTier: (tier: SubscriptionTier) => void;
}> = ({ userData, onPickTier }) => {
    const isOnFree = userData.subscription === 'Free' || userData.subscription === '';
    const plusTier = SUBSCRIPTION_TIERS.find(t => t.id === 'plus')!;
    return (
        <Card className="!p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                        Your subscription
                    </h3>
                    <p className="text-2xl font-bold text-white mt-1">{userData.subscription || 'Free'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {isOnFree
                            ? 'BYOK Gemini · 1 eepsite · 3 starter templates'
                            : 'Active subscription'}
                    </p>
                </div>
                <ShieldCheckIcon className="h-10 w-10 text-purple-400 flex-shrink-0" />
            </div>
            {isOnFree && (
                <button
                    onClick={() => onPickTier(plusTier)}
                    className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                    Upgrade to Plus — ${plusTier.prices.USDC}/mo
                </button>
            )}
        </Card>
    );
};

const EepsitesCard: React.FC<{ eepsites: Eepsite[]; setPage: (p: Page) => void }> = ({
    eepsites,
    setPage,
}) => {
    const online = eepsites.filter(e => e.status === 'Online').length;
    const total = eepsites.length;
    return (
        <Card className="!p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                        Your eepsites
                    </h3>
                    <p className="text-2xl font-bold text-white mt-1">
                        {online}<span className="text-base font-medium text-gray-400"> / {total} online</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        {total === 0
                            ? 'No eepsites yet — create one in the IDE.'
                            : `${total} hosted on your local i2pd.`}
                    </p>
                </div>
                <EditorIcon className="h-10 w-10 text-teal-400 flex-shrink-0" />
            </div>
            <button
                onClick={() => setPage('eepsite-hosting')}
                className="mt-4 w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
                Manage eepsites
            </button>
        </Card>
    );
};

const ThreatFilterCard: React.FC<{ blockEvents: BlockEvent[]; setPage: (p: Page) => void }> = ({
    blockEvents,
    setPage,
}) => {
    const total = blockEvents.length; // local-window total since session start
    return (
        <Card className="!p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                        Threats blocked
                    </h3>
                    <p className="text-2xl font-bold text-white mt-1">
                        {total}<span className="text-base font-medium text-gray-400"> in this session</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Live from your local filter proxy.
                    </p>
                </div>
                <ShieldCheckIcon className="h-10 w-10 text-red-400 flex-shrink-0" />
            </div>
            <button
                onClick={() => setPage('protect')}
                className="mt-4 w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
                View activity
            </button>
        </Card>
    );
};

const AirdropWeightCard: React.FC<{ walletPubkey: string | null }> = ({ walletPubkey }) => {
    // Real airdrop weight from the persisted subscription record (the
    // same SubscriptionRecord shape the v0.2 on-chain program reads).
    // computeAirdropWeight is the exact §13.3 formula.
    const { subscription } = useSubscription(walletPubkey);
    const rec = subscription ?? (walletPubkey ? freeRecord(walletPubkey) : null);
    const weight = rec ? computeAirdropWeight(rec) : 0;
    return (
        <Card className="!p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                        Airdrop weight (v0.2)
                    </h3>
                    <p className="text-2xl font-bold text-white mt-1">{weight}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {weight === 0
                            ? 'Subscribe to start earning v0.2 RTD airdrop weight.'
                            : 'Accumulating toward v0.2 retroactive airdrop.'}
                    </p>
                </div>
                <GiftIcon className="h-10 w-10 text-yellow-300 flex-shrink-0" />
            </div>
            <p className="mt-4 text-[11px] text-gray-500 leading-relaxed">
                {rec?.isSeekerHolder
                    ? 'Seeker Genesis Token active — 2× weight. '
                    : ''}
                Distribution at v0.2 RTD launch. Weighted by tier × months × Seeker Genesis Token boost.
            </p>
        </Card>
    );
};

// ── Main ────────────────────────────────────────────────────────────

interface DashboardProps {
    setPage: (page: Page) => void;
    openModal: (modal: 'send' | 'receive') => void;
    userData: UserData;
    onUpgrade: (tier: SubscriptionTier) => void;
    eepsites: Eepsite[];
    i2pStats: I2pStats;
    blockEvents: BlockEvent[];
    walletPubkey: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({
    setPage,
    openModal,
    userData,
    onUpgrade,
    eepsites,
    i2pStats,
    blockEvents,
    walletPubkey,
}) => {
    const flags = useFeatureFlags();

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">Dashboard</h1>
                <Banner kind="beta" className="!py-1.5 !px-3">
                    Subscription billing on Solana, RTD token launches in v0.2.
                </Banner>
            </div>

            {/* Top status row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SubscriptionStatusCard userData={userData} onPickTier={onUpgrade} />
                <EepsitesCard eepsites={eepsites} setPage={setPage} />
                <ThreatFilterCard blockEvents={blockEvents} setPage={setPage} />
                {flags.airdropTracking && <AirdropWeightCard walletPubkey={walletPubkey} />}
            </div>

            {/* Real meshnet status — only renders when daemon is reachable */}
            {i2pStats.running ? (
                <MeshnetStatus stats={i2pStats} />
            ) : (
                <Card>
                    <div className="text-center py-6">
                        <h2 className="text-lg font-semibold text-white">i2pd not detected</h2>
                        <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
                            Echelon needs i2pd running locally (typically via Termux on Android) to do anything privacy-related. Set it up to light up routing, browsing, and eepsite hosting.
                        </p>
                        <button
                            onClick={() => setPage('protect')}
                            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition"
                        >
                            Configure I2P
                        </button>
                    </div>
                </Card>
            )}

            {/* Quick Actions */}
            <Card>
                <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ActionButton
                        icon={<BrowserIcon className="h-8 w-8 text-teal-400" />}
                        label="I2P Browser"
                        onClick={() => setPage('browser')}
                    />
                    <ActionButton
                        icon={<EditorIcon className="h-8 w-8 text-purple-400" />}
                        label="Eepsite IDE"
                        onClick={() => setPage('code-editor')}
                    />
                    <ActionButton
                        icon={<ShieldCheckIcon className="h-8 w-8 text-green-400" />}
                        label="Protection"
                        onClick={() => setPage('protect')}
                    />
                    {flags.tokenEconomy ? (
                        <ActionButton
                            icon={<StakeIcon className="h-8 w-8 text-yellow-400" />}
                            label="Stake RTD"
                            onClick={() => setPage('staking')}
                        />
                    ) : (
                        <ActionButton
                            icon={<WalletIcon className="h-8 w-8 text-blue-400" />}
                            label="Wallet"
                            onClick={() => setPage('wallet')}
                        />
                    )}
                </div>
            </Card>

            {/* Subscription tiers comparison */}
            <Card>
                <h2 className="text-xl font-semibold text-white mb-2">Subscription Tiers</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Pay in USDC today, get the same plan for less in RTD when v0.2 ships.
                </p>
                <div className="space-y-4">
                    {SUBSCRIPTION_TIERS.map(tier => {
                        const isCurrentPlan = userData.subscription === tier.name;
                        const currentPlanIndex = SUBSCRIPTION_TIERS.findIndex(t => t.name === userData.subscription);
                        const tierIndex = SUBSCRIPTION_TIERS.findIndex(t => t.id === tier.id);
                        const isUpgrade = tierIndex > currentPlanIndex;
                        const isFree = tier.id === 'free';

                        return (
                            <div
                                key={tier.id}
                                className={`p-4 border-2 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                                    isCurrentPlan
                                        ? 'border-purple-500 bg-slate-900/50'
                                        : 'border-slate-700'
                                }`}
                            >
                                <div className="flex-1">
                                    <h3 className="font-bold text-white">{tier.name}</h3>
                                    {isCurrentPlan && (
                                        <div className="flex items-center gap-2 text-xs text-green-400 mt-1">
                                            <CheckCircleIcon className="w-4 h-4" />
                                            <span>Current Plan</span>
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-400 mt-1">{tier.description}</p>
                                    {flags.tokenEconomy && tier.aprBoost > 0 && (
                                        <p className="text-sm text-teal-400 font-semibold mt-1">
                                            +{(tier.aprBoost * 100)}% Staking APR Boost
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0">
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-white">
                                            {isFree
                                                ? 'Free'
                                                : <>${tier.prices.USDC}<span className="text-base font-medium text-gray-400"> /mo</span></>}
                                        </p>
                                        {!isFree && flags.tokenEconomy && (
                                            <p className="text-xs text-purple-300 mt-0.5">
                                                or {tier.prices.RTD} RTD
                                            </p>
                                        )}
                                    </div>
                                    {isFree ? (
                                        <button
                                            disabled
                                            className="font-semibold py-2 px-4 rounded-lg bg-slate-700 text-gray-400 cursor-default"
                                        >
                                            Default
                                        </button>
                                    ) : isCurrentPlan ? (
                                        <button
                                            disabled
                                            className="font-semibold py-2 px-4 rounded-lg bg-slate-700 text-gray-400 cursor-default"
                                        >
                                            Current
                                        </button>
                                    ) : isUpgrade ? (
                                        <button
                                            onClick={() => onUpgrade(tier)}
                                            className="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition"
                                        >
                                            Upgrade
                                        </button>
                                    ) : (
                                        <button
                                            disabled
                                            className="font-semibold py-2 px-4 rounded-lg bg-slate-600 text-gray-500 cursor-not-allowed"
                                        >
                                            Downgrade
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* receive/send is part of Wallet now; the button was duplicated here pre-rewrite. */}
            <button
                onClick={() => openModal('receive')}
                className="hidden"
                aria-hidden="true"
            />
        </div>
    );
};

export default Dashboard;
