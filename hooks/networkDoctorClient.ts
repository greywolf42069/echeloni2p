/**
 * Network Doctor client — calls the daemon's /network/doctor endpoint
 * and returns the structured diagnosis the in-app screen renders.
 *
 * Mirrors scripts/network_doctor.py's Diagnosis shape exactly.
 */
import { type EchelonConfig, buildSyncDaemonUrl, daemonAuthHeaders } from './useEchelonConfig.ts';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';
export type Overall = 'ok' | 'degraded' | 'down';

export interface DoctorCheck {
    key: string;
    status: CheckStatus;
    label: string;
    detail: string;
}

export interface DoctorRecommendation {
    code: string;
    title: string;
    body: string;
    command: string | null;
}

export interface Diagnosis {
    overall: Overall;
    checks: DoctorCheck[];
    recommendation: DoctorRecommendation | null;
}

export class DoctorError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DoctorError';
    }
}

/**
 * Fetch a diagnosis. `probe` triggers a live eepsite fetch (slower but
 * gives ground-truth "browsing works"). Daemon-unreachable produces a
 * synthetic "down/start_daemon" diagnosis so the screen still renders
 * something useful instead of throwing.
 */
export async function runNetworkDoctor(
    config: EchelonConfig,
    opts: { probe?: boolean; signal?: AbortSignal } = {},
): Promise<Diagnosis> {
    const url = buildSyncDaemonUrl(config, `network/doctor${opts.probe ? '?probe=1' : ''}`);
    let resp: Response;
    try {
        resp = await fetch(url, { method: 'GET', cache: 'no-store', signal: opts.signal, headers: daemonAuthHeaders() });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        // The daemon itself is unreachable — synthesize the diagnosis the
        // Python engine would return for that case.
        return {
            overall: 'down',
            checks: [{
                key: 'daemon',
                status: 'fail',
                label: 'Echelon sync daemon not reachable',
                detail: "The local helper that talks to i2pd isn't running.",
            }],
            recommendation: {
                code: 'start_daemon',
                title: 'Start the Echelon sync daemon',
                body: 'Run the sync daemon in Termux (or your terminal). It bridges the app to i2pd and serves sanitized eepsites.',
                command: 'python3 -m echelon_sync_daemon',
            },
        };
    }
    if (!resp.ok) {
        throw new DoctorError(`Daemon responded ${resp.status}`);
    }
    return (await resp.json()) as Diagnosis;
}

// ── Autopilot: mode + autofix plan + safe self-heal ──────────────────

export type NetworkMode =
    | 'A_NATIVE' | 'B_YGGDRASIL' | 'C_BOOTSTRAP' | 'D_OFFLINE' | 'E_DEGRADED';

export interface AutofixPlan {
    mode: NetworkMode;
    reason: string;
    safeAutoFixes: string[];
    requiresUserAction: string[];
}

/** Fetch the autopilot plan: current mode + what can self-heal vs needs the user. */
export async function getAutofixPlan(
    config: EchelonConfig,
    opts: { probe?: boolean; signal?: AbortSignal } = {},
): Promise<AutofixPlan> {
    const url = buildSyncDaemonUrl(config, `network/autofix-plan${opts.probe ? '?probe=1' : ''}`);
    let resp: Response;
    try {
        resp = await fetch(url, { method: 'GET', cache: 'no-store', signal: opts.signal, headers: daemonAuthHeaders() });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        return { mode: 'E_DEGRADED', reason: 'daemon_unreachable', safeAutoFixes: [], requiresUserAction: ['start_daemon'] };
    }
    if (!resp.ok) throw new DoctorError(`Daemon responded ${resp.status}`);
    return (await resp.json()) as AutofixPlan;
}

export interface ApplyResult {
    applied: string[];
    refused: string[];
    writtenKeys: string[];
    note: string;
}

/** Apply the no-root safe fixes the daemon offered. Root/install fixes are refused server-side. */
export async function applySafeConfig(
    config: EchelonConfig,
    fixes: string[],
    signal?: AbortSignal,
): Promise<ApplyResult> {
    const url = buildSyncDaemonUrl(config, 'network/apply-safe-config');
    const resp = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: daemonAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fixes }),
        signal,
    });
    if (!resp.ok) throw new DoctorError(`Daemon responded ${resp.status}`);
    return (await resp.json()) as ApplyResult;
}
