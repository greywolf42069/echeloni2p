import React from 'react';
import { useProtectionStatus, type ProtectionLevel } from '../hooks/useProtectionStatus.ts';
import type { Page } from '../types';

const STYLE: Record<ProtectionLevel, { ring: string; dot: string; glow: string }> = {
    protected: { ring: 'border-green-500/40 bg-green-500/10', dot: 'bg-green-400', glow: 'shadow-[0_0_20px_-4px_rgba(74,222,128,0.5)]' },
    partial:   { ring: 'border-yellow-400/40 bg-yellow-400/10', dot: 'bg-yellow-400 animate-pulse', glow: 'shadow-[0_0_20px_-4px_rgba(250,204,21,0.5)]' },
    exposed:   { ring: 'border-red-500/50 bg-red-500/10', dot: 'bg-red-500 animate-pulse', glow: 'shadow-[0_0_20px_-4px_rgba(239,68,68,0.5)]' },
    checking:  { ring: 'border-slate-600/40 bg-slate-700/20', dot: 'bg-slate-400 animate-pulse', glow: '' },
};

const ShieldIcon: React.FC<{ level: ProtectionLevel }> = ({ level }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        {level === 'protected' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.74-2.99l-7-12a2 2 0 00-3.48 0l-7 12A2 2 0 005.07 19z" />
        )}
    </svg>
);

/**
 * VPN-style protection banner. Scans the user's OWN network posture
 * locally (no third-party beacon) and tells them, in plain language,
 * whether they're protected — with a one-tap path to the fix when not.
 */
const ProtectionBanner: React.FC<{ setPage?: (p: Page) => void; compact?: boolean }> = ({ setPage, compact }) => {
    const { level, headline, detail, mode, refresh } = useProtectionStatus();
    const s = STYLE[level];
    const showFix = level === 'exposed' || level === 'partial';

    return (
        <div className={`rounded-xl border ${s.ring} ${s.glow} p-4 sm:p-5 transition-colors`}>
            <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 ${level === 'protected' ? 'text-green-400' : level === 'exposed' ? 'text-red-400' : level === 'partial' ? 'text-yellow-300' : 'text-slate-400'}`}>
                    <ShieldIcon level={level} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                        <h3 className="text-lg font-bold text-white">{headline}</h3>
                        {mode && level !== 'checking' && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 text-gray-300 font-semibold">{mode.replace(/^._/, '')}</span>
                        )}
                    </div>
                    {!compact && <p className="text-sm text-gray-300 mt-1">{detail}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                        {showFix && setPage && (
                            <button
                                onClick={() => setPage('network-doctor')}
                                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition"
                            >
                                Get protected
                            </button>
                        )}
                        <button
                            onClick={refresh}
                            className="px-4 py-1.5 text-sm rounded-lg bg-slate-700/60 hover:bg-slate-700 text-gray-200 transition"
                        >
                            Re-scan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProtectionBanner;
