import React from 'react';
import type { FeatureFlags } from '../featureFlags.ts';
import type { NavItem } from '../components/layout/FooterMenu.tsx';
import type { Page } from '../types.ts';

// ── SVG icon factories ──────────────────────────────────────────────
// Each is a thin wrapper that can be inlined into NavItem.icon.

const DashboardIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
);

const ProtectIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

const BrowserIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" strokeLinejoin="round" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3a13.5 13.5 0 010 18M12 3a13.5 13.5 0 000 18" />
    </svg>
);

const EepsiteIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5l9-4.5 9 4.5M3 7.5l9 4.5 9-4.5M3 7.5v9l9 4.5m0-9l9-4.5m-9 4.5v9" />
    </svg>
);

const WalletIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 6h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm12 7a1 1 0 100 2 1 1 0 000-2z" />
    </svg>
);

const StakingIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7l8-4 8 4m-8 14v-4" />
    </svg>
);

const BountiesIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l2.39 6.96H22l-5.81 4.21L18.55 21 12 16.69 5.45 21l2.36-7.83L2 8.96h7.61L12 2z" />
    </svg>
);

const GovernanceIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
);

const ReferralsIcon = (): React.ReactElement => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
    </svg>
);

// ── Nav config ──────────────────────────────────────────────────────

/**
 * The set of pages that require the token economy to be live.
 * When `featureFlags.tokenEconomy === false`, accessing these pages
 * should redirect to the dashboard, and the nav entries for them
 * should be hidden.
 */
export const TOKEN_GATED_PAGES: ReadonlySet<Page> = new Set<Page>([
    'staking',
    'governance',
    'bounties',
    'emissions',
    'referrals',
]);

/** v0.1 footer nav (token economy off) — product-focused. */
const V0_1_NAV: ReadonlyArray<NavItem> = [
    { page: 'dashboard',         label: 'Dashboard', icon: <DashboardIcon /> },
    { page: 'browser',           label: 'Browser',   icon: <BrowserIcon /> },
    { page: 'eepsite-hosting',   label: 'Eepsites',  icon: <EepsiteIcon /> },
    { page: 'protect',           label: 'Protect',   icon: <ProtectIcon /> },
    { page: 'wallet',            label: 'Wallet',    icon: <WalletIcon /> },
];

/** v0.2+ footer nav (token economy on) — full DePIN economy. */
const V0_2_NAV: ReadonlyArray<NavItem> = [
    { page: 'dashboard',  label: 'Dashboard',  icon: <DashboardIcon /> },
    { page: 'protect',    label: 'Protect',    icon: <ProtectIcon /> },
    { page: 'staking',    label: 'Staking',    icon: <StakingIcon /> },
    { page: 'bounties',   label: 'Bounties',   icon: <BountiesIcon /> },
    { page: 'governance', label: 'Governance', icon: <GovernanceIcon /> },
    { page: 'referrals',  label: 'Referrals',  icon: <ReferralsIcon /> },
];

/**
 * Returns the footer nav items for the given feature-flag state.
 * Pure function — call it inline in render.
 */
export function getFooterNav(flags: Pick<FeatureFlags, 'tokenEconomy'>): ReadonlyArray<NavItem> {
    return flags.tokenEconomy ? V0_2_NAV : V0_1_NAV;
}

/**
 * Returns true if accessing `page` is blocked under the current
 * feature flag state. Used by the App-level route guard.
 */
export function isPageBlocked(
    page: Page,
    flags: Pick<FeatureFlags, 'tokenEconomy'>,
): boolean {
    return !flags.tokenEconomy && TOKEN_GATED_PAGES.has(page);
}
