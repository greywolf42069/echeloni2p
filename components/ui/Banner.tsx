import React from 'react';

export type BannerKind = 'devnet' | 'comingV02' | 'beta' | 'prelaunch' | 'info';

interface BannerProps {
    kind: BannerKind;
    title?: string;
    children?: React.ReactNode;
    className?: string;
}

const KIND_STYLE: Record<BannerKind, { bg: string; border: string; text: string; defaultTitle: string }> = {
    devnet: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/40',
        text: 'text-amber-200',
        defaultTitle: 'Devnet',
    },
    comingV02: {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/40',
        text: 'text-purple-200',
        defaultTitle: 'Coming with v0.2',
    },
    beta: {
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/40',
        text: 'text-teal-200',
        defaultTitle: 'v0.1 beta',
    },
    prelaunch: {
        bg: 'bg-fuchsia-500/10',
        border: 'border-fuchsia-500/40',
        text: 'text-fuchsia-200',
        defaultTitle: 'Pre-launch',
    },
    info: {
        bg: 'bg-slate-700/30',
        border: 'border-slate-600/40',
        text: 'text-slate-200',
        defaultTitle: '',
    },
};

const KIND_ICON: Record<BannerKind, React.ReactNode> = {
    devnet: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    comingV02: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    beta: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
    ),
    prelaunch: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    info: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
};

/**
 * Status banner used to clearly mark surfaces that read from devnet,
 * are gated behind feature flags, or carry a v0.1-beta context.
 *
 * Usage:
 *   <Banner kind="devnet">Subscriptions are processed on Solana devnet…</Banner>
 *   <Banner kind="comingV02">Staking activates at the v0.2 RTD launch.</Banner>
 *   <Banner kind="beta">v0.1 beta — subscription numbers are real, RTD is not yet live.</Banner>
 *   <Banner kind="prelaunch">RTD swap is pre-launch — connector and liquidity are pending.</Banner>
 */
const Banner: React.FC<BannerProps> = ({ kind, title, children, className = '' }) => {
    const style = KIND_STYLE[kind];
    const heading = title ?? style.defaultTitle;
    return (
        <div
            role="status"
            data-banner-kind={kind}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${style.bg} ${style.border} ${style.text} ${className}`.trim()}
        >
            <span className="mt-0.5">{KIND_ICON[kind]}</span>
            <div className="flex-1 text-sm">
                {heading && <span className="font-semibold">{heading}</span>}
                {heading && children ? <span className="mx-1">·</span> : null}
                {children}
            </div>
        </div>
    );
};

export default Banner;

