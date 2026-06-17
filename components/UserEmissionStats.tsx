import React, { useMemo } from 'react';
import Card from './ui/Card.tsx';
import type { UserData } from '../types';
import { LEADERBOARD_DATA } from '../data';

interface UserEmissionStatsProps {
    userData: UserData;
}

const ChartBarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
const CurrencyDollarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9.75 9.75 0 1011.036-9.75.75.75 0 00-1.285-.97A6.75 6.75 0 0012 12.75h-1.5a.75.75 0 00-.75.75v3.75a.75.75 0 00.75.75h7.5a.75.75 0 00.75-.75v-3.75a.75.75 0 00-.75-.75h-1.5m-1.5-1.5a.75.75 0 00-1.5 0v3a.75.75 0 001.5 0v-3z" /></svg>;

const UserEmissionStats: React.FC<UserEmissionStatsProps> = ({ userData }) => {
    const ESTIMATED_RTD_PER_MB = 0.005;

    const { progress, nextRankData } = useMemo(() => {
        const userRank = userData.rank;
        if (userRank <= 1) {
            return { progress: 100, nextRankData: null };
        }
        
        const nextRank = userRank - 1;
        const nextRanker = LEADERBOARD_DATA.find(r => r.rank === nextRank);
        const userRanker = LEADERBOARD_DATA.find(r => r.rank === userRank);
        
        if (!nextRanker || !userRanker) {
            return { progress: 0, nextRankData: null };
        }

        const userRelayed = userData.dataRelayed;
        const currentRankDataNeeded = userRanker.total_relayed_mb;
        const nextRankDataNeeded = nextRanker.total_relayed_mb;
        
        const progressInTier = userRelayed - currentRankDataNeeded;
        const tierTotal = nextRankDataNeeded - currentRankDataNeeded;
        
        if (tierTotal <= 0) return { progress: 100, nextRankData: nextRanker };

        return {
            progress: Math.min(100, Math.max(0, (progressInTier / tierTotal) * 100)),
            nextRankData: nextRanker,
        };

    }, [userData]);

    return (
        <Card>
            <h2 className="text-xl font-semibold text-white mb-4">Your Contribution</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Data Relayed */}
                <div className="p-4 bg-slate-900/50 rounded-lg flex items-start gap-4">
                    <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><ChartBarIcon/></div>
                    <div>
                        <p className="text-sm text-gray-400">Data Relayed</p>
                        <p className="text-2xl font-bold text-white mt-1">{userData.dataRelayed.toLocaleString(undefined, { maximumFractionDigits: 0 })} MB</p>
                    </div>
                </div>

                {/* Estimated Earnings */}
                <div className="p-4 bg-slate-900/50 rounded-lg flex items-start gap-4">
                    <div className="p-2 bg-teal-500/10 rounded-lg text-teal-400"><CurrencyDollarIcon/></div>
                    <div>
                        <p className="text-sm text-gray-400">Estimated Earnings</p>
                        <p className="text-2xl font-bold text-teal-400 mt-1">{(userData.dataRelayed * ESTIMATED_RTD_PER_MB).toLocaleString(undefined, { maximumFractionDigits: 2 })} RTD</p>
                    </div>
                </div>

                {/* Leaderboard Rank */}
                <div className="p-4 bg-slate-900/50 rounded-lg flex items-start gap-4">
                    <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-400"><TrophyIcon/></div>
                    <div>
                        <p className="text-sm text-gray-400">Leaderboard Rank</p>
                        <p className="text-2xl font-bold text-white mt-1">#{userData.rank}</p>
                    </div>
                </div>
            </div>
            
            {nextRankData && (
                <div className="mt-6">
                    <div className="flex justify-between items-baseline mb-1 text-sm">
                        <span className="font-semibold text-gray-300">Progress to Rank #{nextRankData.rank}</span>
                        <span className="text-gray-400">{nextRankData.total_relayed_mb.toLocaleString()} MB needed</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                        <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default UserEmissionStats;