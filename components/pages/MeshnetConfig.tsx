import React, { useCallback, useEffect, useState } from 'react';
import Card from '../ui/Card.tsx';
import type { Page } from '../../types';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import {
    I2pdConfigError,
    type I2pdConfigValues,
    getI2pdConfig,
    setI2pdConfig,
} from '../../hooks/i2pdConfigClient.ts';

interface MeshnetConfigProps {
    setPage: (page: Page) => void;
    showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface FormState {
    bandwidth: string;          // L | O | P | X (or numeric KBps as string)
    share: string;              // "0" .. "100"
    transitEnabled: boolean;    // inverse of notransit
    floodfillEnabled: boolean;
}

const DEFAULT_FORM: FormState = {
    bandwidth: 'X',
    share: '50',
    transitEnabled: true,
    floodfillEnabled: false,
};

const BANDWIDTH_TIERS: Array<{ value: string; label: string; rate: string }> = [
    { value: 'L', label: 'L — Low',      rate: '32 KB/s' },
    { value: 'O', label: 'O — Standard', rate: '256 KB/s' },
    { value: 'P', label: 'P — High',     rate: '2 MB/s' },
    { value: 'X', label: 'X — Unlimited', rate: 'no cap' },
];

function formStateToValues(form: FormState): I2pdConfigValues {
    return {
        bandwidth: form.bandwidth.trim(),
        share: form.share.trim(),
        notransit: form.transitEnabled ? 'false' : 'true',
        floodfill: form.floodfillEnabled ? 'true' : 'false',
    };
}

function valuesToFormState(values: I2pdConfigValues): FormState {
    const isTrue = (v?: string) => !!v && /^(true|1|yes)$/i.test(v.trim());
    return {
        bandwidth: values.bandwidth ?? DEFAULT_FORM.bandwidth,
        share: values.share ?? DEFAULT_FORM.share,
        transitEnabled: !isTrue(values.notransit),
        floodfillEnabled: isTrue(values.floodfill),
    };
}

const MeshnetConfig: React.FC<MeshnetConfigProps> = ({ setPage, showToast }) => {
    const { config: endpointConfig } = useEchelonConfig();
    const [form, setForm] = useState<FormState>(DEFAULT_FORM);
    const [configPath, setConfigPath] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await getI2pdConfig(endpointConfig);
            setConfigPath(resp.configPath);
            setForm(valuesToFormState(resp.values));
        } catch (e) {
            const msg = e instanceof I2pdConfigError ? e.message : 'Could not load i2pd config.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [endpointConfig]);

    useEffect(() => {
        reload();
    }, [reload]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const result = await setI2pdConfig(endpointConfig, formStateToValues(form));
            showToast?.(`Saved ${result.writtenCount ?? 4} setting(s) to ${result.configPath}.`, 'success');
            setForm(valuesToFormState(result.values));
        } catch (e) {
            const msg = e instanceof I2pdConfigError ? e.message : 'Could not save i2pd config.';
            setError(msg);
            showToast?.(msg, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Meshnet Contribution</h1>
                <p className="text-gray-400 mt-1">
                    Tune how much bandwidth, transit traffic, and routing duty
                    your i2pd node carries for the network.
                </p>
            </div>

            {error && (
                <Card className="!p-4 border border-red-500/40 bg-red-500/10">
                    <p className="text-sm text-red-200 font-semibold">{error}</p>
                    <p className="text-xs text-red-200/80 mt-1">
                        Make sure the Echelon sync daemon and i2pd are both running. See{' '}
                        <button
                            onClick={() => setPage('native')}
                            className="underline hover:text-red-100"
                        >
                            Termux quickstart
                        </button>.
                    </p>
                </Card>
            )}

            {configPath && (
                <p className="text-xs text-gray-500 font-mono">i2pd.conf: {configPath}</p>
            )}

            <Card>
                <h2 className="text-lg font-semibold text-white mb-1">Bandwidth class</h2>
                <p className="text-sm text-gray-400 mb-4">
                    i2pd's per-second bandwidth cap. Higher tiers carry more transit traffic
                    for other peers but use more battery / data.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BANDWIDTH_TIERS.map(tier => (
                        <label
                            key={tier.value}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                form.bandwidth === tier.value
                                    ? 'bg-purple-600/30 border-purple-500'
                                    : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
                            }`}
                        >
                            <input
                                type="radio"
                                name="bandwidth"
                                value={tier.value}
                                checked={form.bandwidth === tier.value}
                                onChange={() => setForm(f => ({ ...f, bandwidth: tier.value }))}
                                className="accent-purple-500"
                            />
                            <div className="flex-1">
                                <p className="font-semibold text-white text-sm">{tier.label}</p>
                                <p className="text-xs text-gray-400">{tier.rate}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </Card>

            <Card>
                <h2 className="text-lg font-semibold text-white mb-1">Share ratio</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Percentage of your bandwidth offered to other peers as transit
                    capacity. Higher = more contribution, more battery.
                </p>
                <div className="flex items-center gap-4">
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={parseInt(form.share, 10) || 0}
                        onChange={e => setForm(f => ({ ...f, share: e.target.value }))}
                        className="flex-1 accent-purple-500"
                        aria-label="Share percentage"
                    />
                    <span className="font-mono text-white w-14 text-right">{form.share}%</span>
                </div>
            </Card>

            <Card>
                <h2 className="text-lg font-semibold text-white mb-3">Roles</h2>
                <div className="space-y-3">
                    <label className="flex items-center justify-between gap-4 p-3 bg-slate-900/40 rounded-lg cursor-pointer">
                        <div>
                            <p className="font-semibold text-white">Allow transit traffic</p>
                            <p className="text-xs text-gray-400">
                                Relay other peers' tunnels through your node. Off = leecher mode.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={form.transitEnabled}
                            onChange={e => setForm(f => ({ ...f, transitEnabled: e.target.checked }))}
                            className="w-5 h-5 accent-purple-500"
                            aria-label="Allow transit traffic"
                        />
                    </label>
                    <label className="flex items-center justify-between gap-4 p-3 bg-slate-900/40 rounded-lg cursor-pointer">
                        <div>
                            <p className="font-semibold text-white">Run as floodfill router</p>
                            <p className="text-xs text-gray-400">
                                Help store + serve the I2P network database. Higher CPU/RAM cost,
                                but valuable to the network.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={form.floodfillEnabled}
                            onChange={e => setForm(f => ({ ...f, floodfillEnabled: e.target.checked }))}
                            className="w-5 h-5 accent-purple-500"
                            aria-label="Run as floodfill"
                        />
                    </label>
                </div>
            </Card>

            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white font-semibold rounded-lg transition"
                >
                    {saving ? 'Saving…' : 'Save & restart i2pd suggested'}
                </button>
                <button
                    onClick={reload}
                    disabled={loading}
                    className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                >
                    {loading ? 'Loading…' : 'Reload from disk'}
                </button>
                <button
                    onClick={() => setPage('protect')}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg transition"
                >
                    Back to Protect
                </button>
            </div>

            <p className="text-xs text-gray-500">
                Changes are written to <code className="text-purple-300">~/.i2pd/i2pd.conf</code>.
                Restart i2pd in Termux for them to take effect:{' '}
                <code className="text-teal-300">pkill i2pd && i2pd --daemon</code>.
            </p>
        </div>
    );
};

export default MeshnetConfig;
