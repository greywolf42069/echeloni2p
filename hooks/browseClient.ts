/**
 * Browse client — fetches a sanitized eepsite through the Echelon
 * sync daemon's /browse endpoint.
 *
 * CRITICAL: the browser NEVER fetches eepsites directly from i2pd. It
 * always goes through the daemon, which fetches via i2pd AND sanitizes
 * the HTML server-side (stripping every clearnet leak vector) before
 * returning it. We then render that already-safe HTML via iframe
 * `srcdoc` with a locked-down sandbox — so even if sanitization somehow
 * missed something, the sandbox + the daemon's CSP header are two more
 * layers preventing a clearnet request.
 */
import { type EchelonConfig, buildSyncDaemonUrl, daemonAuthHeaders } from './useEchelonConfig.ts';

export interface BrowseResult {
    /** Sanitized HTML ready for iframe srcdoc. */
    html: string;
    /** The eepsite URL that was actually fetched (post-redirect). */
    finalUrl: string;
    /** Count of clearnet resources stripped (for the "N blocked" badge). */
    blocked: number;
    /** Count of scripts removed. */
    scriptsRemoved: number;
    /** Count of in-network resources rewritten to the proxy. */
    rewritten: number;
}

/** Maps to SmartErrorPage error reasons. */
export type BrowseErrorReason =
    | 'no-i2pd'
    | 'no-outproxy'
    | 'tunnel-timeout'
    | 'dns-failed'
    | 'rate-limited'
    | 'frame-blocked'
    | 'too-large'
    | 'bad-host'
    | 'unknown';

export class BrowseError extends Error {
    constructor(public readonly reason: BrowseErrorReason, message: string) {
        super(message);
        this.name = 'BrowseError';
    }
}

/**
 * Fetch + sanitize an eepsite through the daemon. Throws BrowseError
 * (with a reason that maps to SmartErrorPage) on any failure.
 */
export async function browseEepsite(
    config: EchelonConfig,
    eepsiteUrl: string,
    signal?: AbortSignal,
    opts?: { wf?: boolean },
): Promise<BrowseResult> {
    const q = `browse?url=${encodeURIComponent(eepsiteUrl)}${opts?.wf ? '&wf=1' : ''}`;
    const url = buildSyncDaemonUrl(config, q);

    let resp: Response;
    try {
        resp = await fetch(url, { method: 'GET', cache: 'no-store', signal, headers: daemonAuthHeaders() });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        // Daemon itself unreachable — distinct from i2pd being down.
        throw new BrowseError('no-i2pd', 'Echelon sync daemon is unreachable. Is it running in Termux?');
    }

    if (!resp.ok) {
        // The daemon returns JSON {error, reason} on fetch failures.
        let reason: BrowseErrorReason = 'unknown';
        let message = `Daemon responded ${resp.status}`;
        try {
            const body = await resp.json();
            if (body.reason) reason = body.reason as BrowseErrorReason;
            if (body.error) message = body.error;
        } catch { /* non-JSON error body */ }
        throw new BrowseError(reason, message);
    }

    // WF defense: when the body is Tamaraw-framed, it's [4-byte BE len]
    // [sanitized HTML][zero padding]. Recover the exact HTML by unpadding.
    let html: string;
    if (resp.headers.get('X-Echelon-WF-Framed')) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        const realLen = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
        html = new TextDecoder('utf-8').decode(buf.subarray(4, 4 + realLen));
    } else {
        html = await resp.text();
    }
    return {
        html,
        finalUrl: resp.headers.get('X-Echelon-Final-Url') ?? eepsiteUrl,
        blocked: parseInt(resp.headers.get('X-Echelon-Blocked') ?? '0', 10) || 0,
        scriptsRemoved: parseInt(resp.headers.get('X-Echelon-Scripts-Removed') ?? '0', 10) || 0,
        rewritten: parseInt(resp.headers.get('X-Echelon-Rewritten') ?? '0', 10) || 0,
    };
}
