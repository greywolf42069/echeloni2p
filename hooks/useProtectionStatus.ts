import { useCallback, useEffect, useRef, useState } from 'react';
import { useEchelonConfig } from './useEchelonConfig.ts';
import {
    runNetworkDoctor, getAutofixPlan,
    type Diagnosis, type AutofixPlan, type NetworkMode,
} from './networkDoctorClient.ts';

/**
 * Protection status — the VPN-banner intelligence, done the Echelon way:
 * it scans your OWN network posture LOCALLY (via the daemon's doctor +
 * autopilot), never a third-party IP-geo beacon. "We tell you if you're
 * protected without leaking a packet to find out."
 */
export type ProtectionLevel = 'protected' | 'partial' | 'exposed' | 'checking';

export interface ProtectionStatus {
    level: ProtectionLevel;
    headline: string;
    detail: string;
    mode: NetworkMode | null;
    diagnosis: Diagnosis | null;
    plan: AutofixPlan | null;
    lastCheckedAt: Date | null;
    refresh: () => void;
}

const MODE_LABEL: Record<NetworkMode, string> = {
    A_NATIVE: 'Native I2P',
    B_YGGDRASIL: 'I2P over Yggdrasil (NAT escape)',
    C_BOOTSTRAP: 'Bootstrapping',
    D_OFFLINE: 'Offline',
    E_DEGRADED: 'Degraded',
};

function derive(diag: Diagnosis, plan: AutofixPlan): Pick<ProtectionStatus, 'level' | 'headline' | 'detail'> {
    // Ground truth wins: a live eepsite probe means you're actually routing.
    const eepsite = diag.checks.find(c => c.key === 'eepsite');
    if (eepsite?.status === 'pass') {
        return {
            level: 'protected',
            headline: "You're protected",
            detail: `Anonymous routing is live via ${MODE_LABEL[plan.mode]}. Your IP is hidden behind I2P; eepsite traffic verified end-to-end.`,
        };
    }
    if (diag.overall === 'down') {
        return {
            level: 'exposed',
            headline: "You're not protected",
            detail: plan.requiresUserAction.includes('start_daemon')
                ? 'The Echelon helper is offline. Start it to route anonymously.'
                : 'I2P routing is offline. Without it, normal traffic reveals your IP and provider.',
        };
    }
    if (diag.overall === 'degraded') {
        return {
            level: 'partial',
            headline: 'Protection is degraded',
            detail: plan.requiresUserAction.includes('install_yggdrasil')
                ? 'Your network (symmetric / carrier-grade NAT) is blocking tunnels. Echelon can route around it.'
                : 'Tunnels are still building. Routing is not reliable yet.',
        };
    }
    return {
        level: 'protected',
        headline: "You're protected",
        detail: `Routing via ${MODE_LABEL[plan.mode]}. Tunnels healthy.`,
    };
}

export function useProtectionStatus(intervalMs = 15000): ProtectionStatus {
    const { config } = useEchelonConfig();
    const [state, setState] = useState<Omit<ProtectionStatus, 'refresh'>>({
        level: 'checking', headline: 'Checking your protection…', detail: '',
        mode: null, diagnosis: null, plan: null, lastCheckedAt: null,
    });
    const inFlight = useRef<AbortController | null>(null);

    const scan = useCallback(async () => {
        inFlight.current?.abort();
        const ctrl = new AbortController();
        inFlight.current = ctrl;
        try {
            // probe=1 gives ground-truth "browsing works"; both calls are local.
            const [diagnosis, plan] = await Promise.all([
                runNetworkDoctor(config, { probe: true, signal: ctrl.signal }),
                getAutofixPlan(config, { probe: false, signal: ctrl.signal }),
            ]);
            setState({ ...derive(diagnosis, plan), mode: plan.mode, diagnosis, plan, lastCheckedAt: new Date() });
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            setState(s => ({
                ...s, level: 'exposed', headline: "You're not protected",
                detail: 'Could not reach the Echelon helper to verify routing.',
                lastCheckedAt: new Date(),
            }));
        }
    }, [config]);

    useEffect(() => {
        scan();
        const id = window.setInterval(scan, intervalMs);
        return () => { clearInterval(id); inFlight.current?.abort(); };
    }, [scan, intervalMs]);

    return { ...state, refresh: scan };
}
