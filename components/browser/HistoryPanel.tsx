import React, { useEffect, useState } from 'react';
import {
    type HistoryEntry,
    clearAllHistory,
    loadRecentHistory,
} from '../../hooks/browserStore.ts';

interface HistoryPanelProps {
    /** When user clicks an entry, navigate to it. */
    onNavigate(url: string): void;
    /** Close the panel. */
    onClose(): void;
}

const ClockIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const TrashIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
);

function relTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / 60 / 60_000)}h ago`;
    return `${Math.floor(diff / 24 / 60 / 60_000)}d ago`;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ onNavigate, onClose }) => {
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const all = await loadRecentHistory(100);
            if (cancelled) return;
            setEntries(all);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const handleClear = async () => {
        await clearAllHistory();
        setEntries([]);
    };

    return (
        <div
            data-panel="history"
            className="fixed inset-0 sm:inset-auto sm:right-4 sm:top-20 sm:bottom-4 sm:w-96 z-30 bg-slate-900 border border-slate-700 rounded-lg shadow-xl flex flex-col"
            role="dialog"
            aria-label="Browser history"
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <ClockIcon />
                    <h2 className="font-semibold text-white">History</h2>
                </div>
                <div className="flex items-center gap-1">
                    {entries.length > 0 && (
                        <button
                            onClick={handleClear}
                            aria-label="Clear all history"
                            title="Clear all history"
                            className="p-2 rounded text-gray-400 hover:text-red-300 hover:bg-slate-800 transition"
                        >
                            <TrashIcon />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        aria-label="Close history panel"
                        className="px-2 py-1 text-sm text-gray-300 hover:text-white"
                    >
                        Close
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <p className="p-4 text-sm text-gray-400">Loading…</p>
                )}
                {!loading && entries.length === 0 && (
                    <div className="p-6 text-center text-sm text-gray-400">
                        <p>No history yet.</p>
                        <p className="mt-2 text-xs text-gray-500">
                            History only saves when the "Save browsing history" setting is on.
                        </p>
                    </div>
                )}
                {!loading && entries.length > 0 && (
                    <ul className="divide-y divide-slate-800">
                        {entries.map(e => (
                            <li key={e.id}>
                                <button
                                    onClick={() => { onNavigate(e.url); onClose(); }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-800 transition"
                                >
                                    <p className="text-sm text-white truncate">{e.title || e.url}</p>
                                    <p className="text-xs text-gray-400 truncate font-mono">{e.url}</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">{relTime(e.timestamp)}</p>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default HistoryPanel;
