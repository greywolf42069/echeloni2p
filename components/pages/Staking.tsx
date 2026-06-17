import React, { useState, useMemo } from 'react';
import Card from '../ui/Card.tsx';
import type { UserData, StakingEvent } from '../../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// Fix: Using explicit '.ts' extension to resolve module import ambiguity.
import { TOTAL_RTD_SUPPLY, TOTAL_STAKED_RTD, STAKED_SUPPLY_HISTORY_DATA, APR_DECAY_DATA, SUBSCRIPTION_TIERS } from '../../data.ts';

// -- Icons --
const StakeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;
const UnstakeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" /></svg>;
const ClaimIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2 .895-2 3-2zm0 0c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 12c0-4.97-4.03-9-9-9S2.25 7.03 2.25 12c0 2.33.89 4.49 2.34 6.16l-1.03 1.03c-.31.31-.09.85.35.85h14.68c.44 0 .66-.54.35-.85l-1.03-1.03A8.953 8.953 0 0020.25 12z" /></svg>;
const InfoIcon = ({ className = "h-4 w-4" }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;


const timeSince = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)}y ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)}mo ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)}d ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)}h ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)}m ago`;
    return `${Math.floor(seconds)}s ago`;
};

interface StakingProps {
    userData: UserData;
    stakingHistory: StakingEvent[];
    currentApr: number;
    onStake: (amount: number) => void;
    onUnstake: (amount: number) => void;
    onClaimRewards: () => void;
}

const Staking: React.FC<StakingProps> = ({ userData, stakingHistory, currentApr, onStake, onUnstake, onClaimRewards }) => {
    const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake');
    const [amount, setAmount] = useState('');

    const userSubTier = useMemo(() => {
        return SUBSCRIPTION_TIERS.find(t => t.name === userData.subscription);
    }, [userData.subscription]);

    const aprBoost = userSubTier ? userSubTier.aprBoost : 0;

    const combinedChartData = useMemo(() => {
        // Helper function for linear interpolation
        const interpolate = (day: number, data: typeof STAKED_SUPPLY_HISTORY_DATA) => {
            // Find the two points to interpolate between
            const p1 = data.slice().reverse().find(p => p.day <= day);
            const p2 = data.find(p => p.day >= day);
    
            if (!p1) return data[0]?.stakedPercentage ?? 0;
            if (!p2) return data[data.length - 1]?.stakedPercentage ?? 0;
            if (p1.day === p2.day) return p1.stakedPercentage;
    
            // Perform linear interpolation
            const dayRange = p2.day - p1.day;
            const percentageRange = p2.stakedPercentage - p1.stakedPercentage;
            const dayOffset = day - p1.day;
            
            return p1.stakedPercentage + (percentageRange * (dayOffset / dayRange));
        };
    
        return APR_DECAY_DATA.map(aprDataPoint => {
            return {
                day: aprDataPoint.day,
                apr: aprDataPoint.apr,
                stakedPercentage: parseFloat(interpolate(aprDataPoint.day, STAKED_SUPPLY_HISTORY_DATA).toFixed(2))
            };
        });
    }, []);


    const handleStakingSubmit = () => {
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            if (activeTab === 'stake') onStake(0); else onUnstake(0);
            return;
        }
        if (activeTab === 'stake') {
            onStake(numericAmount);
        } else {
            onUnstake(numericAmount);
        }
        setAmount('');
    };
    
    const balanceForTab = activeTab === 'stake' ? userData.rtdBalance : userData.staked;
    
    const EventIcon: React.FC<{ type: StakingEvent['type'] }> = ({ type }) => {
        const config = {
            'Stake': { icon: <StakeIcon />, color: 'bg-green-500/10 text-green-400' },
            'Unstake': { icon: <UnstakeIcon />, color: 'bg-red-500/10 text-red-400' },
            'Claim': { icon: <ClaimIcon />, color: 'bg-teal-500/10 text-teal-400' },
        };
        const { icon, color } = config[type];
        return <div className={`p-2 rounded-full ${color}`}>{icon}</div>;
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-white">RTD Staking</h1>

            <Card>
                <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                    <div className="flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">Secure the Meshnet, Earn Rewards</h2>
                        <p className="text-gray-400 mt-1 text-sm">Staking RTD is critical for the Echelon meshnet's health. By staking, you help provide Sybil resistance, ensuring participants are invested in the ecosystem's success. A higher network stake percentage strengthens the security for all users.</p>
                    </div>
                </div>
            </Card>
            
            <Card className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="space-y-4">
                     <div>
                        <p className="text-sm text-gray-400">Total Staked</p>
                        <p className="text-4xl font-bold text-white mt-1">{userData.staked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-2xl text-gray-400">RTD</span></p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-900/50 rounded-lg">
                            <p className="text-xs text-gray-400">Accrued Rewards</p>
                            <p className="text-lg font-bold text-teal-400">{userData.accruedStakingRewards.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</p>
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded-lg">
                            <p className="text-xs text-gray-400">Subscription Boost</p>
                            <p className="text-lg font-bold text-teal-400">+{aprBoost * 100}%</p>
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded-lg">
                           <div className="flex items-center justify-between text-xs text-gray-400">
                               <span>Current APR</span>
                               <span title="The APR is dynamic and adjusts based on the percentage of the total RTD supply staked by all users.">
                                   <InfoIcon />
                               </span>
                           </div>
                           <p className="text-lg font-bold text-white">~{currentApr.toFixed(1)}%</p>
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded-lg">
                            <p className="text-xs text-gray-400">Network Staked</p>
                             <p className="text-lg font-bold text-purple-400">{((TOTAL_STAKED_RTD / TOTAL_RTD_SUPPLY) * 100).toFixed(2)}%</p>
                        </div>
                    </div>
                     <button 
                        onClick={onClaimRewards}
                        disabled={userData.accruedStakingRewards <= 0}
                        className="w-full bg-teal-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-teal-600 transition disabled:bg-slate-700 disabled:cursor-not-allowed"
                     >
                        Claim Rewards
                    </button>
                </div>
                 <div className="h-56 md:h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={combinedChartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                            <defs>
                                <linearGradient id="aprChartFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                                </linearGradient>
                                 <linearGradient id="stakedChartFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="day" hide={true} />
                            <YAxis yAxisId="left" domain={['dataMin', 'dataMax']} hide={true} />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} hide={true} />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
                                    borderColor: '#334155',
                                }}
                                labelStyle={{ color: '#d1d5db' }}
                                labelFormatter={(label) => `Day ${label}`}
                                formatter={(value, name) => {
                                    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                                    if (name === 'apr') return [`${numValue.toFixed(1)}%`, 'APR'];
                                    if (name === 'stakedPercentage') return [`${numValue.toFixed(1)}%`, 'Network Staked'];
                                    return [value, name];
                                }}
                                itemStyle={{ fontWeight: 'bold' }}
                            />
                            <Area yAxisId="left" type="monotone" dataKey="apr" name="apr" stroke="#22d3ee" strokeWidth={2} fill="url(#aprChartFill)" />
                            <Area yAxisId="right" type="monotone" dataKey="stakedPercentage" name="stakedPercentage" stroke="#a855f7" strokeWidth={2} fill="url(#stakedChartFill)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2">
                    <Card className="h-full">
                        <h2 className="text-xl font-semibold text-white mb-4">Manage Stake</h2>
                        <div className="flex mb-4 border border-slate-700 rounded-lg overflow-hidden">
                            <button onClick={() => { setActiveTab('stake'); setAmount(''); }} className={`flex-1 p-3 font-semibold transition ${activeTab === 'stake' ? 'bg-purple-600' : 'bg-slate-800 hover:bg-slate-700'}`}>Stake</button>
                            <button onClick={() => { setActiveTab('unstake'); setAmount(''); }} className={`flex-1 p-3 font-semibold transition ${activeTab === 'unstake' ? 'bg-purple-600' : 'bg-slate-800 hover:bg-slate-700'}`}>Unstake</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-400 block mb-1">Amount to {activeTab}</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500"
                                />
                                <div className="text-xs text-right mt-1 text-gray-400">
                                    Balance: {balanceForTab.toLocaleString()} RTD
                                    <button
                                        onClick={() => setAmount(balanceForTab.toString())}
                                        className="ml-2 font-semibold text-purple-400 hover:text-purple-300"
                                    >
                                        Max
                                    </button>
                                </div>
                            </div>
                            <button 
                                onClick={handleStakingSubmit}
                                className="w-full bg-purple-600 text-white font-semibold py-3 rounded-lg hover:bg-purple-700 transition text-lg capitalize"
                            >
                                {activeTab} RTD
                            </button>
                        </div>
                    </Card>
                </div>
                <div className="lg:col-span-3">
                    <Card className="h-full">
                        <h2 className="text-xl font-semibold text-white mb-4">Staking History</h2>
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-2 -mr-2">
                            {stakingHistory.map((event, index) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <EventIcon type={event.type} />
                                        <div>
                                            <p className="font-semibold text-white">{event.type}</p>
                                            <p className="text-xs text-gray-500">{timeSince(event.date)}</p>
                                        </div>
                                    </div>
                                    <p className="font-semibold text-white">{event.amount.toLocaleString(undefined, {maximumFractionDigits: 4})} RTD</p>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Staking;