import React, { useMemo, useState } from 'react';
import Modal from './ui/Modal.tsx';
import type { SubscriptionTier, UserData, TokenBalance, PaymentMethod } from '../types';
import { useFeatureFlags } from '../hooks/useFeatureFlags.ts';

interface SubscriptionModalProps {
    tier: SubscriptionTier;
    userData: UserData;
    balances: TokenBalance[];
    onClose: () => void;
    onConfirm: (tier: SubscriptionTier, paymentMethod: PaymentMethod) => void;
}

const UpgradeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
    </svg>
);

const PaymentButton: React.FC<{
    method: PaymentMethod;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
    note?: string;
}> = ({ method, selected, onClick, disabled, note }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex-1 p-2 text-sm font-semibold rounded-md transition-colors flex flex-col items-center ${
            disabled
                ? 'bg-slate-800/40 text-gray-500 cursor-not-allowed'
                : selected
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/50 hover:bg-slate-700'
        }`}
    >
        <span>{method}</span>
        {note && <span className="text-[10px] opacity-70 mt-0.5">{note}</span>}
    </button>
);

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
    tier,
    userData,
    balances,
    onClose,
    onConfirm,
}) => {
    const flags = useFeatureFlags();

    // v0.1 (tokenEconomy off) defaults to USDC and disables RTD/XMR
    // payment lanes. v0.2+ defaults to RTD (cheapest, has 25% discount
    // baked into the price column) and enables all four lanes.
    const defaultMethod: PaymentMethod = flags.tokenEconomy ? 'RTD' : 'USDC';
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultMethod);

    // Allowed methods: USDC + SOL always. RTD + XMR only when tokenEconomy
    // is on (RTD doesn't exist yet in v0.1; XMR is privacy-tier-only and
    // requires off-chain settlement which v0.1 doesn't ship).
    const isMethodAllowed = (m: PaymentMethod): boolean => {
        if (m === 'RTD' || m === 'XMR') return flags.tokenEconomy;
        return true;
    };

    const { hasEnoughFunds, currentBalance } = useMemo(() => {
        const price = tier.prices[paymentMethod];
        let balance = 0;

        switch (paymentMethod) {
            case 'RTD':
                balance = userData.rtdBalance;
                break;
            case 'SOL':
            case 'USDC':
                {
                    const token = balances.find(b => b.symbol === paymentMethod);
                    balance = token?.balance || 0;
                }
                break;
            case 'XMR':
                // Privacy-coin lane — settlement is off-chain so we
                // can't verify balance on the client.
                return { hasEnoughFunds: true, currentBalance: 'N/A' };
        }
        return {
            hasEnoughFunds: balance >= price,
            currentBalance: balance.toLocaleString(undefined, { maximumFractionDigits: 4 }),
        };
    }, [tier, userData, balances, paymentMethod]);

    return (
        <Modal title={`Subscribe to ${tier.name}`} onClose={onClose}>
            <div className="space-y-6">
                <div className="text-center">
                    <div className="flex justify-center mb-2">
                        <UpgradeIcon />
                    </div>
                    <p className="text-gray-400">You are about to subscribe to</p>
                    <h3 className="text-2xl font-bold text-white mt-1">{tier.name}</h3>
                    <p className="text-gray-300 mt-1 text-sm">{tier.description}</p>
                    {flags.tokenEconomy && tier.aprBoost > 0 && (
                        <p className="text-teal-400 font-semibold mt-1">
                            Includes a +{(tier.aprBoost * 100)}% Staking APR Boost
                        </p>
                    )}
                </div>

                <div>
                    <label className="text-sm font-semibold text-gray-400 block mb-2 text-center">
                        Payment Method
                    </label>
                    <div className="flex gap-2 p-1 bg-slate-900/50 rounded-lg">
                        {(Object.keys(tier.prices) as PaymentMethod[]).map(method => (
                            <PaymentButton
                                key={method}
                                method={method}
                                selected={paymentMethod === method}
                                onClick={() => isMethodAllowed(method) && setPaymentMethod(method)}
                                disabled={!isMethodAllowed(method)}
                                note={!isMethodAllowed(method) ? 'v0.2' : undefined}
                            />
                        ))}
                    </div>
                    {!flags.tokenEconomy && (
                        <p className="text-xs text-gray-500 text-center mt-2">
                            RTD &amp; XMR payment lanes activate at v0.2 token launch.
                        </p>
                    )}
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Cost</span>
                        <span className="font-semibold text-white">
                            {tier.prices[paymentMethod]} {paymentMethod} / month
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Your Balance</span>
                        <span className={`font-semibold ${hasEnoughFunds ? 'text-white' : 'text-red-400'}`}>
                            {currentBalance} {paymentMethod !== 'XMR' && paymentMethod}
                        </span>
                    </div>
                </div>

                {!hasEnoughFunds && (
                    <p className="text-sm text-center text-red-400">
                        You do not have enough {paymentMethod} to subscribe.
                    </p>
                )}

                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(tier, paymentMethod)}
                        disabled={!hasEnoughFunds}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SubscriptionModal;
