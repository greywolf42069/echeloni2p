import React from 'react';
import type { BrowserTab } from '../../hooks/useBrowserTabs.ts';

interface RouteIndicatorProps {
    tab: BrowserTab;
    /** Whether the user has configured an outproxy (clearnet bridge). */
    outproxyEnabled: boolean;
    /** Number of i2pd hops per tunnel. Default 3 = standard tunnel length. */
    tunnelHops?: number;
}

/**
 * Visualizes the routing path the active tab uses. Three modes:
 *
 *   eepsite (purple):
 *     you → i2pd local → 3 hops → eepsite
 *
 *   clearnet via outproxy (amber):
 *     you → i2pd local → 3 hops → exit relay → clearnet
 *
 *   clearnet direct (red, only if outproxy is disabled):
 *     you → 🚫 not anonymized — enable outproxy
 *
 *   blank/search/error: hidden (component returns null).
 *
 * This is the trust signal: at all times, the user knows exactly
 * where their bytes are going.
 */
const RouteIndicator: React.FC<RouteIndicatorProps> = ({ tab, outproxyEnabled, tunnelHops = 3 }) => {
    if (tab.kind === 'blank' || tab.kind === 'search' || tab.kind === 'error') {
        return null;
    }

    if (tab.kind === 'eepsite') {
        return (
            <div
                className="flex items-center gap-2 text-xs text-purple-200 px-2 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded"
                role="status"
                aria-label="Routing path"
                data-route-mode="eepsite"
            >
                <span className="font-semibold">Routing:</span>
                <Hop label="you" />
                <Arrow />
                <Hop label="i2pd local" />
                <Arrow />
                <Hop label={`${tunnelHops} hops`} />
                <Arrow />
                <Hop label="eepsite" terminal />
            </div>
        );
    }

    // clearnet kind
    if (!outproxyEnabled) {
        return (
            <div
                className="flex items-center gap-2 text-xs text-red-200 px-2 py-1.5 bg-red-500/10 border border-red-500/40 rounded"
                role="status"
                aria-label="Routing warning"
                data-route-mode="clearnet-blocked"
            >
                <span className="font-semibold">Not anonymized:</span>
                <span>outproxy is disabled — i2pd will refuse this request. Enable the clearnet bridge in Outproxy config.</span>
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-2 text-xs text-amber-200 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded"
            role="status"
            aria-label="Routing path"
            data-route-mode="clearnet-bridged"
        >
            <span className="font-semibold">Routing:</span>
            <Hop label="you" />
            <Arrow />
            <Hop label="i2pd local" />
            <Arrow />
            <Hop label={`${tunnelHops} hops`} />
            <Arrow />
            <Hop label="exit relay" />
            <Arrow />
            <Hop label="clearnet" terminal />
        </div>
    );
};

const Hop: React.FC<{ label: string; terminal?: boolean }> = ({ label, terminal }) => (
    <span className={`px-1.5 py-0.5 rounded text-[11px] ${terminal ? 'bg-slate-900/50 font-medium' : 'bg-slate-800/50'}`}>
        {label}
    </span>
);

const Arrow: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

export default RouteIndicator;
