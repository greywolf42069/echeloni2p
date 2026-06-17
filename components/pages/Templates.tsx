import React, { useState } from 'react';
import Card from '../ui/Card.tsx';
import Banner from '../ui/Banner.tsx';
import {
    ALL_TEMPLATES,
    FREE_TEMPLATES,
    PREMIUM_TEMPLATES,
} from '../templates/catalog.ts';
import type { TemplateDescriptor } from '../templates/types.ts';
import { foundationUsdcRecipient } from '../../config/foundation.ts';
import { useFeatureFlags } from '../../hooks/useFeatureFlags.ts';
import { useTemplateEntitlement, recordEntitlement } from '../../hooks/templateEntitlement.ts';
import type { Page, Eepsite, FileTree } from '../../types';

interface TemplatesProps {
    setPage: (page: Page) => void;
    /** Connected wallet pubkey (null when not connected). Drives entitlement. */
    walletPubkey: string | null;
    /** When user clicks "Use this template", create a new eepsite from it. */
    onCreateEepsite(name: string, files: FileTree): void;
}

const ACCENT_CLASSES = {
    purple: { border: 'border-purple-500/40', tag: 'bg-purple-500/15 text-purple-200', glow: 'hover:border-purple-400' },
    teal: { border: 'border-teal-500/40', tag: 'bg-teal-500/15 text-teal-200', glow: 'hover:border-teal-400' },
    amber: { border: 'border-amber-500/40', tag: 'bg-amber-500/15 text-amber-200', glow: 'hover:border-amber-400' },
    rose: { border: 'border-rose-500/40', tag: 'bg-rose-500/15 text-rose-200', glow: 'hover:border-rose-400' },
    emerald: { border: 'border-emerald-500/40', tag: 'bg-emerald-500/15 text-emerald-200', glow: 'hover:border-emerald-400' },
    sky: { border: 'border-sky-500/40', tag: 'bg-sky-500/15 text-sky-200', glow: 'hover:border-sky-400' },
} as const;

const Templates: React.FC<TemplatesProps> = ({ setPage, walletPubkey, onCreateEepsite }) => {
    const flags = useFeatureFlags();
    const { entitled } = useTemplateEntitlement(walletPubkey);
    const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

    const handleUseTemplate = (tpl: TemplateDescriptor) => {
        if (tpl.tier === 'premium' && !entitled) {
            setPurchaseModalOpen(true);
            return;
        }
        const defaultName = tpl.id.replace(/^tpl-/, '') + '.i2p';
        const name = prompt(`Name for your new eepsite?`, defaultName) || defaultName;
        onCreateEepsite(name, tpl.buildFiles());
        setPage('code-editor');
    };

    const showPremium = flags.premiumTemplates;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Templates</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Pick a starting point. Edit in the IDE. Publish to your local i2pd.
                </p>
            </div>

            {!entitled && showPremium && (
                <Banner kind="info">
                    <strong>Premium pack — $19 USDC, one-time.</strong>{' '}
                    Unlocks all 3 premium templates forever, for this wallet.{' '}
                    <button
                        onClick={() => setPurchaseModalOpen(true)}
                        className="underline text-purple-300 hover:text-purple-200"
                    >
                        See purchase details →
                    </button>
                </Banner>
            )}
            {entitled && (
                <Banner kind="info" title="Premium unlocked">
                    Thanks for supporting Echelon. You have access to all current and future premium templates with this wallet.
                </Banner>
            )}

            <Card>
                <h2 className="text-xl font-semibold text-white mb-1">Free</h2>
                <p className="text-sm text-gray-400 mb-4">
                    {FREE_TEMPLATES.length} starter templates ship to every Echelon user.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {FREE_TEMPLATES.map(tpl => (
                        <TemplateCard
                            key={tpl.id}
                            tpl={tpl}
                            locked={false}
                            onUse={() => handleUseTemplate(tpl)}
                        />
                    ))}
                </div>
            </Card>

            {showPremium && (
                <Card>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-xl font-semibold text-white">Premium</h2>
                        {!entitled && (
                            <span className="text-xs px-2 py-1 bg-purple-500/15 text-purple-200 rounded-full">
                                $19 USDC unlock
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-400 mb-4">
                        {PREMIUM_TEMPLATES.length} designed templates. Click any to preview;
                        unlock the pack to use them.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {PREMIUM_TEMPLATES.map(tpl => (
                            <TemplateCard
                                key={tpl.id}
                                tpl={tpl}
                                locked={!entitled}
                                onUse={() => handleUseTemplate(tpl)}
                            />
                        ))}
                    </div>
                </Card>
            )}

            {purchaseModalOpen && (
                <PurchaseModal
                    walletPubkey={walletPubkey}
                    onClose={() => setPurchaseModalOpen(false)}
                />
            )}
        </div>
    );
};

const TemplateCard: React.FC<{
    tpl: TemplateDescriptor;
    locked: boolean;
    onUse: () => void;
}> = ({ tpl, locked, onUse }) => {
    const accent = ACCENT_CLASSES[tpl.accent];
    return (
        <div
            data-template-id={tpl.id}
            data-template-tier={tpl.tier}
            className={`relative p-4 bg-slate-800/70 border-2 rounded-lg transition-all ${accent.border} ${accent.glow}`}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-white">{tpl.name}</h3>
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-semibold ${accent.tag}`}>
                    {tpl.category}
                </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4 min-h-[3rem]">
                {tpl.description}
            </p>
            <button
                onClick={onUse}
                className={`w-full py-2 rounded-lg font-semibold text-sm transition ${
                    locked
                        ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
            >
                {locked ? '🔒 Unlock to use' : 'Use this template'}
            </button>
        </div>
    );
};

const PurchaseModal: React.FC<{
    walletPubkey: string | null;
    onClose: () => void;
}> = ({ walletPubkey, onClose }) => {
    const [signature, setSignature] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!walletPubkey) {
            setError('Connect your wallet first.');
            return;
        }
        const sig = signature.trim();
        if (sig.length < 32 || sig.length > 100) {
            setError('That does not look like a Solana transaction signature.');
            return;
        }
        recordEntitlement({
            wallet: walletPubkey,
            signature: sig,
            paidAt: Date.now(),
        });
        onClose();
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Premium template purchase"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Unlock premium templates</h2>
                <p className="text-sm text-gray-300">
                    Send <strong>$19 USDC</strong> on Solana to the Echelon foundation address below,
                    then paste the transaction signature to record your entitlement.
                </p>
                <div className="bg-slate-800 p-3 rounded-lg space-y-2">
                    <p className="text-xs uppercase text-gray-400 font-semibold">Foundation USDC address</p>
                    <code className="text-purple-300 font-mono text-xs break-all" data-foundation-address>
                        {foundationUsdcRecipient()}
                    </code>
                    <p className="text-xs text-amber-300">
                        ⚠ Replace this placeholder before mainnet. v0.1 ships with the literal placeholder
                        for review purposes; the on-chain Anchor program (v0.2) replaces this manual flow
                        with a one-click <code>purchase_template_pack()</code> instruction.
                    </p>
                </div>
                <form onSubmit={handleSubmit}>
                    <label className="block">
                        <span className="text-xs text-gray-400 font-semibold uppercase">
                            Paste transaction signature
                        </span>
                        <input
                            type="text"
                            value={signature}
                            onChange={e => setSignature(e.target.value)}
                            placeholder="5JK9...XyZ"
                            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                        />
                    </label>
                    {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
                    <p className="text-xs text-gray-500 mt-3">
                        We trust your input here. The v0.2 program will replace this with on-chain verification.
                    </p>
                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition"
                        >
                            Record purchase
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Templates;
