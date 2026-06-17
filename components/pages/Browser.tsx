import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../ui/Card.tsx';
import Banner from '../ui/Banner.tsx';
import Modal from '../ui/Modal.tsx';
import TabBar from '../browser/TabBar.tsx';
import AddressBar from '../browser/AddressBar.tsx';
import RouteIndicator from '../browser/RouteIndicator.tsx';
import SmartErrorPage from '../browser/SmartErrorPage.tsx';
import EepsiteDirectoryHome from '../browser/EepsiteDirectoryHome.tsx';
import HistoryPanel from '../browser/HistoryPanel.tsx';
import {
    type BrowserTab,
    classifyUrl,
    useBrowserTabs,
} from '../../hooks/useBrowserTabs.ts';
import {
    addBookmark,
    isBookmarked,
    isJsEnabledForHost,
    loadAllBookmarks,
    removeBookmark,
    setJsEnabledForHost,
} from '../../hooks/browserStore.ts';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import { getOutproxy } from '../../hooks/outproxyClient.ts';
import { browseEepsite, BrowseError } from '../../hooks/browseClient.ts';
import { useFeatureFlags } from '../../hooks/useFeatureFlags.ts';
import type { Eepsite, Page } from '../../types';

interface BrowserProps {
    setPage: (page: Page) => void;
    eepsites?: Eepsite[];
}

const ArrowLeftIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>);
const ArrowRightIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>);
const RefreshIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 4s-1.5-2-5-2-5 2-5 2M4 20s1.5 2 5 2 5-2 5-2" /></svg>);
const StarIcon: React.FC<{ filled: boolean }> = ({ filled }) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>);
const HistoryIcon: React.FC = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const JsIcon: React.FC<{ filled: boolean }> = ({ filled }) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="3" strokeLinejoin="round" /><text x="12" y="16" textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontWeight="bold" fontSize="9" fill="currentColor" stroke="none">JS</text>{filled && (<line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />)}</svg>);

const NOTBOB_SEARCH_URL = 'notbob.i2p/search?q=';
function eepsiteTargetFor(rawUrl: string): string | null {
    if (!rawUrl || rawUrl === 'echelon:home') return null;
    const kind = classifyUrl(rawUrl);
    if (kind === 'search') return NOTBOB_SEARCH_URL + encodeURIComponent(rawUrl);
    return rawUrl;
}

const Browser: React.FC<BrowserProps> = ({ setPage, eepsites = [] }) => {
    const { config } = useEchelonConfig();
    const flags = useFeatureFlags();
    const tabs = useBrowserTabs();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [wfDefense, setWfDefense] = useState(false);
    const [jsEnabled, setJsEnabled] = useState(true);
    const [outproxyEnabled, setOutproxyEnabled] = useState(false);
    const [activeIsBookmarked, setActiveIsBookmarked] = useState(false);
    const [bookmarksVersion, setBookmarksVersion] = useState(0);

    // ── Fetch pipeline state ──
    const [pageHtml, setPageHtml] = useState<string | null>(null);
    const [fetchStats, setFetchStats] = useState<{ blocked: number; scriptsRemoved: number; rewritten: number } | null>(null);
    const [fetchError, setFetchError] = useState<{ reason: string; message: string } | null>(null);
    const [showDaemonModal, setShowDaemonModal] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const activeTab = tabs.activeTab;
    const activeUrl = activeTab.history[activeTab.historyIndex] ?? '';
    const activeRoute = activeUrl ? classifyUrl(activeUrl) : 'blank';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!activeUrl || activeUrl === 'echelon:home') {
                if (!cancelled) setJsEnabled(true);
                return;
            }
            const enabled = await isJsEnabledForHost(activeUrl);
            if (!cancelled) setJsEnabled(enabled);
        })();
        return () => { cancelled = true; };
    }, [activeUrl]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await getOutproxy(config);
                if (!cancelled) setOutproxyEnabled(resp.spec.mode !== 'disabled');
            } catch {
                if (!cancelled) setOutproxyEnabled(false);
            }
        })();
        return () => { cancelled = true; };
    }, [config]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!activeUrl || activeUrl === 'echelon:home') {
                if (!cancelled) setActiveIsBookmarked(false);
                return;
            }
            const yes = await isBookmarked(activeUrl);
            if (!cancelled) setActiveIsBookmarked(yes);
        })();
        return () => { cancelled = true; };
    }, [activeUrl, bookmarksVersion]);

    useEffect(() => {
        if (!flags.restoreTabs) return;
        let cancelled = false;
        (async () => {
            // Keep the current tab session-driven; the store restores snapshots
            // elsewhere. This page should not invent state.
            if (cancelled) return;
        })();
        return () => { cancelled = true; };
    }, [flags.restoreTabs]);

    // ── Fetch pipeline: actually load pages when tab status is 'loading' ──
    useEffect(() => {
        if (activeTab.status !== 'loading') return;
        if (!activeUrl || activeUrl === 'echelon:home') {
            tabs.markActiveTabLoaded('New Tab');
            return;
        }

        // Cancel any in-flight fetch
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setPageHtml(null);
        setFetchError(null);
        setFetchStats(null);

        // Pre-flight: block clearnet when outproxy is disabled
        const kind = classifyUrl(activeUrl);
        if (kind === 'clearnet' && !outproxyEnabled) {
            setFetchError({ reason: 'no-outproxy', message: 'Clearnet bridge is disabled. Enable outproxy to browse clearnet sites.' });
            tabs.markActiveTabError('no-outproxy', 'Clearnet bridge is disabled. Enable outproxy to browse clearnet sites.');
            return;
        }

        (async () => {
            try {
                const result = await browseEepsite(config, activeUrl, controller.signal, { wf: wfDefense });
                if (controller.signal.aborted) return;
                setPageHtml(result.html);
                setFetchStats({ blocked: result.blocked, scriptsRemoved: result.scriptsRemoved, rewritten: result.rewritten });
                tabs.markActiveTabLoaded(result.finalUrl || activeUrl);
            } catch (err) {
                if (controller.signal.aborted) return;
                if (err instanceof BrowseError) {
                    setFetchError({ reason: err.reason, message: err.message });
                    if (err.reason === 'no-i2pd') {
                        setShowDaemonModal(true);
                    }
                    // Map browse error reasons to tab error reasons
                    const tabReason = err.reason === 'too-large' || err.reason === 'bad-host' ? 'unknown' : err.reason;
                    tabs.markActiveTabError(tabReason, err.message);
                } else {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    setFetchError({ reason: 'unknown', message: msg });
                    tabs.markActiveTabError('unknown', msg);
                }
            }
        })();

        return () => { controller.abort(); };
    }, [activeTab.status, activeTab.id, activeUrl, config, wfDefense]);

    // Clear page content when navigating away
    useEffect(() => {
        if (activeTab.status === 'idle') {
            setPageHtml(null);
            setFetchError(null);
            setFetchStats(null);
        }
    }, [activeTab.status, activeTab.id]);

    const navTarget = (direction: 'back' | 'forward' | 'reload') => {
        if (direction === 'back') tabs.goBack();
        if (direction === 'forward') tabs.goForward();
        if (direction === 'reload' && activeUrl) tabs.navigate(activeUrl);
    };

    const onGo = (raw: string) => {
        const target = eepsiteTargetFor(raw);
        if (!target) {
            tabs.navigate('echelon:home');
            return;
        }
        tabs.navigate(target);
    };

    return (
        <div className="space-y-4">
            {/* ── i2pd Not Connected Modal ── */}
            {showDaemonModal && (
                <Modal onClose={() => setShowDaemonModal(false)} title="I2P Not Connected">
                    <div className="space-y-4">
                        <p className="text-gray-300 text-sm">
                            The Echelon sync daemon is not reachable at <code className="text-purple-300">127.0.0.1:7071</code>.
                            The browser needs it to fetch <code className="text-purple-300">.i2p</code> eepsites and sanitize them.
                        </p>

                        <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-2">
                            <p className="text-gray-400 font-semibold">📱 Step 1 — Install Termux</p>
                            <p className="text-gray-400 text-xs">
                                Download <strong>Termux</strong> from <strong>F-Droid</strong> (not Play Store — that version is outdated).
                            </p>
                            <a href="https://f-droid.org/en/packages/com.termux/" target="_blank" rel="noopener noreferrer"
                                className="inline-block text-purple-400 hover:text-purple-300 text-xs underline">
                                f-droid.org/en/packages/com.termux
                            </a>
                        </div>

                        <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-2">
                            <p className="text-gray-400 font-semibold">📱 Step 2 — Run the installer</p>
                            <p className="text-gray-400 text-xs">Open Termux and paste this one command:</p>
                            <pre className="text-green-400 text-xs font-mono bg-slate-900 rounded p-2 whitespace-pre-wrap break-all">
{`curl -sSL https://raw.githubusercontent.com/greywolf42069/echeloni2p/main/install-termux.sh | bash`}
                            </pre>
                            <p className="text-gray-500 text-xs">
                                This installs i2pd + Python, clones Echelon, starts the daemon, and sets up a restart shortcut.
                            </p>
                        </div>

                        <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-2">
                            <p className="text-gray-400 font-semibold">📱 Step 3 — Auto-start on boot (optional but recommended)</p>
                            <p className="text-gray-400 text-xs">
                                Install <strong>Termux:Boot</strong> from F-Droid so Echelon starts automatically when you restart your phone:
                            </p>
                            <a href="https://f-droid.org/en/packages/com.termux.boot/" target="_blank" rel="noopener noreferrer"
                                className="inline-block text-purple-400 hover:text-purple-300 text-xs underline">
                                f-droid.org/en/packages/com.termux.boot
                            </a>
                            <p className="text-gray-500 text-xs">
                                The installer already placed the boot script at <code className="text-purple-300">~/.termux/boot/echelon.sh</code>.
                                Once Termux:Boot is installed, Echelon will start on every phone reboot — no manual steps needed.
                            </p>
                        </div>

                        <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-2">
                            <p className="text-gray-400 font-semibold">💻 macOS / Linux (desktop)</p>
                            <pre className="text-green-400 text-xs font-mono bg-slate-900 rounded p-2 whitespace-pre-wrap break-all">
{`curl -sSL https://raw.githubusercontent.com/greywolf42069/echeloni2p/main/install.sh | bash`}
                            </pre>
                            <p className="text-gray-500 text-xs">
                                Installs i2pd, clones Echelon, and sets up auto-start on boot (launchd on macOS, systemd on Linux). No extra steps needed.
                            </p>
                        </div>

                        <div className="bg-slate-900 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                            <p className="font-semibold text-gray-400">What the installer does:</p>
                            <p>✅ Installs i2pd (I2P router) + Python 3</p>
                            <p>✅ Clones Echelon to ~/Echelon</p>
                            <p>✅ Starts i2pd on :4444 (proxy) and :7070 (console)</p>
                            <p>✅ Starts sync daemon on :7071</p>
                            <p>✅ Creates ~/start-echelon.sh for manual restart</p>
                            <p>✅ Sets up boot persistence (auto-start on reboot)</p>
                            <p className="text-gray-600 mt-1">Zero pip dependencies. Pure Python stdlib. Safe to run.</p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowDaemonModal(false); setPage('settings' as Page); }}
                                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-semibold"
                            >
                                Go to Settings
                            </button>
                            <button
                                onClick={() => setShowDaemonModal(false)}
                                className="px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition text-sm"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            <Card className="p-3">
                <h1 className="text-lg font-bold text-white mb-2">Browser</h1>
                <TabBar
                    tabs={tabs.tabs}
                    activeTabId={tabs.activeTabId}
                    onSwitch={tabs.switchTab}
                    onClose={tabs.closeTab}
                    onNewTab={() => tabs.openTab()}
                />
                <div className="flex items-center gap-2 flex-wrap mt-2">
                    <button onClick={() => navTarget('back')} className="p-2 rounded-lg bg-slate-800 text-white" disabled={!tabs.canGoBack}><ArrowLeftIcon /></button>
                    <button onClick={() => navTarget('forward')} className="p-2 rounded-lg bg-slate-800 text-white" disabled={!tabs.canGoForward}><ArrowRightIcon /></button>
                    <button onClick={() => navTarget('reload')} className="p-2 rounded-lg bg-slate-800 text-white"><RefreshIcon /></button>
                    <AddressBar tab={activeTab} onSubmit={onGo} outproxyEnabled={outproxyEnabled} />
                    <button onClick={() => setHistoryOpen(s => !s)} className="p-2 rounded-lg bg-slate-800 text-white"><HistoryIcon /></button>
                    <button
                        onClick={async () => {
                            if (!activeUrl) return;
                            if (activeIsBookmarked) await removeBookmark(activeUrl); else await addBookmark({ url: activeUrl, title: activeUrl });
                            setBookmarksVersion(v => v + 1);
                        }}
                        aria-label={activeIsBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                        className="p-2 rounded-lg bg-slate-800 text-white"
                    ><StarIcon filled={activeIsBookmarked} /></button>
                    <RouteIndicator tab={activeTab} outproxyEnabled={outproxyEnabled} />
                </div>
            </Card>
            {historyOpen && <HistoryPanel onClose={() => setHistoryOpen(false)} onNavigate={onGo} />}
            {/* Loading indicator */}
            {activeTab.status === 'loading' && (
                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce" />
                        <span className="text-gray-400 text-sm ml-2">Loading {activeUrl}...</span>
                    </div>
                </div>
            )}
            {activeTab.status === 'loaded' && pageHtml && fetchStats && fetchStats.blocked > 0 && (
                <div className="text-center py-2">
                    <span className="text-sm text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-3 py-1">
                        {fetchStats.blocked} clearnet trackers blocked
                    </span>
                </div>
            )}
            {/* Content area */}
            {activeTab.status === 'error' ? (
                <SmartErrorPage tab={activeTab} onRetry={() => tabs.navigate(activeUrl)} onConfigure={(target) => setPage(target as Page)} />
            ) : activeTab.status === 'loaded' && pageHtml ? (
                <iframe
                    title="I2P Content"
                    srcDoc={pageHtml}
                    sandbox={jsEnabled ? 'allow-scripts' : ''}
                    className="w-full border-0 bg-white"
                    style={{ minHeight: '70vh' }}
                />
            ) : activeTab.status === 'idle' ? (
                <EepsiteDirectoryHome onNavigate={onGo} ownEepsites={eepsites} />
            ) : null}
        </div>
    );
};

export default Browser;


