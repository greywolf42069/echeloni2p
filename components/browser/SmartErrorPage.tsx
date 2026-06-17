import React from 'react';
import type { BrowserTab } from '../../hooks/useBrowserTabs.ts';

interface SmartErrorPageProps {
    tab: BrowserTab;
    /** Retry the current URL (active tab's history[historyIndex]). */
    onRetry(): void;
    /** Navigate the user to the relevant config page. */
    onConfigure(target: 'protect' | 'outproxy-config' | 'meshnet-config'): void;
}

interface ErrorContent {
    title: string;
    body: string;
    primary: { label: string; action: 'retry' | 'protect' | 'outproxy' | 'meshnet' };
    secondary?: { label: string; action: 'retry' | 'protect' | 'outproxy' | 'meshnet' };
}

const ERROR_CONTENT: Record<NonNullable<BrowserTab['errorReason']>, ErrorContent> = {
    'no-i2pd': {
        title: 'i2pd is not running',
        body: 'Echelon needs i2pd running locally — typically inside Termux on Android — to route your traffic. Start i2pd, then retry.',
        primary: { label: 'Set up I2P', action: 'protect' },
        secondary: { label: 'Retry', action: 'retry' },
    },
    'no-outproxy': {
        title: 'Clearnet bridge disabled',
        body: 'Reaching clearnet from inside I2P requires an outproxy. Enable HTTP outproxy in your Echelon outproxy config — it routes through the I2P network plus an exit relay so the destination never sees your IP.',
        primary: { label: 'Enable outproxy', action: 'outproxy' },
        secondary: { label: 'Retry', action: 'retry' },
    },
    'tunnel-timeout': {
        title: 'Tunnel timed out',
        body: 'Your i2pd could not establish a tunnel to this destination within the timeout window. The eepsite may be offline, behind a slow router, or your tunnel may have failed to build. First-load times of 10–30 seconds are normal for cold eepsites.',
        primary: { label: 'Retry', action: 'retry' },
        secondary: { label: 'Check meshnet', action: 'meshnet' },
    },
    'dns-failed': {
        title: 'Eepsite address not found',
        body: 'No entry for this address in your i2pd NetDB. The destination may be misspelled, or the eepsite owner has not yet published their address. Try the address from a directory like notbob.i2p or identiguy.i2p.',
        primary: { label: 'Retry', action: 'retry' },
    },
    'frame-blocked': {
        title: 'Eepsite blocked embedding',
        body: 'This eepsite sends X-Frame-Options: deny, which prevents Echelon from rendering it inside this view. Open it in a separate window to reach it.',
        primary: { label: 'Open in new window', action: 'retry' },
    },
    'rate-limited': {
        title: 'Exit relay rate-limited',
        body: 'The outproxy you used is throttling your requests. Wait 30–60 seconds and retry, or switch to a different outproxy in your config.',
        primary: { label: 'Retry', action: 'retry' },
        secondary: { label: 'Outproxy config', action: 'outproxy' },
    },
    unknown: {
        title: 'Could not load this page',
        body: 'Something went wrong rendering this destination. The most likely causes are a slow tunnel build, an offline eepsite, or a network hiccup. Retrying often works.',
        primary: { label: 'Retry', action: 'retry' },
    },
};

const SmartErrorPage: React.FC<SmartErrorPageProps> = ({ tab, onRetry, onConfigure }) => {
    const reason = tab.errorReason ?? 'unknown';
    const content = ERROR_CONTENT[reason];
    const url = tab.history[tab.historyIndex] ?? '';

    const handleAction = (action: 'retry' | 'protect' | 'outproxy' | 'meshnet') => {
        if (action === 'retry') return onRetry();
        if (action === 'protect') return onConfigure('protect');
        if (action === 'outproxy') return onConfigure('outproxy-config');
        if (action === 'meshnet') return onConfigure('meshnet-config');
    };

    return (
        <div
            data-error-reason={reason}
            className="flex flex-col items-center justify-center text-center p-8 bg-slate-800/50 rounded-lg min-h-[40vh]"
            role="alert"
        >
            <ErrorBadge reason={reason} />
            <h2 className="mt-4 text-2xl font-bold text-white">{content.title}</h2>
            <p className="mt-3 max-w-prose text-sm text-gray-300">{content.body}</p>
            {tab.errorMessage && (
                <p className="mt-2 max-w-prose text-xs text-gray-500 font-mono">{tab.errorMessage}</p>
            )}
            {url && (
                <p className="mt-2 text-xs text-gray-500 font-mono break-all">{url}</p>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                    onClick={() => handleAction(content.primary.action)}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition"
                >
                    {content.primary.label}
                </button>
                {content.secondary && (
                    <button
                        onClick={() => handleAction(content.secondary!.action)}
                        className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
                    >
                        {content.secondary.label}
                    </button>
                )}
            </div>
        </div>
    );
};

const ErrorBadge: React.FC<{ reason: string }> = ({ reason }) => {
    const colorMap: Record<string, string> = {
        'no-i2pd': 'text-red-400',
        'no-outproxy': 'text-amber-400',
        'tunnel-timeout': 'text-yellow-400',
        'dns-failed': 'text-blue-400',
        'frame-blocked': 'text-purple-400',
        'rate-limited': 'text-orange-400',
        unknown: 'text-gray-400',
    };
    return (
        <div className={`p-3 rounded-full bg-slate-900/50 ${colorMap[reason] ?? 'text-gray-400'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
    );
};

export default SmartErrorPage;
