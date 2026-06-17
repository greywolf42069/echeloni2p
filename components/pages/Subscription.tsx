import React, { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card.tsx';
import Banner from '../ui/Banner.tsx';
import { SUBSCRIPTION_TIERS } from '../../data.ts';
import {
    computeAirdropWeight,
    freeRecord,
    useSubscription,
    type SubscriptionRecord,
} from '../../hooks/subscriptionClient.ts';
import { useFeatureFlags } from '../../hooks/useFeatureFlags.ts';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import { fetchQuota } from '../../hooks/syncDaemonClient.ts';
import type { Page, SubscriptionTier as TierDef } from '../../types';

interface SubscriptionProps {
    setPage: (page: Page) => void;
    walletPubkey: string | null;
    onPickTier(tier: TierDef): void;
}

function relExpiry(daysRemaining: number): string {
    if (daysRemaining <= 0) return 'expired';
    if (daysRemaining === 1) return '1 day remaining';
    if (daysRemaining < 30) return `${daysRemaining} days remaining`;
    const months = Math.floor(daysRemaining / 30);
    return months === 1 ? '1 month remaining' : `${months} months remaining`;
}

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-gray-400">{label}</div>
        <div className="mt-2 text-2xl font-black text-white tabular-nums">{value}</div>
    </div>
);

const Subscription: React.FC<SubscriptionProps> = ({ setPage, walletPubkey, onPickTier }) => {
    const flags = useFeatureFlags();
    const { config } = useEchelonConfig();
    const { subscription, isActive, daysRemaining } = useSubscription(walletPubkey);
    const [showAirdropDetails, setShowAirdropDetails] = useState(false);
    const [liveQuota, setLiveQuota] = useState<any | null>(null);

    const rec: SubscriptionRecord = subscription ?? (walletPubkey ? freeRecord(walletPubkey) : freeRecord('—'));

    const currentTierDef = useMemo(
        () => SUBSCRIPTION_TIERS.find(t => t.id === rec.tier) ?? SUBSCRIPTION_TIERS[0],
        [rec.tier],
    );

    const airdropWeight = computeAirdropWeight(rec);

    useEffect(() => {
        let alive = true;
        if (!walletPubkey) {
            setLiveQuota(null);
            return;
        }
        fetchQuota(config, walletPubkey).then(q => {
            if (alive) setLiveQuota(q);
        });
        return () => {
            alive = false;
        };
    }, [walletPubkey, config]);

    const entitlement = liveQuota?.entitlement ?? null;
    const used = {
        daily_page_views: entitlement?.page_views_today ?? 0,
        hosted_eepsites: entitlement?.eepsites_hosted ?? 0,
        daily_ai_tokens: entitlement?.ai_tokens_today ?? rec.totalEepgenTokensUsed,
    };

    const quotas = {
        daily_page_views: rec.tier === 'free' ? 25 : rec.tier === 'plus' ? 250 : rec.tier === 'privacy' ? 1000 : 5000,
        hosted_eepsites: rec.tier === 'free' ? 1 : rec.tier === 'plus' ? 5 : rec.tier === 'privacy' ? 10 : 25,
        daily_ai_tokens: rec.tier === 'free' ? 0 : rec.tier === 'plus' ? 100_000 : rec.tier === 'privacy' ? 1_000_000 : 5_000_000,
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Subscription</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Pay in USDC. Token-economy benefits (RTD discount + APR boost) activate at v0.2.
                </p>
            </div>

            {!walletPubkey && (
                <Banner kind="info">
                    Connect a wallet to subscribe and start accumulating airdrop weight.
                </Banner>
            )}

            <Card>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase text-gray-400 font-semibold">Current tier</p>
                        <p className="text-3xl font-bold text-white mt-1">{currentTierDef.name}</p>
                        <p className="text-sm text-gray-400 mt-1">{currentTierDef.description}</p>
                    </div>
                    {isActive ? (
                        <div className="text-right">
                            <p className="text-xs uppercase text-gray-400 font-semibold">Status</p>
                            <p className="text-sm text-green-300 mt-1 font-semibold">Active</p>
                            <p className="text-xs text-gray-400 mt-0.5">{relExpiry(daysRemaining)}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Renewal {rec.renewalCount > 0 ? `${rec.renewalCount}× ago` : 'never'}
                            </p>
                        </div>
                    ) : rec.tier === 'free' ? (
                        <div className="text-right">
                            <p className="text-xs uppercase text-gray-400 font-semibold">Status</p>
                            <p className="text-sm text-gray-300 mt-1">Free tier</p>
                            <p className="text-xs text-gray-500 mt-0.5">No active subscription</p>
                        </div>
                    ) : (
                        <div className="text-right">
                            <p className="text-xs uppercase text-gray-400 font-semibold">Status</p>
                            <p className="text-sm text-amber-300 mt-1 font-semibold">Expired</p>
                            <p className="text-xs text-gray-500 mt-0.5">Renew to restore access</p>
                        </div>
                    )}
                </div>
                {rec.lastPaymentSignature && (
                    <p className="text-xs text-gray-500 mt-4 font-mono break-all">
                        Last payment: {rec.lastPaymentSignature}
                    </p>
                )}
            </Card>

            <Card>
                <div className="grid gap-3 sm:grid-cols-3">
                    <StatPill label="Browser quota" value={`${used.daily_page_views.toLocaleString()} / ${quotas.daily_page_views.toLocaleString()}`} />
                    <StatPill label="Hosted eepsites" value={`${used.hosted_eepsites} / ${quotas.hosted_eepsites}`} />
                    <StatPill label="AI tokens" value={`${used.daily_ai_tokens.toLocaleString()} / ${quotas.daily_ai_tokens.toLocaleString()}`} />
                </div>
            </Card>

            {flags.airdropTracking && walletPubkey && (
                <Card>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold text-white">Airdrop weight (v0.2)</h2>
                            <p className="text-sm text-gray-400 mt-1">
                                Snapshot at v0.2 RTD launch. Weighted by tier × months × Seeker boost.
                            </p>
                        </div>
                        <p className="text-3xl font-bold text-yellow-300">{airdropWeight}</p>
                    </div>
                    <button
                        onClick={() => setShowAirdropDetails(s => !s)}
                        className="mt-3 text-sm text-purple-300 hover:text-purple-200 underline"
                    >
                        {showAirdropDetails ? 'Hide breakdown' : 'Show breakdown'}
                    </button>
                    {showAirdropDetails && (
                        <div className="mt-3 p-3 bg-slate-900/50 rounded-lg text-sm text-gray-300 space-y-1">
                            <div className="flex justify-between"><span>Tier multiplier ({rec.tier})</span><span>×{rec.tier === 'plus' ? 4 : rec.tier === 'privacy' ? 12 : rec.tier === 'operator' ? 40 : 0}</span></div>
                            <div className="flex justify-between"><span>Months paid</span><span>{rec.monthsPaid}</span></div>
                            <div className="flex justify-between"><span>Template pack purchase</span><span>{rec.totalTemplatePurchases > 0 ? '+5' : '—'}</span></div>
                            <div className="flex justify-between"><span>EepGen tokens used</span><span>{(rec.totalEepgenTokensUsed / 1_000_000).toFixed(1)}M (+{Math.min(20, Math.floor(rec.totalEepgenTokensUsed / 1_000_000) * 2)})</span></div>
                            <div className="flex justify-between"><span>Seeker holder</span><span>{rec.isSeekerHolder ? '×2' : '×1'}</span></div>
                            <div className="flex justify-between font-semibold text-white pt-1 border-t border-slate-700"><span>Total weight</span><span>{airdropWeight}</span></div>
                        </div>
                    )}
                </Card>
            )}

            <Card>
                <h2 className="text-xl font-semibold text-white mb-4">Available tiers</h2>
                <div className="space-y-3">
                    {SUBSCRIPTION_TIERS.map(tier => {
                        const isCurrent = tier.id === rec.tier;
                        const isFree = tier.id === 'free';
                        return (
                            <div
                                key={tier.id}
                                className={`p-4 border-2 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                    isCurrent ? 'border-purple-500 bg-slate-900/40' : 'border-slate-700'
                                }`}
                            >
                                <div className="flex-1">
                                    <h3 className="font-bold text-white">{tier.name}</h3>
                                    <p className="text-sm text-gray-400 mt-1">{tier.description}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <p className="text-xl font-bold text-white">
                                        {isFree ? 'Free' : <>${tier.prices.USDC}<span className="text-base font-medium text-gray-400"> /mo</span></>}
                                    </p>
                                    {isFree ? (
                                        <button disabled className="py-2 px-4 rounded-lg bg-slate-700 text-gray-400 cursor-default font-semibold">
                                            Default
                                        </button>
                                    ) : isCurrent ? (
                                        <button
                                            onClick={() => onPickTier(tier)}
                                            className="py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold"
                                        >
                                            Renew
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onPickTier(tier)}
                                            className="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                        >
                                            Subscribe
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <p className="text-xs text-gray-500 text-center pb-4">
                v0.1 stores subscription state in your browser's local storage. v0.2 migrates to on-chain SubscriptionPDA records (with the same airdrop weight inputs).
            </p>
        </div>
    );
};

export default Subscription;
