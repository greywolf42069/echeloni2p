import React, { useState } from 'react';
import Card from '../ui/Card';
import type { Bounty, Achievement } from '../../types';

interface BountiesProps {
    bounties: Bounty[];
    achievements: Achievement[];
    onClaimBounty: (bountyId: string) => void;
}

const BountyCard: React.FC<{ bounty: Bounty; onClaim: () => void; }> = ({ bounty, onClaim }) => {
    const progress = Math.min((bounty.currentProgress / bounty.goal) * 100, 100);
    const canClaim = bounty.isComplete && !bounty.isClaimed;

    const typeColors = {
        daily: 'border-teal-500/50',
        weekly: 'border-purple-500/50',
        special: 'border-yellow-500/50',
    };

    return (
        <div className={`p-4 bg-slate-800/50 border-l-4 ${typeColors[bounty.type]} rounded-r-lg`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-white">{bounty.title}</h3>
                        <p className="text-lg font-bold text-teal-400">+{bounty.reward} RTD</p>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{bounty.description}</p>
                    <div className="mt-3">
                        <div className="flex justify-between items-baseline mb-1 text-xs">
                            <span className="font-semibold text-gray-300">Progress</span>
                            <span className="text-gray-400">{bounty.currentProgress.toLocaleString(undefined, {maximumFractionDigits: 0})} / {bounty.goal.toLocaleString()} {bounty.metric}</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2.5">
                            <div className="bg-purple-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClaim}
                    disabled={!canClaim}
                    className="w-full sm:w-auto px-6 py-3 font-semibold rounded-lg transition disabled:cursor-not-allowed bg-teal-500 text-white hover:bg-teal-600 disabled:bg-slate-700 disabled:text-gray-500"
                >
                    {bounty.isClaimed ? 'Claimed' : canClaim ? 'Claim' : 'In Progress'}
                </button>
            </div>
        </div>
    );
};

const AchievementCard: React.FC<{ achievement: Achievement }> = ({ achievement }) => {
    return (
        <Card className={`text-center transition-all duration-300 ${achievement.isUnlocked ? 'bg-slate-700/50 border-purple-500/30' : 'opacity-60'}`}>
            <p className="text-4xl mb-3">{achievement.icon}</p>
            <h3 className="font-bold text-white">{achievement.title}</h3>
            <p className="text-sm text-gray-400 mt-1 h-10">{achievement.description}</p>
            <div className={`mt-3 px-3 py-1 inline-block rounded-full text-sm font-semibold ${achievement.isUnlocked ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-600/50 text-gray-400'}`}>
                {achievement.isUnlocked ? `+${achievement.reward} RTD` : 'Locked'}
            </div>
        </Card>
    );
};


const Bounties: React.FC<BountiesProps> = ({ bounties, achievements, onClaimBounty }) => {
    const [activeTab, setActiveTab] = useState<'bounties' | 'achievements'>('bounties');

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-white">Bounties & Achievements</h1>
            
            <Card>
                <h2 className="text-xl font-semibold text-purple-300 mb-2">Complete Tasks, Unlock Rewards</h2>
                <p className="text-gray-400 max-w-3xl">Engage with the Echelon network to complete bounties for immediate RTD rewards, and unlock achievements to celebrate your long-term contributions.</p>
            </Card>

            <div>
                <div className="border-b border-slate-700 mb-6">
                    <nav className="flex space-x-4">
                        <button onClick={() => setActiveTab('bounties')} className={`px-3 py-2 font-semibold text-sm rounded-t-lg transition ${activeTab === 'bounties' ? 'text-white border-b-2 border-purple-500' : 'text-gray-400 hover:text-white'}`}>
                            Active Bounties
                        </button>
                        <button onClick={() => setActiveTab('achievements')} className={`px-3 py-2 font-semibold text-sm rounded-t-lg transition ${activeTab === 'achievements' ? 'text-white border-b-2 border-purple-500' : 'text-gray-400 hover:text-white'}`}>
                            Achievements
                        </button>
                    </nav>
                </div>

                {activeTab === 'bounties' && (
                    <div className="space-y-4 animate-fade-in">
                        {bounties.map(bounty => (
                            <BountyCard key={bounty.id} bounty={bounty} onClaim={() => onClaimBounty(bounty.id)} />
                        ))}
                    </div>
                )}

                {activeTab === 'achievements' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
                        {achievements.map(ach => (
                            <AchievementCard key={ach.id} achievement={ach} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Bounties;