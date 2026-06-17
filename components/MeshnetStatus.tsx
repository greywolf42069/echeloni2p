import React from 'react';
import Card from './ui/Card.tsx';
import type { I2pStats } from '../hooks/useI2pStats.ts';

const PeersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm-9 3a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);
const ThroughputIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
    </svg>
);
const TunnelIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c0-1.66 4.03-3 9-3s9 1.34 9 3M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3M3 12V6c0-1.66 4.03-3 9-3s9 1.34 9 3v6M3 18c0 1.66 4.03 3 9 3s9-1.34 9-3M3 18v-6" />
    </svg>
);

interface MeshnetStatusProps {
    stats: I2pStats;
}

function formatBps(bytesPerSec: number): string {
    if (!bytesPerSec || bytesPerSec < 1024) return `${bytesPerSec | 0} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KiB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MiB/s`;
}

function formatTotal(bytes: number): string {
    if (!bytes || bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

const MeshnetStatus: React.FC<MeshnetStatusProps> = ({ stats }) => {
    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Meshnet Status</h2>
                {stats.version && (
                    <span className="text-xs text-gray-400 font-mono">i2pd {stats.version}</span>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-slate-900/50 rounded-lg">
                    <div className="flex justify-center mb-2"><PeersIcon /></div>
                    <p className="text-3xl font-bold text-white">{stats.routers.toLocaleString()}</p>
                    <p className="text-sm text-gray-400">Known routers (netDB)</p>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg">
                    <div className="flex justify-center mb-2"><ThroughputIcon /></div>
                    <div className="text-base font-bold text-white flex justify-center items-center gap-3">
                        <div className="flex items-center gap-1" title="Outbound">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                            <span>{formatBps(stats.sentBps)}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Inbound">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                            <span>{formatBps(stats.receivedBps)}</span>
                        </div>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">Bandwidth (now)</p>
                    <p className="text-xs text-gray-500 mt-1">Transit: {formatBps(stats.transitBps)}</p>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg">
                    <div className="flex justify-center mb-2"><TunnelIcon /></div>
                    <p className="text-3xl font-bold text-white">
                        {(stats.tunnelsClient + stats.tunnelsTransit).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-400">Active tunnels</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {stats.tunnelsClient} client · {stats.tunnelsTransit} transit
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs text-gray-400">
                <div className="p-3 bg-slate-900/40 rounded">
                    <p className="text-[10px] uppercase tracking-wider">Network</p>
                    <p className="text-sm text-white font-semibold">{stats.networkStatus}</p>
                </div>
                <div className="p-3 bg-slate-900/40 rounded">
                    <p className="text-[10px] uppercase tracking-wider">Floodfills</p>
                    <p className="text-sm text-white font-semibold">{stats.floodfills.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-900/40 rounded">
                    <p className="text-[10px] uppercase tracking-wider">Total received</p>
                    <p className="text-sm text-white font-semibold">{formatTotal(stats.totalReceivedBytes)}</p>
                </div>
                <div className="p-3 bg-slate-900/40 rounded">
                    <p className="text-[10px] uppercase tracking-wider">Total transit</p>
                    <p className="text-sm text-white font-semibold">{formatTotal(stats.totalTransitBytes)}</p>
                </div>
            </div>
        </Card>
    );
};

export default MeshnetStatus;
