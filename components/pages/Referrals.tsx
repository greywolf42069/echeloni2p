

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Card from '../ui/Card.tsx';
// Fix: Using explicit '.ts' extension to resolve module import ambiguity.
import { REFERRAL_DATA } from '../../data.ts';

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

const Referrals: React.FC = () => {
    const { publicKey } = useWallet();
    const [copied, setCopied] = useState(false);
    
    const displayAddress = publicKey ? publicKey.toBase58() : 'ECHL...pW4a';
    const referralLink = `https://echelon.app/join?ref=${displayAddress}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-white">Referral Program</h1>
            
            <Card className="text-center">
                <h2 className="text-xl font-semibold text-purple-300 mb-2">Share & Earn Together</h2>
                <p className="text-gray-400 max-w-2xl mx-auto">Invite friends to join the Echelon meshnet and earn a percentage of their staking rewards forever. The more you refer, the more you earn!</p>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="text-center">
                    <p className="text-sm text-gray-400">Successful Referrals</p>
                    <p className="text-3xl font-bold text-white mt-1">4</p>
                </Card>
                 <Card className="text-center">
                    <p className="text-sm text-gray-400">Total Referral Earnings</p>
                    <p className="text-3xl font-bold text-teal-400 mt-1">175.00 RTD</p>
                </Card>
                 <Card className="text-center">
                    <p className="text-sm text-gray-400">Your Commission</p>
                    <p className="text-3xl font-bold text-white mt-1">10%</p>
                </Card>
            </div>

            <Card>
                <h2 className="text-xl font-semibold text-white mb-4">Your Unique Referral Link</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        readOnly
                        value={referralLink}
                        className="w-full bg-slate-700 text-gray-300 p-3 rounded-lg border border-slate-600 font-mono"
                    />
                    <button 
                        onClick={handleCopy}
                        className={`w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition flex items-center justify-center gap-2 ${copied ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-700'}`}
                    >
                        {copied ? <CheckIcon/> : <CopyIcon/>}
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
            </Card>

            <Card>
                <h2 className="text-xl font-semibold text-white mb-4">Referral History</h2>
                
                {/* Desktop Table View */}
                <div className="overflow-x-auto hidden md:block">
                    <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-700 text-sm text-gray-400">
                        <th className="p-3">User</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Reward (RTD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {REFERRAL_DATA.map((ref, index) => (
                        <tr key={index} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-mono text-purple-400">{ref.publicKey}</td>
                            <td className="p-3 text-gray-300">{ref.date}</td>
                            <td className="p-3">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ref.status === 'Completed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                    {ref.status}
                                </span>
                            </td>
                            <td className="p-3 text-right font-semibold text-teal-400">{ref.reward.toFixed(2)}</td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>

                {/* Mobile Card List View */}
                <div className="block md:hidden space-y-4">
                    {REFERRAL_DATA.map((ref, index) => (
                        <div key={index} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-400">User</p>
                                    <p className="font-mono text-purple-400 truncate">{ref.publicKey}</p>
                                </div>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ref.status === 'Completed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                    {ref.status}
                                </span>
                            </div>
                            <div className="mt-3 flex justify-between items-end">
                                <div>
                                    <p className="text-sm text-gray-400">Date</p>
                                    <p className="font-semibold text-white">{ref.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-400">Reward</p>
                                    <p className="font-semibold text-teal-400">{ref.reward.toFixed(2)} RTD</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default Referrals;