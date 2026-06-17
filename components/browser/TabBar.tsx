import React from 'react';
import type { BrowserTab } from '../../hooks/useBrowserTabs.ts';

interface TabBarProps {
    tabs: ReadonlyArray<BrowserTab>;
    activeTabId: number;
    onSwitch(id: number): void;
    onClose(id: number): void;
    onNewTab(): void;
}

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const KIND_COLOR: Record<BrowserTab['kind'], string> = {
    blank: 'bg-slate-700/30 border-slate-700/50',
    eepsite: 'bg-purple-500/10 border-purple-500/40',
    clearnet: 'bg-amber-500/10 border-amber-500/40',
    search: 'bg-orange-500/10 border-orange-500/40',
    error: 'bg-red-500/10 border-red-500/40',
};

const ACTIVE_KIND_COLOR: Record<BrowserTab['kind'], string> = {
    blank: 'bg-slate-700/70 border-slate-500',
    eepsite: 'bg-purple-500/30 border-purple-400',
    clearnet: 'bg-amber-500/30 border-amber-400',
    search: 'bg-orange-500/30 border-orange-400',
    error: 'bg-red-500/30 border-red-400',
};

function shortTitle(t: BrowserTab): string {
    if (t.title === 'New Tab' || t.title === 'echelon:home') return 'New Tab';
    return t.title.replace(/^https?:\/\//, '').slice(0, 28);
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onSwitch, onClose, onNewTab }) => {
    return (
        <div
            className="flex items-center gap-1.5 overflow-x-auto px-2 py-2 bg-slate-950/80 rounded-t-3xl border-b border-slate-700/30"
            role="tablist"
            aria-label="Browser tabs"
        >
            {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                const colorClasses = isActive ? ACTIVE_KIND_COLOR[tab.kind] : KIND_COLOR[tab.kind];
                return (
                    <div
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition flex-shrink-0 ${colorClasses}`}
                        onClick={() => onSwitch(tab.id)}
                        data-tab-id={tab.id}
                    >
                        {tab.status === 'loading' && (
                            <span
                                className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                                aria-label="loading"
                            />
                        )}
                        <span className={`truncate max-w-[10rem] ${isActive ? 'text-white' : 'text-gray-300'}`}>
                            {shortTitle(tab)}
                        </span>
                        <button
                            onClick={e => {
                                e.stopPropagation();
                                onClose(tab.id);
                            }}
                            aria-label={`Close ${shortTitle(tab)}`}
                            className="p-1 rounded hover:bg-slate-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                );
            })}
            <button
                onClick={onNewTab}
                aria-label="New tab"
                className="flex-shrink-0 p-2 rounded-md text-gray-400 hover:text-white hover:bg-slate-700 transition"
            >
                <PlusIcon />
            </button>
        </div>
    );
};

export default TabBar;
