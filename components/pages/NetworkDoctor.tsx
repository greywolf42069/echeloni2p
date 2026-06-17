import React, { useCallback, useEffect, useState } from 'react';
import Card from '../ui/Card.tsx';
import Banner from '../ui/Banner.tsx';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import {
    type CheckStatus,
    type Diagnosis,
    type AutofixPlan,
    type ApplyResult,
    runNetworkDoctor,
    getAutofixPlan,
    applySafeConfig,
} from '../../hooks/networkDoctorClient.ts';
import type { Page } from '../../types';

interface NetworkDoctorProps {
    setPage: (page: Page) => void;
}

const STATUS_META: Record<CheckStatus, { icon: string; cls: string }> = {
    pass: { icon: '✓', cls: 'text-green-400' },
    warn: { icon: '!', cls: 'text-amber-400' },
    fail: { icon: '✗', cls: 'text-red-400' },
    info: { icon: '→', cls: 'text-sky-400' },
};

const OVERALL_META = {
    ok: { label: 'Healthy', cls: 'text-green-400', kind: 'beta' as const },
    degraded: { label: 'Degraded', cls: 'text-amber-400', kind: 'info' as const },
    down: { label: 'Down', cls: 'text-red-400', kind: 'devnet' as const },
};

const NetworkDoctor: React.FC<NetworkDoctorProps> = ({ setPage }) => {
    const { config } = useEchelonConfig();
    const [diag, setDiag] = useState<Diagnosis | null>(null);
    const [plan, setPlan] = useState<AutofixPlan | null>(null);
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [probing, setProbing] = useState(false);
    const [copied, setCopied] = useState(false);

    const run = useCallback(async (probe: boolean) => {
        setLoading(true);
        if (probe) setProbing(true);
        try {
            const [d, p] = await Promise.all([
                runNetworkDoctor(config, { probe }),
                getAutofixPlan(config, { probe }).catch(() => null),
            ]);
            setDiag(d);
            setPlan(p);
        } catch {
            /* runNetworkDoctor synthesizes the down case; only DoctorError
               on a bad status reaches here — leave the prior diagnosis. */
        } finally {
            setLoading(false);
            setProbing(false);
        }
    }, [config]);

    const applyFixes = useCallback(async () => {
        if (!plan || plan.safeAutoFixes.length === 0) return;
        setApplying(true);
        try {
            const res = await applySafeConfig(config, plan.safeAutoFixes);
            setApplyResult(res);
            void run(false);
        } catch {
            /* leave UI as-is on failure */
        } finally {
            setApplying(false);
        }
    }, [plan, config, run]);

    useEffect(() => { void run(false); }, [run]);

    const copyCommand = (cmd: string) => {
        try {
            navigator.clipboard?.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-white">Network Doctor</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Diagnoses why I2P browsing isn't working — and gives you the exact fix.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => run(false)}
                        disabled={loading}
                        className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
                    >
                        {loading && !probing ? 'Checking…' : 'Re-run'}
                    </button>
                    <button
                        onClick={() => run(true)}
                        disabled={loading}
                        className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
                    >
                        {probing ? 'Testing live fetch…' : 'Deep test (live eepsite)'}
                    </button>
                </div>
            </div>

            {diag && (
                <>
                    <Banner kind={OVERALL_META[diag.overall].kind} title={`Overall: ${OVERALL_META[diag.overall].label}`}>
                        {diag.overall === 'ok' && 'I2P routing is working. You can browse eepsites.'}
                        {diag.overall === 'degraded' && 'Partly working — see the recommended fix below.'}
                        {diag.overall === 'down' && 'Not working yet — follow the fix below to get online.'}
                    </Banner>

                    {plan && (
                        <Card>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Autopilot</h2>
                                    <p className="text-sm text-gray-400 mt-1">
                                        Mode <code className="text-teal-300">{plan.mode}</code> · {plan.reason.replace(/_/g, ' ')}
                                    </p>
                                </div>
                                {plan.safeAutoFixes.length > 0 && (
                                    <button
                                        onClick={applyFixes}
                                        disabled={applying}
                                        className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
                                    >
                                        {applying ? 'Applying…' : 'Apply safe fixes'}
                                    </button>
                                )}
                            </div>
                            {plan.requiresUserAction.length > 0 && (
                                <p className="text-xs text-amber-400 mt-3">
                                    Needs you (install / admin rights): {plan.requiresUserAction.map(c => c.replace(/_/g, ' ')).join(', ')} — see the fix below.
                                </p>
                            )}
                            {applyResult && (
                                <p className="text-xs text-gray-400 mt-2">
                                    {applyResult.applied.length > 0 && `Applied: ${applyResult.applied.join(', ')}. `}
                                    {applyResult.note}
                                </p>
                            )}
                        </Card>
                    )}

                    <Card>
                        <h2 className="text-lg font-semibold text-white mb-3">Checks</h2>
                        <ul className="space-y-2 font-mono text-sm">
                            {diag.checks.map(c => (
                                <li key={c.key} className="flex items-start gap-3">
                                    <span className={`${STATUS_META[c.status].cls} font-bold w-4 flex-shrink-0`}>
                                        {STATUS_META[c.status].icon}
                                    </span>
                                    <span className="flex-1">
                                        <span className="text-gray-200">{c.label}</span>
                                        {c.detail && (
                                            <span className="block text-xs text-gray-500 mt-0.5 font-sans">{c.detail}</span>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    {diag.recommendation && (
                        <Card className="border-2 border-purple-500/40">
                            <h2 className="text-lg font-semibold text-white">
                                Recommended fix: {diag.recommendation.title}
                            </h2>
                            <p className="text-sm text-gray-300 mt-2 whitespace-pre-line">
                                {diag.recommendation.body}
                            </p>
                            {diag.recommendation.command && (
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs uppercase text-gray-400 font-semibold">
                                            Copy &amp; paste into your terminal
                                        </span>
                                        <button
                                            onClick={() => copyCommand(diag.recommendation!.command!)}
                                            className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition"
                                        >
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="bg-slate-900 text-teal-300 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
{diag.recommendation.command}
                                    </pre>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 mt-3">
                                On a phone/cellular network behind carrier NAT? The Yggdrasil
                                transport is the usual fix. Full walkthrough in the docs.
                            </p>
                        </Card>
                    )}
                </>
            )}

            {!diag && loading && (
                <Card><p className="text-gray-400">Running diagnostics…</p></Card>
            )}
        </div>
    );
};

export default NetworkDoctor;
