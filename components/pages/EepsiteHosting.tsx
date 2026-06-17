import React, { useCallback, useEffect, useState } from 'react';
import Card from '../ui/Card.tsx';
import Banner from '../ui/Banner.tsx';
import type { Eepsite, EepsiteStatus } from '../../types';
import { useEchelonConfig } from '../../hooks/useEchelonConfig.ts';
import {
    publishEepsiteToDaemon,
    unpublishEepsiteFromDaemon,
    probeSyncDaemon,
    SyncDaemonError,
} from '../../hooks/syncDaemonClient.ts';
import {
    enqueuePublish,
    flushPublishQueue,
    queueLength,
} from '../../hooks/publishQueue.ts';
import { exportEepsiteAsZip, exportAllEepsitesAsZip } from '../../utils/eepsiteExport.ts';

interface EepsiteHostingProps {
    eepsites: Eepsite[];
    onToggleStatus: (id: string, nextStatus: EepsiteStatus) => void;
    onDelete: (id: string) => void;
    onEdit: (eepsite: Eepsite) => void;
    onAddNew: () => void;
    onOpenEditor: (eepsite: Eepsite) => void;
    showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// Icons
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const GlobeAltIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 009-9m-9 9a9 9 0 00-9-9" /></svg>;
const CodeBracketIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const PublishIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12l-2 0m4 0l-2 0m13 0h-2M3 19h18M3 5h18M5 9l3 3-3 3M19 9l-3 3 3 3" /></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;


const StatusIndicator: React.FC<{ status: EepsiteStatus }> = ({ status }) => {
    const config = {
        Online: { text: 'Published', color: 'bg-green-500' },
        Offline: { text: 'Unpublished', color: 'bg-slate-500' },
        Error: { text: 'Error', color: 'bg-red-500' },
    };
    return (
        <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config[status].color} opacity-75 ${status !== 'Online' && 'hidden'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${config[status].color}`}></span>
            </span>
            <span className="text-sm font-semibold text-gray-300">{config[status].text}</span>
        </div>
    );
};

interface EepsiteCardProps {
    eepsite: Eepsite;
    onToggleStatus: (next: EepsiteStatus) => void;
    onDelete: () => void;
    onOpenEditor: () => void;
    onPublish: () => Promise<void>;
    onExport: () => void;
    isBusy: boolean;
}

const EepsiteCard: React.FC<EepsiteCardProps> = ({
    eepsite, onToggleStatus, onDelete, onOpenEditor, onPublish, onExport, isBusy,
}) => {
    return (
        <Card className="!p-0 flex flex-col">
            <div className="p-4 flex-grow">
                <div className="flex justify-between items-start gap-2">
                    <h3 className="font-mono text-lg text-purple-300 break-all">{eepsite.name}</h3>
                    <StatusIndicator status={eepsite.status} />
                </div>
                <div className="mt-2 text-sm text-gray-400">
                    <span className="font-semibold text-gray-500">Local path: </span>
                    <span className="font-mono break-all">{eepsite.localDirectory}</span>
                </div>
            </div>
            <div className="bg-slate-900/40 p-3 border-t border-slate-700/50 flex items-center justify-between gap-2 flex-wrap">
                <label
                    className="relative inline-flex items-center cursor-pointer"
                    title={
                        eepsite.status === 'Error'
                            ? 'Last sync failed — open editor and try Publish'
                            : eepsite.status === 'Online'
                                ? 'Unpublish from local sync daemon'
                                : 'Publish to local sync daemon'
                    }
                >
                    <input
                        type="checkbox"
                        checked={eepsite.status === 'Online'}
                        disabled={isBusy}
                        onChange={() => onToggleStatus(eepsite.status === 'Online' ? 'Offline' : 'Online')}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 peer-disabled:opacity-50"></div>
                </label>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onPublish}
                        disabled={isBusy}
                        className="p-2 bg-teal-500/30 hover:bg-teal-500/50 rounded-md transition-colors text-teal-200 disabled:opacity-50"
                        title="Publish to local Termux sync daemon"
                    >
                        <PublishIcon />
                    </button>
                    <button onClick={onOpenEditor} className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors text-gray-300" title="Open Editor">
                        <CodeBracketIcon />
                    </button>
                    <button onClick={onExport} className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors text-blue-400" title="Download source as ZIP">
                        <DownloadIcon />
                    </button>
                    <button onClick={onDelete} className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-md transition-colors text-red-400" title="Delete">
                        <TrashIcon />
                    </button>
                </div>
            </div>
        </Card>
    );
};

const EepsiteHosting: React.FC<EepsiteHostingProps> = ({
    eepsites, onToggleStatus, onDelete, onEdit, onAddNew, onOpenEditor, showToast,
}) => {
    const { config } = useEchelonConfig();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [pendingCount, setPendingCount] = useState(0);

    const refreshQueue = useCallback(() => {
        void queueLength().then(setPendingCount);
    }, []);

    // On mount + every 15s, if there are queued publishes, probe the
    // daemon and flush when it's reachable. This is the in-app safety
    // net; the SW Background Sync handles the app-closed case.
    useEffect(() => {
        refreshQueue();
        let cancelled = false;
        const tryFlush = async () => {
            const n = await queueLength();
            if (cancelled || n === 0) return;
            const up = await probeSyncDaemon(config);
            if (cancelled || !up) return;
            const result = await flushPublishQueue(config);
            if (cancelled) return;
            if (result.flushed.length > 0) {
                showToast?.(`Published ${result.flushed.length} queued eepsite(s).`, 'success');
            }
            refreshQueue();
        };
        void tryFlush();
        const handle = window.setInterval(tryFlush, 15000);
        return () => { cancelled = true; clearInterval(handle); };
    }, [config, refreshQueue, showToast]);

    const handlePublish = async (eepsite: Eepsite) => {
        setBusyId(eepsite.id);
        try {
            const result = await publishEepsiteToDaemon(config, eepsite);
            onToggleStatus(eepsite.id, 'Online');
            showToast?.(`Published ${result.writtenCount} file(s) for ${eepsite.name}.`, 'success');
            // A successful publish is a good moment to flush anything that
            // was queued while the daemon was down.
            void flushPublishQueue(config).then(r => {
                if (r.flushed.length > 0) {
                    showToast?.(`Flushed ${r.flushed.length} queued publish(es).`, 'success');
                    refreshQueue();
                }
            });
        } catch (e) {
            const isNetwork = e instanceof SyncDaemonError && e.cause !== undefined;
            if (isNetwork) {
                // Daemon unreachable — queue it and flush later. NOT an error.
                await enqueuePublish(eepsite);
                refreshQueue();
                onToggleStatus(eepsite.id, 'Offline');
                showToast?.(
                    `Sync daemon offline — "${eepsite.name}" queued. It'll publish automatically when the daemon is back.`,
                    'info',
                );
            } else {
                const msg = e instanceof SyncDaemonError ? e.message : 'Publish failed.';
                onToggleStatus(eepsite.id, 'Error');
                showToast?.(msg, 'error');
            }
        } finally {
            setBusyId(null);
        }
    };

    const handleToggle = async (eepsite: Eepsite, next: EepsiteStatus) => {
        if (next === 'Online') {
            await handlePublish(eepsite);
            return;
        }
        // Going offline -> ask the daemon to remove the published files.
        setBusyId(eepsite.id);
        try {
            await unpublishEepsiteFromDaemon(config, eepsite.name);
            onToggleStatus(eepsite.id, 'Offline');
            showToast?.(`Unpublished ${eepsite.name}.`, 'info');
        } catch (e) {
            // Best-effort: even if the daemon is down, mark offline locally.
            onToggleStatus(eepsite.id, 'Offline');
            const msg = e instanceof SyncDaemonError ? e.message : 'Unpublish failed.';
            showToast?.(msg, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (eepsite: Eepsite) => {
        // Best-effort daemon cleanup — don't block local delete on it.
        try {
            await unpublishEepsiteFromDaemon(config, eepsite.name);
        } catch { /* daemon may not be running; that's fine */ }
        onDelete(eepsite.id);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Eepsite Hosting</h1>
                    <p className="text-gray-400 mt-1">
                        Edit your eepsites in the in-browser IDE, then click <span className="text-teal-300 font-semibold">Publish</span> to push them to the local sync daemon (which i2pd serves).
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {eepsites.length > 0 && (
                        <button
                            onClick={() => exportAllEepsitesAsZip(eepsites).then(() => showToast?.('Exported all eepsites', 'success')).catch(() => showToast?.('Export failed', 'error'))}
                            className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
                        >
                            <DownloadIcon />
                            <span className="ml-2">Export All</span>
                        </button>
                    )}
                    <button
                        onClick={onAddNew}
                        className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                        <PlusIcon />
                        Host New Eepsite
                    </button>
                </div>
            </div>

            {pendingCount > 0 && (
                <Banner kind="info" title="Pending publishes">
                    {pendingCount} eepsite{pendingCount === 1 ? '' : 's'} queued while the sync daemon was offline.
                    {' '}They'll publish automatically when the daemon is reachable.
                </Banner>
            )}

            {eepsites.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {eepsites.map(site => (
                        <EepsiteCard
                            key={site.id}
                            eepsite={site}
                            isBusy={busyId === site.id}
                            onToggleStatus={(next) => handleToggle(site, next)}
                            onDelete={() => handleDelete(site)}
                            onOpenEditor={() => onOpenEditor(site)}
                            onPublish={() => handlePublish(site)}
                            onExport={() => exportEepsiteAsZip(site, true).then(() => showToast?.(`Exported ${site.name}.zip`, 'success')).catch(() => showToast?.('Export failed', 'error'))}
                        />
                    ))}
                </div>
            ) : (
                <Card className="text-center py-16">
                    <div className="flex justify-center mb-4"><GlobeAltIcon /></div>
                    <h2 className="text-xl font-semibold text-white">No Eepsites Hosted</h2>
                    <p className="text-gray-400 mt-2 max-w-md mx-auto">
                        Click "Host New Eepsite" to create your first site. You'll be dropped straight into the in-browser editor — when you're ready, click Publish to push it to your local Termux + i2pd setup.
                    </p>
                </Card>
            )}
        </div>
    );
};

export default EepsiteHosting;



