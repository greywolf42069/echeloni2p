import React from 'react';
import Card from './ui/Card.tsx';
import type { BlockEvent } from '../hooks/filterEventsClient.ts';

const TrackerIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);

function timeSince(ts: number): string {
    const seconds = Math.floor(Date.now() / 1000 - ts);
    if (seconds < 1) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

interface ThreatLogCardProps {
    /** Most recent first OR oldest first — we sort newest first internally. */
    events: BlockEvent[];
    /** Optional error from the upstream poller (daemon unreachable). */
    error?: string | null;
    /** Total events seen by the daemon (i.e. across the buffer cap). */
    headSeq?: number;
}

const ThreatLogCard: React.FC<ThreatLogCardProps> = ({ events, error, headSeq }) => {
    const newestFirst = [...events].sort((a, b) => b.seq - a.seq).slice(0, 8);

    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Live Threat Feed</h2>
                {typeof headSeq === 'number' && headSeq > 0 && (
                    <span className="text-xs text-gray-500">{headSeq.toLocaleString()} blocked since startup</span>
                )}
            </div>

            {error && (
                <div className="mb-3 p-3 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                    {error}
                </div>
            )}

            <div className="space-y-2">
                {newestFirst.length > 0 ? (
                    newestFirst.map(evt => (
                        <div key={evt.seq} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                            <div className="flex items-center gap-3 min-w-0">
                                <TrackerIcon />
                                <div className="min-w-0">
                                    <p className="font-mono text-sm text-white truncate">{evt.domain}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {evt.list_source} · {evt.request_kind.toUpperCase()}
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 flex-shrink-0 ml-3">{timeSince(evt.timestamp)}</p>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <p>No threats blocked recently.</p>
                        <p className="text-sm mt-1">
                            {error
                                ? 'Sync daemon unreachable — see Termux quickstart.'
                                : 'Subscribe to a blocklist + run the filter proxy to start logging events.'}
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ThreatLogCard;
