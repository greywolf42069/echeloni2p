import React, { useCallback, useEffect, useState } from 'react';
import Card from '../ui/Card.tsx';
import type { Page } from '../../types';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import {
    OutproxyClientError,
    type OutproxyMode,
    type OutproxySpec,
    getOutproxy,
    setOutproxy,
} from '../../hooks/outproxyClient.ts';

interface OutproxyConfigProps {
    setPage: (page: Page) => void;
    showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_SPEC: OutproxySpec = {
    mode: 'disabled',
    upstream_host: '127.0.0.1',
    http_upstream_port: 8118,
    socks_upstream_port: 1080,
    advertise: false,
};

const MODE_OPTIONS: Array<{ value: OutproxyMode; label: string; sub: string }> = [
    { value: 'disabled', label: 'Disabled',           sub: 'No outproxy stanzas in tunnels.conf.' },
    { value: 'http',     label: 'HTTP only',          sub: 'Expose an I2P → HTTP gateway.' },
    { value: 'socks',    label: 'SOCKS only',         sub: 'Expose an I2P → SOCKS gateway.' },
    { value: 'both',     label: 'HTTP + SOCKS',       sub: 'Both gateway types simultaneously.' },
];

const OutproxyConfig: React.FC<OutproxyConfigProps> = ({ setPage, showToast }) => {
    const { config: endpointConfig } = useEchelonConfig();
    const [spec, setSpec] = useState<OutproxySpec>(DEFAULT_SPEC);
    const [tunnelsPath, setTunnelsPath] = useState<string | null>(null);
    const [lockedBindHost, setLockedBindHost] = useState<string>('127.0.0.1');
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await getOutproxy(endpointConfig);
            setSpec(resp.spec);
            setTunnelsPath(resp.tunnelsPath);
            setLockedBindHost(resp.lockedBindHost);
        } catch (e) {
            const msg = e instanceof OutproxyClientError ? e.message : 'Could not load outproxy config.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [endpointConfig]);

    useEffect(() => { reload(); }, [reload]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const result = await setOutproxy(endpointConfig, {
                mode: spec.mode,
                upstream_host: spec.upstream_host,
                http_upstream_port: spec.http_upstream_port,
                socks_upstream_port: spec.socks_upstream_port,
                advertise: spec.advertise,
            });
            setSpec(result.spec);
            setTunnelsPath(result.tunnelsPath);
            const verb = result.spec.mode === 'disabled' ? 'disabled' : 'updated';
            showToast?.(`Outproxy ${verb}. Restart i2pd to apply.`, 'success');
        } catch (e) {
            const msg = e instanceof OutproxyClientError ? e.message : 'Could not save outproxy config.';
            setError(msg);
            showToast?.(msg, 'error');
        } finally {
            setSaving(false);
        }
    };

    const isEnabled = spec.mode !== 'disabled';
    const showHttp = spec.mode === 'http' || spec.mode === 'both';
    const showSocks = spec.mode === 'socks' || spec.mode === 'both';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Outproxy</h1>
                <p className="text-gray-400 mt-1">
                    Run an I2P → clearnet gateway that other I2P users can route through.
                    Echelon writes a managed block into{' '}
                    <code className="text-teal-300">~/.i2pd/tunnels.conf</code>; your hand-written
                    tunnels are never modified.
                </p>
            </div>

            {error && (
                <Card className="!p-4 border border-red-500/40 bg-red-500/10">
                    <p className="text-sm text-red-200 font-semibold">{error}</p>
                    <p className="text-xs text-red-200/80 mt-1">
                        Make sure the Echelon sync daemon is running. See{' '}
                        <button onClick={() => setPage('native')} className="underline hover:text-red-100">
                            Termux quickstart
                        </button>.
                    </p>
                </Card>
            )}

            {tunnelsPath && (
                <p className="text-xs text-gray-500 font-mono">tunnels.conf: {tunnelsPath}</p>
            )}

            <Card>
                <div className="flex items-start gap-3 mb-4">
                    <div className="flex-shrink-0 w-1 h-12 bg-yellow-500/60 rounded" />
                    <div>
                        <p className="text-yellow-200 font-semibold text-sm">
                            i2pd does not perform clearnet egress on its own.
                        </p>
                        <p className="text-xs text-yellow-200/80 mt-1">
                            You must run a backend clearnet proxy (Privoxy / 3proxy / Squid) bound to{' '}
                            <code className="text-yellow-100">{lockedBindHost}</code> on the upstream port
                            below. Echelon's i2pd tunnel forwards incoming I2P connections to that
                            backend.
                        </p>
                    </div>
                </div>

                <h2 className="text-lg font-semibold text-white mb-3">Mode</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MODE_OPTIONS.map(opt => (
                        <label
                            key={opt.value}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                spec.mode === opt.value
                                    ? 'bg-purple-600/30 border-purple-500'
                                    : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
                            }`}
                        >
                            <input
                                type="radio"
                                name="outproxy-mode"
                                value={opt.value}
                                checked={spec.mode === opt.value}
                                onChange={() => setSpec(s => ({ ...s, mode: opt.value }))}
                                className="accent-purple-500 mt-1"
                            />
                            <div>
                                <p className="font-semibold text-white text-sm">{opt.label}</p>
                                <p className="text-xs text-gray-400">{opt.sub}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </Card>

            {isEnabled && (
                <Card>
                    <h2 className="text-lg font-semibold text-white mb-1">Backend clearnet proxy</h2>
                    <p className="text-sm text-gray-400 mb-3">
                        Where i2pd should forward incoming I2P traffic. Bind host is locked to{' '}
                        <code className="text-teal-300">{lockedBindHost}</code> for safety —
                        the backend is never exposed beyond loopback.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-900/50 rounded-lg space-y-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Bind host (locked)</p>
                            <input
                                type="text"
                                value={lockedBindHost}
                                disabled
                                className="w-full bg-slate-950 text-gray-300 p-2 rounded font-mono text-sm border border-slate-800 cursor-not-allowed"
                            />
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded-lg space-y-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Upstream host</p>
                            <input
                                type="text"
                                value={spec.upstream_host}
                                onChange={e => setSpec(s => ({ ...s, upstream_host: e.target.value }))}
                                className="w-full bg-slate-700 text-white p-2 rounded border border-slate-600 font-mono text-sm"
                                placeholder="127.0.0.1"
                            />
                        </div>
                        {showHttp && (
                            <div className="p-3 bg-slate-900/50 rounded-lg space-y-2">
                                <p className="text-xs text-gray-400 uppercase tracking-wider">HTTP upstream port</p>
                                <input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={spec.http_upstream_port}
                                    onChange={e => setSpec(s => ({ ...s, http_upstream_port: parseInt(e.target.value || '0', 10) }))}
                                    className="w-full bg-slate-700 text-white p-2 rounded border border-slate-600 font-mono text-sm"
                                    aria-label="HTTP upstream port"
                                />
                                <p className="text-[11px] text-gray-500">Privoxy default: 8118</p>
                            </div>
                        )}
                        {showSocks && (
                            <div className="p-3 bg-slate-900/50 rounded-lg space-y-2">
                                <p className="text-xs text-gray-400 uppercase tracking-wider">SOCKS upstream port</p>
                                <input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={spec.socks_upstream_port}
                                    onChange={e => setSpec(s => ({ ...s, socks_upstream_port: parseInt(e.target.value || '0', 10) }))}
                                    className="w-full bg-slate-700 text-white p-2 rounded border border-slate-600 font-mono text-sm"
                                    aria-label="SOCKS upstream port"
                                />
                                <p className="text-[11px] text-gray-500">Generic SOCKS default: 1080</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {isEnabled && (
                <Card>
                    <label className="flex items-start justify-between gap-4 p-3 bg-slate-900/40 rounded-lg cursor-pointer">
                        <div>
                            <p className="font-semibold text-white">Advertise destination to netDb</p>
                            <p className="text-xs text-gray-400 mt-1">
                                Off by default. When on, your outproxy's <code className="text-teal-300">.b32</code>{' '}
                                destination is published — anyone on I2P can find it. Off keeps the gateway
                                private (only people you share the address with can use it).
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={spec.advertise}
                            onChange={e => setSpec(s => ({ ...s, advertise: e.target.checked }))}
                            className="w-5 h-5 accent-purple-500 mt-1"
                            aria-label="Advertise destination"
                        />
                    </label>
                </Card>
            )}

            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white font-semibold rounded-lg transition"
                >
                    {saving ? 'Saving…' : (spec.mode === 'disabled' ? 'Disable outproxy' : 'Save outproxy config')}
                </button>
                <button
                    onClick={reload}
                    disabled={loading}
                    className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                >
                    {loading ? 'Loading…' : 'Reload'}
                </button>
                <button
                    onClick={() => setPage('protect')}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg transition"
                >
                    Back to Protect
                </button>
            </div>

            <p className="text-xs text-gray-500">
                Changes take effect after restarting i2pd:{' '}
                <code className="text-teal-300">pkill i2pd && i2pd --daemon</code>.
                Once running, your outproxy's <code className="text-teal-300">.b32</code> destination
                is in <code className="text-teal-300">~/.i2pd/echelon-outproxy-*.dat</code>.
            </p>
        </div>
    );
};

export default OutproxyConfig;
