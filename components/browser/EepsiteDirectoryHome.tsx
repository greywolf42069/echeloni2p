import React, { useEffect, useState } from 'react';
import {
    type Bookmark,
    loadAllBookmarks,
    seedDefaultBookmarksIfEmpty,
} from '../../hooks/browserStore.ts';
import type { Eepsite } from '../../types';

interface EepsiteDirectoryHomeProps {
    /** Click handler — receives the URL to navigate to. */
    onNavigate(url: string): void;
    /** The user's own published eepsites — surfaced at the top of the directory. */
    ownEepsites?: Eepsite[];
}

/**
 * The new-tab homepage. Replaces the bare blank-iframe state.
 *
 * Layout:
 *   1. Greeting
 *   2. Search input that submits to onNavigate (delegates to notbob.i2p)
 *   3. "Your eepsites" row (only when user has hosted any)
 *   4. Bookmarks grouped by category
 */
const EepsiteDirectoryHome: React.FC<EepsiteDirectoryHomeProps> = ({ onNavigate, ownEepsites = [] }) => {
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [searchDraft, setSearchDraft] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await seedDefaultBookmarksIfEmpty();
            if (cancelled) return;
            const loaded = await loadAllBookmarks();
            if (cancelled) return;
            setBookmarks(loaded);
        })();
        return () => { cancelled = true; };
    }, []);

    const grouped = groupByCategory(bookmarks);
    const ownOnline = ownEepsites.filter(e => e.status === 'Online');

    return (
        <div data-page="eepsite-directory" className="space-y-8 py-4">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Where do you want to go?</h2>
                <p className="text-sm text-gray-400 mt-1">
                    Type an <code className="text-purple-300">.i2p</code> address, search the I2P network, or pick a destination below.
                </p>
            </div>

            <form
                onSubmit={e => {
                    e.preventDefault();
                    if (searchDraft.trim()) onNavigate(searchDraft);
                }}
                className="max-w-xl mx-auto"
            >
                <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-xl border border-slate-700 focus-within:border-purple-500 transition-colors">
                    <SearchIcon />
                    <input
                        type="text"
                        value={searchDraft}
                        onChange={e => setSearchDraft(e.target.value)}
                        placeholder="Search the I2P network or type an eepsite address"
                        className="flex-1 bg-transparent text-white outline-none text-sm"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                    />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    Searches go through <code className="text-purple-300">notbob.i2p</code>.
                </p>
            </form>

            {ownOnline.length > 0 && (
                <Section title="Your published eepsites">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {ownOnline.map(site => (
                            <Tile
                                key={site.id}
                                title={site.name}
                                subtitle="Your eepsite · Online"
                                accent="emerald"
                                onClick={() => onNavigate(site.name)}
                            />
                        ))}
                    </div>
                </Section>
            )}

            {Object.entries(grouped).map(([category, items]) => (
                <Section key={category} title={category}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {items.map(b => (
                            <Tile
                                key={b.id}
                                title={b.title}
                                subtitle={b.url}
                                accent="purple"
                                onClick={() => onNavigate(b.url)}
                            />
                        ))}
                    </div>
                </Section>
            ))}
        </div>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section>
        <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">{title}</h3>
        {children}
    </section>
);

const ACCENT_CLASSES = {
    purple: 'border-slate-700 hover:border-purple-500 hover:bg-purple-500/5',
    emerald: 'border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/5',
} as const;

const Tile: React.FC<{
    title: string;
    subtitle: string;
    accent: keyof typeof ACCENT_CLASSES;
    onClick: () => void;
}> = ({ title, subtitle, accent, onClick }) => (
    <button
        onClick={onClick}
        className={`text-left p-3 bg-slate-800/70 border-2 rounded-lg transition-all ${ACCENT_CLASSES[accent]}`}
    >
        <p className="font-semibold text-white truncate">{title}</p>
        <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{subtitle}</p>
    </button>
);

const SearchIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

function groupByCategory(bookmarks: Bookmark[]): Record<string, Bookmark[]> {
    const groups: Record<string, Bookmark[]> = {};
    for (const b of bookmarks) {
        const cat = b.category || 'Bookmarks';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(b);
    }
    // Stable order: I2P first, then alphabetical.
    const ordered: Record<string, Bookmark[]> = {};
    const keys = Object.keys(groups).sort((a, b) => {
        if (a === 'I2P') return -1;
        if (b === 'I2P') return 1;
        return a.localeCompare(b);
    });
    for (const k of keys) ordered[k] = groups[k];
    return ordered;
}

export default EepsiteDirectoryHome;
