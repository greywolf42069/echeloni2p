import React, { useState } from 'react';
import Card from '../ui/Card.tsx';
import type { Page } from '../../types';
import { useI2pRouterHealth } from '../../hooks/useI2pRouterHealth.ts';
import { useEchelonConfig, buildSyncDaemonUrl } from '../../hooks/useEchelonConfig.ts';
import { probeSyncDaemon } from '../../hooks/syncDaemonClient.ts';

interface NativeConnectProps {
    setPage: (page: Page) => void;
}

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

interface Step {
    title: string;
    body: React.ReactNode;
    code: string;
}

const NativeConnect: React.FC<NativeConnectProps> = ({ setPage }) => {
    const { config } = useEchelonConfig();
    const { status: routerStatus, refresh: refreshRouter } = useI2pRouterHealth(8000);
    const [syncStatus, setSyncStatus] = useState<'unknown' | 'reachable' | 'unreachable'>('unknown');
    const [copied, setCopied] = useState<number | null>(null);

    const probeSync = async () => {
        setSyncStatus('unknown');
        const ok = await probeSyncDaemon(config);
        setSyncStatus(ok ? 'reachable' : 'unreachable');
    };

    const copy = (text: string, idx: number) => {
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(idx);
            setTimeout(() => setCopied(null), 1200);
        }).catch(() => { /* noop */ });
    };

    const steps: Step[] = [
        {
            title: '1. Install Termux',
            body: (
                <>Get Termux from{' '}
                    <a href="https://f-droid.org/en/packages/com.termux/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">F-Droid</a>{' '}
                    (the Play Store version is outdated). Open it, then:
                </>
            ),
            code: 'pkg update -y && pkg upgrade -y',
        },
        {
            title: '2. Install i2pd and Python',
            body: <>Echelon talks to <code className="text-teal-300">i2pd</code> for real I2P routing and a tiny Python service for publishing eepsite files.</>,
            code: 'pkg install -y i2pd python',
        },
        {
            title: '3. Start the I2P router',
            body: (
                <>Runs in the background. The HTTP proxy listens on{' '}
                    <code className="text-teal-300">{config.i2pdProxyHost}:{config.i2pdProxyPort}</code>{' '}
                    and the web console on{' '}
                    <code className="text-teal-300">{config.i2pdConsoleHost}:{config.i2pdConsolePort}</code>.
                </>
            ),
            code: 'i2pd --daemon',
        },
        {
            title: '4. Start the Echelon sync daemon',
            body: (
                <>This is what makes Echelon's “Publish” button actually write your eepsite files
                    to disk where i2pd can serve them. Source ships with the app at{' '}
                    <code className="text-purple-300">scripts/echelon_sync_daemon.py</code>.
                </>
            ),
            code: 'python3 scripts/echelon_sync_daemon.py',
        },
        {
            title: '5. Verify',
            body: <>Click <em>Re-check</em> below — both dots should turn green. Then open the Protect page and your router status will show as running.</>,
            code: `curl ${buildSyncDaemonUrl(config, 'health')}`,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Termux Quickstart</h1>
                <p className="text-gray-400 mt-1">
                    Echelon is designed to run alongside <code className="text-teal-300">i2pd</code> on
                    your phone. Five commands and you're a real I2P node + eepsite host.
                </p>
            </div>

            {/* Live status panel */}
            <Card>
                <h2 className="text-lg font-semibold text-white mb-3">Live status</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-900/50 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className={`w-3 h-3 rounded-full ${
                                routerStatus === 'running' ? 'bg-green-500'
                                : routerStatus === 'down' ? 'bg-red-500'
                                : 'bg-yellow-400 animate-pulse'
                            }`} />
                            <div>
                                <p className="font-semibold text-white text-sm">i2pd router</p>
                                <p className="text-xs text-gray-400 font-mono">{config.i2pdConsoleHost}:{config.i2pdConsolePort}</p>
                            </div>
                        </div>
                        <button
                            onClick={refreshRouter}
                            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-200 rounded transition"
                        >
                            Re-check
                        </button>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className={`w-3 h-3 rounded-full ${
                                syncStatus === 'reachable' ? 'bg-green-500'
                                : syncStatus === 'unreachable' ? 'bg-red-500'
                                : 'bg-slate-500'
                            }`} />
                            <div>
                                <p className="font-semibold text-white text-sm">Sync daemon</p>
                                <p className="text-xs text-gray-400 font-mono">{config.syncDaemonHost}:{config.syncDaemonPort}</p>
                            </div>
                        </div>
                        <button
                            onClick={probeSync}
                            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-gray-200 rounded transition"
                        >
                            Re-check
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                    Endpoints can be changed in{' '}
                    <button onClick={() => setPage('settings')} className="text-purple-400 hover:underline">Settings</button>.
                </p>
            </Card>

            {/* Steps */}
            <Card>
                <ol className="space-y-5">
                    {steps.map((step, idx) => (
                        <li key={idx} className="flex flex-col gap-2">
                            <h3 className="text-white font-semibold">{step.title}</h3>
                            <p className="text-sm text-gray-400">{step.body}</p>
                            <div className="relative">
                                <pre className="text-xs text-teal-300 bg-slate-950 p-3 pr-20 rounded font-mono whitespace-pre-wrap break-all overflow-x-auto">{step.code}</pre>
                                <button
                                    onClick={() => copy(step.code, idx)}
                                    className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded"
                                >
                                    <CopyIcon />
                                    {copied === idx ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </li>
                    ))}
                </ol>
            </Card>

            <Card>
                <h2 className="text-lg font-semibold text-white mb-2">Next: publish an eepsite</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Open the Eepsite Hosting page, edit your site in the in-browser IDE, click{' '}
                    <span className="text-teal-300 font-semibold">Publish</span>, and the sync daemon writes
                    your files into <code className="text-teal-300">~/echelon-eepsites/&lt;site&gt;.i2p/</code>.
                    Configure i2pd to serve that directory and you're live on I2P.
                </p>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setPage('eepsite-hosting')}
                        className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
                    >
                        Eepsite Hosting →
                    </button>
                    <button
                        onClick={() => setPage('protect')}
                        className="px-5 py-2 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                    >
                        Protect Hub →
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default NativeConnect;
