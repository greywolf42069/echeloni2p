import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// Fix: Using explicit '.ts' extension to resolve module import ambiguity.
import { LEADERBOARD_DATA, EMISSION_CHART_DATA } from '../../data.ts';
import Card from '../ui/Card.tsx';
import BlockheightCard from '../BlockheightCard.tsx';
import UserEmissionStats from '../UserEmissionStats.tsx';
import type { UserData, ProofOfRelayVoucher } from '../../types';

interface EmissionsProps {
  userData: UserData;
  porVouchers: ProofOfRelayVoucher[];
  onClaimPorVouchers: () => void;
}

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


const Emissions: React.FC<EmissionsProps> = ({ userData, porVouchers, onClaimPorVouchers }) => {
  const unclaimedVouchers = porVouchers.filter(v => !v.claimed);
  const totalUnclaimedRewards = unclaimedVouchers.reduce((sum, v) => sum + v.reward, 0);

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-[400px] opacity-60 -z-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={EMISSION_CHART_DATA}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorEmission" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Tooltip
                contentStyle={{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
                    borderColor: '#4b5563',
                    color: '#e5e7eb'
                }}
                itemStyle={{ color: '#c7d2fe' }}
                labelStyle={{ color: '#9ca3af' }}
            />
            <Area type="monotone" dataKey="emission" stroke="#8884d8" fillOpacity={1} fill="url(#colorEmission)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-white">Emissions & Leaderboard</h1>

        <UserEmissionStats userData={userData} />

        <BlockheightCard />

        <Card>
          <h2 className="text-xl font-semibold text-white mb-4">Proof-of-Relay Vouchers</h2>
          <div className="p-4 bg-slate-900/50 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-400">Total Unclaimed Relay Rewards</p>
              <p className="text-3xl font-bold text-teal-400">{totalUnclaimedRewards.toFixed(2)} RTD</p>
            </div>
            <button 
              onClick={onClaimPorVouchers}
              disabled={unclaimedVouchers.length === 0}
              className="w-full sm:w-auto px-6 py-3 bg-teal-500 text-white font-semibold rounded-lg hover:bg-teal-600 transition disabled:bg-slate-700 disabled:cursor-not-allowed"
            >
              Claim All Vouchers
            </button>
          </div>
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-300 px-2">Recent Unclaimed Vouchers</h3>
            {unclaimedVouchers.length > 0 ? (
              unclaimedVouchers.slice(0, 3).map(voucher => (
                 <div key={voucher.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                        <div>
                            <p className="font-semibold text-white">Relay Voucher</p>
                            <p className="text-xs text-gray-500">{timeSince(voucher.timestamp)}</p>
                        </div>
                    </div>
                    <p className="font-semibold text-white">{voucher.reward.toFixed(2)} RTD</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-center text-gray-500 py-4">No new vouchers. Relay more data to earn!</p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-white mb-4">Data Relayer Leaderboard</h2>
          
          {/* Desktop Table View */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700 text-sm text-gray-400">
                  <th className="p-3">Rank</th>
                  <th className="p-3">Relayer</th>
                  <th className="p-3 text-right">Total Relayed (MB)</th>
                </tr>
              </thead>
              <tbody>
                {LEADERBOARD_DATA.map((relayer) => {
                  const isUser = relayer.rank === userData.rank;
                  return (
                    <tr key={relayer.rank} className={`border-b border-slate-800 transition-colors ${isUser ? 'bg-purple-500/10' : 'hover:bg-slate-800/50'}`}>
                      <td className={`p-3 font-bold text-lg ${isUser ? 'text-purple-400' : ''}`}>{relayer.rank}</td>
                      <td className="p-3 font-mono text-purple-400">{isUser ? 'You' : relayer.publicKey}</td>
                      <td className="p-3 text-right font-semibold">{relayer.total_relayed_mb.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {/* Mobile Card List View */}
          <div className="block md:hidden space-y-4">
            {LEADERBOARD_DATA.map((relayer) => {
               const isUser = relayer.rank === userData.rank;
               return (
                <div key={relayer.rank} className={`p-4 rounded-lg border flex items-center gap-4 ${isUser ? 'bg-purple-500/10 border-purple-500/30' : 'bg-slate-900/50 border-slate-700/50'}`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white ${isUser ? 'bg-purple-500' : 'bg-slate-700'}`}>
                    {relayer.rank}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm text-gray-400">Relayer</p>
                    <p className="font-mono text-purple-400 truncate">{isUser ? 'You' : relayer.publicKey}</p>
                    <p className="text-sm text-gray-400 mt-2">Total Relayed</p>
                    <p className="font-semibold text-white">{relayer.total_relayed_mb.toLocaleString()} MB</p>
                  </div>
                </div>
               )
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Emissions;