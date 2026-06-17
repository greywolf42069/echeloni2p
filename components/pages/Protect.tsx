import React, { useState } from 'react';
import Card from '../ui/Card.tsx';
import ThreatLogCard from '../ThreatIntelCard.tsx';
import EepsiteHostingCard from '../EepsiteHostingCard.tsx';
import MeshnetStatus from '../MeshnetStatus.tsx';
import ProtectionBanner from '../ProtectionBanner.tsx';
import type { Page, Eepsite } from '../../types';
import { useI2pRouterHealth } from '../../hooks/useI2pRouterHealth.ts';
import { useI2pStats } from '../../hooks/useI2pStats.ts';
import { useFilterEvents } from '../../hooks/useFilterEvents.ts';

interface ProtectProps {
    setPage: (page: Page) => void;
    eepsites: Eepsite[];
}

const ArrowRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
);
const ExternalIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
);
const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const TERMUX_START = `# Inside Termux:
i2pd --daemon
python3 echelon_sync_daemon.py &`;

const TERMUX_STOP = `# Inside Termux:
pkill i2pd
pkill -f echelon_sync_daemon`;

const Protect: React.FC<ProtectProps> = ({ setPage, eepsites }) => {
    const { status, consoleUrl, lastCheckedAt, config, refresh } = useI2pRouterHealth(5000);
    const { stats } = useI2pStats(5000);
    const { events: blockEvents, error: filterError, headSeq } = useFilterEvents({ intervalMs: 5000, maxEvents: 50 });
    const [copied, setCopied] = useState<string | null>(null);

    const copy = (text: string, key: string) => {
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1200);
        }).catch(() => { /* clipboard may be blocked in iframes */ });
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-white">Protection Hub</h1>

            {/* VPN-style intelligent scanner — local posture, no beacon. */}
            <ProtectionBanner setPage={setPage} />

            {/* Live router health */}
            <Card>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className={`w-3.5 h-3.5 rounded-full ${
                            status === 'running' ? 'bg-green-500'
                            : status === 'down' ? 'bg-red-500'
                            : 'bg-yellow-400 animate-pulse'
                        }`} />
                        <div>
                            <p className="text-lg font-semibold text-white">
                                {status === 'running' && 'i2pd router is running'}
                                {status === 'down'    && 'i2pd router is down'}
                                {status === 'unknown' && 'Checking router…'}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Web console: <code className="text-purple-300">{config.i2pdConsoleHost}:{config.i2pdConsolePort}</code>
                                {lastCheckedAt && (
                                    <> · last checked {lastCheckedAt.toLocaleTimeString()}</>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={refresh}
                            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg transition"
                        >
                            Refresh
                        </button>
                        <a
                            href={consoleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition inline-flex items-center gap-1
                                ${status === 'running'
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                    : 'bg-slate-700/50 text-gray-500 cursor-not-allowed pointer-events-none'}`}
                        >
                            Open console <ExternalIcon />
                        </a>
                    </div>
                </div>
            </Card>

            <EepsiteHostingCard eepsites={eepsites} setPage={setPage} />

            {/* Real meshnet stats from the local sync daemon. Stays
                hidden until the daemon has scraped a real i2pd at least
                once — no fake numbers. */}
            {stats.running && <MeshnetStatus stats={stats} />}

            <ThreatLogCard events={blockEvents} error={filterError} headSeq={headSeq} />

            <Card>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Network Contributions</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            View your data relay rewards and track the network's emission schedule.
                        </p>
                    </div>
                    <button
                        onClick={() => setPage('emissions')}
                        className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition bg-teal-500 hover:bg-teal-600 text-white"
                    >
                        <span>View Emissions</span>
                        <ArrowRightIcon />
                    </button>
                </div>
            </Card>

            <Card>
                <h2 className="text-xl font-semibold text-white mb-2">Router Controls (Termux)</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Echelon does not embed an I2P implementation in the browser — it talks to a
                    real <code className="text-teal-300">i2pd</code> running on this device via Termux.
                    Use these copyable commands to start or stop it.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-white">Start router</h3>
                            <button
                                onClick={() => copy(TERMUX_START, 'start')}
                                className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200"
                            >
                                <CopyIcon />
                                {copied === 'start' ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <pre className="text-xs text-teal-300 bg-slate-950 p-3 rounded font-mono whitespace-pre overflow-x-auto">{TERMUX_START}</pre>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-white">Stop router</h3>
                            <button
                                onClick={() => copy(TERMUX_STOP, 'stop')}
                                className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200"
                            >
                                <CopyIcon />
                                {copied === 'stop' ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <pre className="text-xs text-teal-300 bg-slate-950 p-3 rounded font-mono whitespace-pre overflow-x-auto">{TERMUX_STOP}</pre>
                    </div>
                </div>

                <button
                    onClick={() => setPage('native')}
                    className="mt-4 px-4 py-2 text-sm bg-slate-700/50 hover:bg-slate-700 text-gray-200 rounded-lg transition"
                >
                    Full Termux quickstart →
                </button>
            </Card>

            <Card>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Network Doctor</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Eepsites not loading? Diagnose i2pd connectivity + NAT issues and get
                            a copy-paste fix (the Yggdrasil setup for tricky / cellular networks).
                        </p>
                    </div>
                    <button
                        onClick={() => setPage('network-doctor')}
                        className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition bg-teal-600 hover:bg-teal-700 text-white"
                    >
                        Diagnose
                    </button>
                </div>
            </Card>

            <Card>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Meshnet Contribution</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Choose how much bandwidth + transit traffic your node carries
                            for the network. Reads + writes <code className="text-teal-300">~/.i2pd/i2pd.conf</code>.
                        </p>
                    </div>
                    <button
                        onClick={() => setPage('meshnet-config')}
                        className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        Configure
                    </button>
                </div>
            </Card>

            <Card>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Outproxy</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Run an I2P → clearnet gateway that other I2P users can route through.
                            Requires a backend clearnet proxy (Privoxy / 3proxy / Squid). Off by default.
                        </p>
                    </div>
                    <button
                        onClick={() => setPage('outproxy-config')}
                        className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        Configure
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default Protect;
