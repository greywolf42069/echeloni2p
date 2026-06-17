import React, { useCallback, useEffect, useState } from 'react';
import Card from '../ui/Card.tsx';
import {
    useEchelonConfig,
    useGeminiKey,
    useSyncDaemonToken,
    DEFAULT_CONFIG,
    buildI2pConsoleUrl,
    buildSyncDaemonUrl,
} from '../../hooks/useEchelonConfig.ts';
import { useFeatureFlags } from '../../hooks/useFeatureFlags.ts';
import { setFeatureFlag } from '../../featureFlags.ts';
import { clearAllHistory, clearTabSnapshot } from '../../hooks/browserStore.ts';

type ProbeStatus = 'idle' | 'checking' | 'reachable' | 'unreachable';

const StatusDot: React.FC<{ status: ProbeStatus }> = ({ status }) => {
    const cfg = {
        idle:        { color: 'bg-slate-500',  label: 'Not checked' },
        checking:    { color: 'bg-yellow-400 animate-pulse', label: 'Checking…' },
        reachable:   { color: 'bg-green-500',  label: 'Reachable' },
        unreachable: { color: 'bg-red-500',    label: 'Unreachable' },
    }[status];
    return (
        <span className="inline-flex items-center gap-2 text-xs text-gray-300">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
            <span>{cfg.label}</span>
        </span>
    );
};

/** Probe a localhost endpoint with a no-cors HEAD/GET. We can't read the
 *  response body cross-origin, but `fetch` will resolve if the endpoint
 *  exists and reject if the connection is refused. */
async function probeEndpoint(url: string, signal: AbortSignal): Promise<boolean> {
    try {
        await fetch(url, { mode: 'no-cors', signal, cache: 'no-store' });
        return true;
    } catch {
        return false;
    }
}

const Settings: React.FC = () => {
    const { apiKey, setApiKey, clearApiKey, hasKey } = useGeminiKey();
    const { config, updateConfig, resetConfig } = useEchelonConfig();
    const { token: daemonToken, setToken: setDaemonToken, hasToken } = useSyncDaemonToken();

    const [keyInput, setKeyInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    // Local form state mirrors `config` so we can validate before persisting.
    const [form, setForm] = useState(config);
    useEffect(() => setForm(config), [config]);

    const [proxyStatus, setProxyStatus] = useState<ProbeStatus>('idle');
    const [consoleStatus, setConsoleStatus] = useState<ProbeStatus>('idle');
    const [syncStatus, setSyncStatus] = useState<ProbeStatus>('idle');

    const handleSaveKey = () => {
        const trimmed = keyInput.trim();
        if (!trimmed) return;
        setApiKey(trimmed);
        setKeyInput('');
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
    };

    const handleSaveConfig = () => {
        // Coerce numeric ports.
        const numeric = (v: number | string, fallback: number) => {
            const n = typeof v === 'number' ? v : parseInt(String(v), 10);
            return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
        };
        updateConfig({
            i2pdProxyHost:   form.i2pdProxyHost.trim()   || DEFAULT_CONFIG.i2pdProxyHost,
            i2pdConsoleHost: form.i2pdConsoleHost.trim() || DEFAULT_CONFIG.i2pdConsoleHost,
            syncDaemonHost:  form.syncDaemonHost.trim()  || DEFAULT_CONFIG.syncDaemonHost,
            i2pdProxyPort:   numeric(form.i2pdProxyPort,   DEFAULT_CONFIG.i2pdProxyPort),
            i2pdConsolePort: numeric(form.i2pdConsolePort, DEFAULT_CONFIG.i2pdConsolePort),
            syncDaemonPort:  numeric(form.syncDaemonPort,  DEFAULT_CONFIG.syncDaemonPort),
            useHttps:        form.useHttps,
        });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
    };

    const runProbes = useCallback(async () => {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 4000);

        setProxyStatus('checking');
        setConsoleStatus('checking');
        setSyncStatus('checking');

        const [proxyOk, consoleOk, syncOk] = await Promise.all([
            probeEndpoint(`${form.useHttps ? 'https' : 'http'}://${form.i2pdProxyHost}:${form.i2pdProxyPort}/`, ctrl.signal),
            probeEndpoint(buildI2pConsoleUrl(form, ''), ctrl.signal),
            probeEndpoint(buildSyncDaemonUrl(form, 'health'), ctrl.signal),
        ]);

        clearTimeout(timeout);
        setProxyStatus(proxyOk   ? 'reachable' : 'unreachable');
        setConsoleStatus(consoleOk ? 'reachable' : 'unreachable');
        setSyncStatus(syncOk     ? 'reachable' : 'unreachable');
    }, [form]);

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-white">Settings</h1>

            {/* Gemini key */}
            <Card>
                <h2 className="text-xl font-semibold text-white mb-1">Gemini API Key</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Echelon ships with no API key. Get a free key from{' '}
                    <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:underline"
                    >
                        Google AI Studio
                    </a>{' '}
                    and paste it here. It is stored only in this browser
                    (<span className="font-mono">localStorage</span>) and never
                    sent anywhere except directly to Google when you use the
                    AI assistant.
                </p>

                {hasKey ? (
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <code className="flex-1 bg-slate-900 text-gray-300 p-3 rounded-lg font-mono text-sm break-all">
                            {showKey ? apiKey : '•'.repeat(Math.max(8, apiKey.length - 4)) + apiKey.slice(-4)}
                        </code>
                        <button
                            onClick={() => setShowKey(v => !v)}
                            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                        >
                            {showKey ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                            onClick={() => { clearApiKey(); setShowKey(false); }}
                            className="px-4 py-2 text-sm bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition"
                        >
                            Clear
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="password"
                            value={keyInput}
                            onChange={e => setKeyInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                            placeholder="AIza..."
                            className="flex-1 bg-slate-700 text-white p-3 rounded-lg border border-slate-600 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                        />
                        <button
                            onClick={handleSaveKey}
                            disabled={!keyInput.trim()}
                            className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition disabled:bg-slate-600 disabled:cursor-not-allowed"
                        >
                            Save Key
                        </button>
                    </div>
                )}
            </Card>

            {/* i2pd / Termux endpoints */}
            <Card>
                <div className="flex items-start justify-between gap-4 mb-4 flex-col sm:flex-row">
                    <div>
                        <h2 className="text-xl font-semibold text-white mb-1">Local i2pd / Termux Endpoints</h2>
                        <p className="text-sm text-gray-400">
                            Echelon expects a real I2P router (i2pd) and an
                            Echelon sync daemon running locally — typically
                            under{' '}
                            <a
                                href="https://termux.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:underline"
                            >
                                Termux
                            </a>{' '}
                            on the same Android device. See the Termux
                            Quickstart card below.
                        </p>
                    </div>
                    <button
                        onClick={runProbes}
                        className="px-4 py-2 text-sm bg-teal-500/80 hover:bg-teal-500 text-white font-semibold rounded-lg transition flex-shrink-0"
                    >
                        Test connections
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* i2pd HTTP proxy */}
                    <div className="p-4 bg-slate-900/50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white">i2pd HTTP Proxy</h3>
                            <StatusDot status={proxyStatus} />
                        </div>
                        <p className="text-xs text-gray-500">Used to fetch eepsites. i2pd default: 4444.</p>
                        <div className="flex gap-2">
                            <input
                                value={form.i2pdProxyHost}
                                onChange={e => setForm(f => ({ ...f, i2pdProxyHost: e.target.value }))}
                                placeholder="127.0.0.1"
                                className="flex-1 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            />
                            <input
                                type="number"
                                value={form.i2pdProxyPort}
                                onChange={e => setForm(f => ({ ...f, i2pdProxyPort: parseInt(e.target.value || '0', 10) }))}
                                className="w-24 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            />
                        </div>
                    </div>

                    {/* i2pd Web Console */}
                    <div className="p-4 bg-slate-900/50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white">i2pd Web Console</h3>
                            <StatusDot status={consoleStatus} />
                        </div>
                        <p className="text-xs text-gray-500">Used for router status / peer count. i2pd default: 7070.</p>
                        <div className="flex gap-2">
                            <input
                                value={form.i2pdConsoleHost}
                                onChange={e => setForm(f => ({ ...f, i2pdConsoleHost: e.target.value }))}
                                placeholder="127.0.0.1"
                                className="flex-1 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            />
                            <input
                                type="number"
                                value={form.i2pdConsolePort}
                                onChange={e => setForm(f => ({ ...f, i2pdConsolePort: parseInt(e.target.value || '0', 10) }))}
                                className="w-24 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            />
                        </div>
                    </div>

                    {/* Echelon sync daemon */}
                    <div className="p-4 bg-slate-900/50 rounded-lg space-y-2 md:col-span-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white">Echelon Sync Daemon</h3>
                            <StatusDot status={syncStatus} />
                        </div>
                        <p className="text-xs text-gray-500">Tiny local HTTP service that writes eepsite files to disk so i2pd can serve them. Default port: 7071.</p>
                        <div className="flex gap-2">
                            <input
                                value={form.syncDaemonHost}
                                onChange={e => setForm(f => ({ ...f, syncDaemonHost: e.target.value }))}
                                placeholder="127.0.0.1"
                                className="flex-1 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            />
                            <input
                                type="number"
                                value={form.syncDaemonPort}
                                onChange={e => setForm(f => ({ ...f, syncDaemonPort: parseInt(e.target.value || '0', 10) }))}
                                className="w-24 bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            />
                        </div>
                    </div>

                    {/* Sync daemon auth token (enables ECHELON_REQUIRE_AUTH=1) */}
                    <div className="p-4 bg-slate-900/50 rounded-lg space-y-2 md:col-span-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-white">Daemon Auth Token</h3>
                            <span className={`text-xs font-semibold ${hasToken ? 'text-teal-400' : 'text-gray-500'}`}>
                                {hasToken ? 'Set ✓' : 'Not set'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500">
                            Optional but recommended. When the daemon runs with{' '}
                            <code className="text-purple-300">ECHELON_REQUIRE_AUTH=1</code>, only requests
                            carrying this token may publish or change config — so no other app on your
                            device can drive the daemon. Get it once with{' '}
                            <code className="text-teal-300">cat ~/.echelon/secret</code> and paste it here.
                            Stored on-device only.
                        </p>
                        <input
                            type="password"
                            value={daemonToken}
                            onChange={e => setDaemonToken(e.target.value)}
                            placeholder="paste the 64-character token from ~/.echelon/secret"
                            className="w-full bg-slate-700 text-white p-2 rounded-lg border border-slate-600 font-mono text-sm"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                </div>

                <label className="flex items-center gap-2 mt-4 text-sm text-gray-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.useHttps}
                        onChange={e => setForm(f => ({ ...f, useHttps: e.target.checked }))}
                        className="accent-purple-500"
                    />
                    Use HTTPS for local endpoints (only if you've configured TLS on Termux).
                </label>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleSaveConfig}
                        className="flex-1 sm:flex-none px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition"
                    >
                        Save Endpoints
                    </button>
                    <button
                        onClick={() => { resetConfig(); setForm(DEFAULT_CONFIG); }}
                        className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                    >
                        Reset to defaults
                    </button>
                    {savedFlash && (
                        <span className="self-center text-sm text-teal-400">Saved ✓</span>
                    )}
                </div>
            </Card>

            <BrowserPreferences />

            {/* Termux quickstart */}
            <Card>
                <h2 className="text-xl font-semibold text-white mb-2">Termux Quickstart</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Echelon turns your Android phone into a real I2P node + eepsite host using{' '}
                    <a href="https://f-droid.org/en/packages/com.termux/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Termux</a>.
                    Run these commands once inside Termux, then leave Termux running in the background:
                </p>
                <pre className="bg-slate-900 text-teal-300 text-xs sm:text-sm p-4 rounded-lg overflow-x-auto font-mono whitespace-pre">
{`# 1. Install i2pd + Python (one-time)
pkg update -y && pkg install -y i2pd python

# 2. Start the I2P router (HTTP proxy on :4444, web console on :7070)
i2pd --daemon

# 3. Start the Echelon sync daemon on :7071
#    (writes eepsite files Echelon publishes into ~/echelon-eepsites)
python3 -m echelon_sync_daemon

# 4. Open Echelon in your browser and you're done.
#    Echelon talks to 127.0.0.1:4444 (i2pd) and 127.0.0.1:7071 (sync).`}
                </pre>
                <p className="text-xs text-gray-500 mt-3">
                    The sync daemon source is shipped with Echelon at{' '}
                    <code className="text-purple-300">scripts/echelon_sync_daemon.py</code>.
                    Copy it into Termux with{' '}
                    <code className="text-purple-300">termux-setup-storage</code>{' '}
                    or paste it directly.
                </p>
            </Card>
        </div>
    );
};

export default Settings;

// ── Browser Preferences sub-card ─────────────────────────────────────

const BrowserPreferences: React.FC = () => {
    const flags = useFeatureFlags();
    const [busy, setBusy] = useState(false);
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    const onClearHistory = async () => {
        setBusy(true);
        await clearAllHistory();
        setBusy(false);
        setToastMsg('Browsing history cleared.');
        setTimeout(() => setToastMsg(null), 2500);
    };

    const onClearTabs = async () => {
        setBusy(true);
        await clearTabSnapshot();
        setBusy(false);
        setToastMsg('Saved tab snapshot cleared.');
        setTimeout(() => setToastMsg(null), 2500);
    };

    return (
        <Card>
            <h2 className="text-xl font-semibold text-white mb-2">Browser Preferences</h2>
            <p className="text-sm text-gray-400 mb-4">
                Echelon's privacy defaults are paranoid. These toggles let you trade some privacy
                for convenience — both default to OFF.
            </p>
            <div className="space-y-4">
                <PrefRow
                    title="Save browsing history"
                    description="When on, Echelon saves the URLs and titles you visit to local IndexedDB. Off by default — your browsing leaves no trace on the device."
                    enabled={flags.saveBrowsingHistory}
                    onToggle={v => setFeatureFlag('saveBrowsingHistory', v)}
                    extra={
                        flags.saveBrowsingHistory && (
                            <button
                                onClick={onClearHistory}
                                disabled={busy}
                                className="text-xs text-red-300 hover:text-red-200 underline mt-1"
                            >
                                Clear all saved history
                            </button>
                        )
                    }
                />
                <PrefRow
                    title="Restore tabs across launches"
                    description="When on, Echelon saves your open tabs and reopens them when you relaunch. Off by default — tabs evaporate at exit."
                    enabled={flags.restoreTabs}
                    onToggle={v => setFeatureFlag('restoreTabs', v)}
                    extra={
                        flags.restoreTabs && (
                            <button
                                onClick={onClearTabs}
                                disabled={busy}
                                className="text-xs text-red-300 hover:text-red-200 underline mt-1"
                            >
                                Clear saved tab snapshot
                            </button>
                        )
                    }
                />
            </div>
            {toastMsg && (
                <p className="mt-3 text-xs text-teal-300" role="status">{toastMsg}</p>
            )}
        </Card>
    );
};

const PrefRow: React.FC<{
    title: string;
    description: string;
    enabled: boolean;
    onToggle: (v: boolean) => void;
    extra?: React.ReactNode;
}> = ({ title, description, enabled, onToggle, extra }) => (
    <div className="flex items-start justify-between gap-4 p-3 bg-slate-900/40 rounded-lg">
        <div className="flex-1">
            <p className="font-semibold text-white">{title}</p>
            <p className="text-xs text-gray-400 mt-1">{description}</p>
            {extra}
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
            <input
                type="checkbox"
                checked={enabled}
                onChange={e => onToggle(e.target.checked)}
                className="sr-only peer"
                aria-label={title}
            />
            <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
        </label>
    </div>
);
