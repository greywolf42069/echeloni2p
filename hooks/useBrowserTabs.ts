import { useCallback, useEffect, useState } from 'react';

/**
 * Per-tab navigation state. A tab has:
 *   - id: stable, monotonically increasing
 *   - history: an array of URLs visited in this tab
 *   - historyIndex: pointer into `history` (last entry by default)
 *   - title: user-visible label
 *   - kind: routing classification (eepsite / clearnet / search / blank)
 *   - status: load state for spinner + error rendering
 */
export type TabKind = 'blank' | 'eepsite' | 'clearnet' | 'search' | 'error';
export type TabStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface BrowserTab {
    id: number;
    title: string;
    history: string[];
    historyIndex: number;
    kind: TabKind;
    status: TabStatus;
    /**
     * For error tabs, the reason category. Lets the UI render the
     * right SmartErrorPage without re-deriving it.
     */
    errorReason?:
        | 'no-i2pd'
        | 'no-outproxy'
        | 'tunnel-timeout'
        | 'dns-failed'
        | 'frame-blocked'
        | 'rate-limited'
        | 'unknown';
    /** Optional message shown below the error reason. */
    errorMessage?: string;
}

export interface BrowserTabsApi {
    tabs: ReadonlyArray<BrowserTab>;
    activeTabId: number;
    activeTab: BrowserTab;
    /** Open a new tab (defaults to the blank/directory homepage). */
    openTab(initialUrl?: string): number;
    /** Close a tab; if the active tab is closed, a sibling becomes active. */
    closeTab(id: number): void;
    /** Switch focus to a tab. */
    switchTab(id: number): void;
    /** Navigate the active tab to a URL. Replaces forward history. */
    navigate(rawUrl: string): void;
    /** Move the active tab one step back in history. No-op if at start. */
    goBack(): void;
    /** Move the active tab one step forward in history. No-op if at end. */
    goForward(): void;
    /** True if `goBack` would do anything. */
    canGoBack: boolean;
    /** True if `goForward` would do anything. */
    canGoForward: boolean;
    /** Set the loaded title for the active tab (e.g. from iframe load). */
    setActiveTabTitle(title: string): void;
    /** Mark the active tab as having loaded successfully. */
    markActiveTabLoaded(title?: string): void;
    /** Mark the active tab as failed with a reason. */
    markActiveTabError(reason: BrowserTab['errorReason'], message?: string): void;
}

const DEFAULT_BLANK_TITLE = 'New Tab';
const MAX_TABS = 12; // sanity cap; the UI doesn't need to show more

/**
 * Classify a navigation target into one of our tab kinds without
 * touching the network. Pure function; safe to use anywhere.
 *
 * Rules:
 *   - empty / 'about:blank'        → 'blank'
 *   - ends with .i2p OR contains .i2p path
 *                                  → 'eepsite'
 *   - http:// or https:// with a host that isn't .i2p
 *                                  → 'clearnet'
 *   - anything else (free text)    → 'search'
 */
export function classifyUrl(raw: string): TabKind {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed === 'about:blank' || trimmed === 'echelon:home') {
        return 'blank';
    }

    // strip scheme prefix for the heuristic match
    const stripped = trimmed.replace(/^https?:\/\//, '');

    // i2p detection: any host segment ending in `.i2p` or `.b32.i2p`
    if (/\.i2p(?:\b|\/|:)/.test(stripped) || stripped.endsWith('.i2p')) {
        return 'eepsite';
    }

    // explicit http/https → clearnet (we already stripped the scheme,
    // so the original value told us)
    if (/^https?:\/\//.test(trimmed)) {
        return 'clearnet';
    }

    // bare host with TLD → clearnet
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+/.test(stripped) && stripped.includes('.')) {
        return 'clearnet';
    }

    return 'search';
}

function makeBlankTab(id: number): BrowserTab {
    return {
        id,
        title: DEFAULT_BLANK_TITLE,
        history: ['echelon:home'],
        historyIndex: 0,
        kind: 'blank',
        status: 'idle',
    };
}

function tabFromInitialUrl(id: number, rawUrl: string): BrowserTab {
    const url = rawUrl.trim();
    if (!url) return makeBlankTab(id);
    return {
        id,
        title: url,
        history: [url],
        historyIndex: 0,
        kind: classifyUrl(url),
        status: 'loading',
    };
}

/**
 * useBrowserTabs — React hook owning the tab list, active tab id,
 * per-tab history, and helpers to mutate them. The hook is purely
 * in-memory; callers can layer persistence on top via useEffect
 * (Phase J.13 will do this).
 */
export function useBrowserTabs(initialUrl: string = ''): BrowserTabsApi {
    const [nextId, setNextId] = useState<number>(2);
    const [tabs, setTabs] = useState<BrowserTab[]>(() => [
        initialUrl ? tabFromInitialUrl(1, initialUrl) : makeBlankTab(1),
    ]);
    const [activeTabId, setActiveTabId] = useState<number>(1);

    // Defensive: if active tab disappears (closed), fall back to the
    // first remaining tab. Should never happen with the API but cheap
    // safety net.
    useEffect(() => {
        if (!tabs.find(t => t.id === activeTabId) && tabs.length > 0) {
            setActiveTabId(tabs[0].id);
        }
    }, [tabs, activeTabId]);

    const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

    const openTab = useCallback(
        (urlArg?: string): number => {
            const id = nextId;
            const url = urlArg?.trim() ?? '';
            setTabs(prev => {
                if (prev.length >= MAX_TABS) return prev;
                return [...prev, url ? tabFromInitialUrl(id, url) : makeBlankTab(id)];
            });
            setNextId(n => n + 1);
            setActiveTabId(id);
            return id;
        },
        [nextId],
    );

    const closeTab = useCallback(
        (id: number) => {
            setTabs(prev => {
                if (prev.length <= 1) {
                    // Replace the last tab with a fresh blank rather than
                    // leaving zero tabs (the UI doesn't handle empty).
                    return [makeBlankTab(id)];
                }
                const next = prev.filter(t => t.id !== id);
                if (id === activeTabId) {
                    // Prefer the tab that was to the left of the closed one
                    const idx = prev.findIndex(t => t.id === id);
                    const fallback = next[Math.max(0, idx - 1)] ?? next[0];
                    setActiveTabId(fallback.id);
                }
                return next;
            });
        },
        [activeTabId],
    );

    const switchTab = useCallback((id: number) => {
        setActiveTabId(id);
    }, []);

    const updateActiveTab = useCallback(
        (mutator: (tab: BrowserTab) => BrowserTab) => {
            setTabs(prev => prev.map(t => (t.id === activeTabId ? mutator(t) : t)));
        },
        [activeTabId],
    );

    const navigate = useCallback(
        (rawUrl: string) => {
            const url = rawUrl.trim();
            if (!url) return;
            const kind = classifyUrl(url);
            updateActiveTab(t => {
                // Truncate forward history (re-navigating from middle of
                // history collapses the "future" branch).
                const newHistory = [...t.history.slice(0, t.historyIndex + 1), url];
                return {
                    ...t,
                    history: newHistory,
                    historyIndex: newHistory.length - 1,
                    kind,
                    status: 'loading',
                    title: url,
                    errorReason: undefined,
                    errorMessage: undefined,
                };
            });
        },
        [updateActiveTab],
    );

    const goBack = useCallback(() => {
        updateActiveTab(t => {
            if (t.historyIndex <= 0) return t;
            const newIndex = t.historyIndex - 1;
            const url = t.history[newIndex];
            return {
                ...t,
                historyIndex: newIndex,
                kind: url === 'echelon:home' ? 'blank' : classifyUrl(url),
                status: url === 'echelon:home' ? 'idle' : 'loading',
                title: url === 'echelon:home' ? DEFAULT_BLANK_TITLE : url,
                errorReason: undefined,
                errorMessage: undefined,
            };
        });
    }, [updateActiveTab]);

    const goForward = useCallback(() => {
        updateActiveTab(t => {
            if (t.historyIndex >= t.history.length - 1) return t;
            const newIndex = t.historyIndex + 1;
            const url = t.history[newIndex];
            return {
                ...t,
                historyIndex: newIndex,
                kind: url === 'echelon:home' ? 'blank' : classifyUrl(url),
                status: url === 'echelon:home' ? 'idle' : 'loading',
                title: url === 'echelon:home' ? DEFAULT_BLANK_TITLE : url,
                errorReason: undefined,
                errorMessage: undefined,
            };
        });
    }, [updateActiveTab]);

    const canGoBack = activeTab.historyIndex > 0;
    const canGoForward = activeTab.historyIndex < activeTab.history.length - 1;

    const setActiveTabTitle = useCallback(
        (title: string) => {
            updateActiveTab(t => ({ ...t, title }));
        },
        [updateActiveTab],
    );

    const markActiveTabLoaded = useCallback(
        (title?: string) => {
            updateActiveTab(t => ({
                ...t,
                status: 'loaded',
                title: title ?? t.title,
                errorReason: undefined,
                errorMessage: undefined,
            }));
        },
        [updateActiveTab],
    );

    const markActiveTabError = useCallback(
        (reason: BrowserTab['errorReason'], message?: string) => {
            updateActiveTab(t => ({
                ...t,
                status: 'error',
                kind: 'error',
                errorReason: reason ?? 'unknown',
                errorMessage: message,
            }));
        },
        [updateActiveTab],
    );

    return {
        tabs,
        activeTabId,
        activeTab,
        openTab,
        closeTab,
        switchTab,
        navigate,
        goBack,
        goForward,
        canGoBack,
        canGoForward,
        setActiveTabTitle,
        markActiveTabLoaded,
        markActiveTabError,
    };
}
