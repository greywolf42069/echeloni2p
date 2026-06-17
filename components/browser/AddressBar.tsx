import React, { useEffect, useState } from 'react';
import type { BrowserTab } from '../../hooks/useBrowserTabs.ts';
import { classifyUrl } from '../../hooks/useBrowserTabs.ts';
import { loadRecentHistory as loadHistory, loadAllBookmarks } from '../../hooks/browserStore.ts';

interface AddressBarProps {
    /** The active tab's current state — drives color + display value. */
    tab: BrowserTab;
    /** Trigger navigation in the active tab. */
    onSubmit(rawUrl: string): void;
    /** Toolbar slots (back/forward/refresh/star) rendered to the LEFT of the input. */
    leftSlot?: React.ReactNode;
    /** Toolbar slots rendered to the RIGHT of the input (bookmark star, more menu). */
    rightSlot?: React.ReactNode;
    /** Whether outproxy is configured/enabled. Drives the "clearnet without bridge" warning. */
    outproxyEnabled: boolean;
}

const KIND_BAR_COLOR = {
    blank: 'border-slate-600',
    eepsite: 'border-purple-500',
    clearnet: 'border-amber-500',
    search: 'border-orange-500',
    error: 'border-red-500',
} as const;

const KIND_PILL = {
    blank: { label: 'New tab', cls: 'bg-slate-700 text-slate-200' },
    eepsite: { label: 'Eepsite', cls: 'bg-purple-600/40 text-purple-100' },
    clearnet: { label: 'Clearnet via I2P', cls: 'bg-amber-600/40 text-amber-100' },
    search: { label: 'Search', cls: 'bg-orange-600/40 text-orange-100' },
    error: { label: 'Error', cls: 'bg-red-600/40 text-red-100' },
} as const;

const AddressBar: React.FC<AddressBarProps> = ({
    tab,
    onSubmit,
    leftSlot,
    rightSlot,
    outproxyEnabled,
}) => {
    const [draft, setDraft] = useState<string>('');
    const [isFocused, setIsFocused] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    useEffect(() => {
        const visible = tab.history[tab.historyIndex] ?? '';
        setDraft(visible === 'echelon:home' ? '' : visible);
    }, [tab.history, tab.historyIndex]);

    // Rich autocomplete: history + bookmarks (real browser behavior)
    useEffect(() => {
        if (!isFocused) {
            setSuggestions([]);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const [history, bookmarks] = await Promise.all([
                    loadHistory(15),
                    loadAllBookmarks()
                ]);

                const allCandidates = [
                    ...history.map(h => ({ url: h.url, type: 'history' as const })),
                    ...bookmarks.map(b => ({ url: b.url, type: 'bookmark' as const }))
                ];

                const filtered = allCandidates
                    .filter(item => 
                        item.url.toLowerCase().includes(draft.toLowerCase()) && 
                        item.url !== draft
                    )
                    .sort((a, b) => {
                        // Prioritize bookmarks slightly
                        if (a.type === 'bookmark' && b.type !== 'bookmark') return -1;
                        if (b.type === 'bookmark' && a.type !== 'bookmark') return 1;
                        return 0;
                    })
                    .slice(0, 6)
                    .map(item => item.url);

                if (!cancelled) setSuggestions(filtered);
            } catch {
                if (!cancelled) setSuggestions([]);
            }
        })();

        return () => { cancelled = true; };
    }, [draft, isFocused]);

    const draftKind = draft ? classifyUrl(draft) : tab.kind;
    const showClearnetWarning = draftKind === 'clearnet' && !outproxyEnabled;
    const borderClass = KIND_BAR_COLOR[draftKind];
    const pill = KIND_PILL[draftKind];

    const showClearButton = draft.length > 0 && isFocused;

    return (
        <div className="space-y-1">
            <form
                onSubmit={e => {
                    e.preventDefault();
                    if (draft.trim()) onSubmit(draft);
                }}
                className={`group flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-2xl border-2 ${borderClass} transition-all duration-200 shadow-sm ${isFocused ? 'ring-1 ring-purple-500/30' : ''}`}
            >
                {leftSlot}

                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                        type="text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="Search or type .i2p address"
                        aria-label="Address bar"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        className="flex-1 bg-transparent text-white placeholder:text-gray-500 px-1 py-0.5 outline-none font-mono text-[15px] tracking-[-0.2px]"
                    />

                    {showClearButton && (
                        <button
                            type="button"
                            onClick={() => setDraft('')}
                            className="p-1 text-gray-400 hover:text-white active:text-gray-300 transition-colors"
                            aria-label="Clear address"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <span
                    aria-hidden="true"
                    className={`hidden sm:inline-flex items-center px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[1px] rounded-full ${pill.cls} transition-colors`}
                >
                    {pill.label}
                </span>

                {rightSlot}
            </form>

            {showClearnetWarning && (
                <p className="text-xs text-red-300 flex items-center gap-1.5 pl-2" role="alert">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Clearnet without outproxy — enable the bridge in Outproxy Config.
                </p>
            )}

            {/* Suggestions + Favorites — proper mobile browser feel */}
            {isFocused && (
                <div className="ml-1 mr-1 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl text-sm z-50">
                    {suggestions.length > 0 ? (
                        suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                    onSubmit(suggestion);
                                    setSuggestions([]);
                                    setIsFocused(false);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-700 active:bg-slate-600 text-gray-200 border-b border-slate-700 last:border-b-0 flex items-center gap-2 truncate font-mono text-xs"
                            >
                                <span className="text-purple-400">→</span>
                                {suggestion}
                            </button>
                        ))
                    ) : draft.length === 0 ? (
                        <div className="px-4 py-3 text-[11px] text-gray-400 tracking-wide">
                            Search history &amp; favorites • Type an address
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};

export default AddressBar;
