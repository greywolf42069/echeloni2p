/**
 * Eepsite publish queue (Phase K.4 — background sync).
 *
 * When the sync daemon is unreachable at publish time, instead of just
 * failing we queue the publish to IndexedDB and flush it the moment the
 * daemon comes back (detected by the next successful /health probe, or
 * a Background Sync 'sync' event where supported).
 *
 * Design:
 *   - Single IndexedDB store keyed by eepsite name (so re-queuing the
 *     same site replaces the older pending publish — we only ever want
 *     to flush the LATEST version of a site, never a stale one).
 *   - Each entry holds the full flattened files map + a queuedAt stamp
 *     + an attempt counter.
 *   - flushPublishQueue(config) walks the queue oldest-first, attempts
 *     each publish, and removes successful ones. Stops on the first
 *     network failure (daemon went away again) so we don't spin.
 *
 * Separate 'echelon-publish-queue' DB so a schema bump here can never
 * brick eepsite hydration or the browser store.
 */
import type { EchelonConfig } from './useEchelonConfig.ts';
import { publishEepsiteToDaemon, SyncDaemonError } from './syncDaemonClient.ts';
import type { Eepsite } from '../types.ts';

const DB_NAME = 'echelon-publish-queue';
const DB_VERSION = 1;
const STORE = 'queue';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not available in this environment.'));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'eepsiteName' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
    return openDb().then(db => new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        let req: IDBRequest<T> | void;
        try {
            req = fn(store);
        } catch (e) {
            reject(e);
            return;
        }
        transaction.oncomplete = () => resolve((req && 'result' in req ? req.result : undefined) as T);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    }));
}

export interface QueuedPublish {
    /** Eepsite name = primary key. Re-queuing replaces the old entry. */
    eepsiteName: string;
    /** Full eepsite snapshot to publish (we re-flatten at flush time). */
    eepsite: Eepsite;
    /** Unix ms when first queued. */
    queuedAt: number;
    /** How many flush attempts have failed. */
    attempts: number;
}

/** Add (or replace) a pending publish for an eepsite. */
export async function enqueuePublish(eepsite: Eepsite): Promise<void> {
    const existing = await getQueued(eepsite.name);
    const entry: QueuedPublish = {
        eepsiteName: eepsite.name,
        eepsite,
        queuedAt: existing?.queuedAt ?? Date.now(),
        attempts: existing?.attempts ?? 0,
    };
    await tx<void>('readwrite', store => { store.put(entry); });
    // Best-effort: register a Background Sync so the SW retries even if
    // the app is closed. Harmless no-op where unsupported.
    void registerBackgroundSync();
}

export async function getQueued(eepsiteName: string): Promise<QueuedPublish | undefined> {
    return tx<QueuedPublish | undefined>('readonly', store => store.get(eepsiteName));
}

export async function loadQueue(): Promise<QueuedPublish[]> {
    try {
        const all = await tx<QueuedPublish[]>('readonly', store => store.getAll());
        return (all || []).sort((a, b) => a.queuedAt - b.queuedAt);
    } catch (e) {
        console.warn('[publishQueue] loadQueue failed:', e);
        return [];
    }
}

export async function queueLength(): Promise<number> {
    try {
        return await tx<number>('readonly', store => store.count());
    } catch {
        return 0;
    }
}

export async function dequeue(eepsiteName: string): Promise<void> {
    await tx<void>('readwrite', store => { store.delete(eepsiteName); });
}

async function bumpAttempts(entry: QueuedPublish): Promise<void> {
    await tx<void>('readwrite', store => {
        store.put({ ...entry, attempts: entry.attempts + 1 });
    });
}

export interface FlushResult {
    flushed: string[];
    remaining: number;
    stoppedReason: 'empty' | 'daemon-unreachable' | 'done';
}

/**
 * Attempt to publish every queued eepsite, oldest-first. Removes each
 * success from the queue. Stops on the first network failure (the
 * daemon went away) so we don't hammer a dead endpoint; non-network
 * errors (e.g. a 413 size cap) bump the attempt counter and are skipped
 * so one bad site doesn't block the rest.
 */
export async function flushPublishQueue(config: EchelonConfig): Promise<FlushResult> {
    const queue = await loadQueue();
    if (queue.length === 0) {
        return { flushed: [], remaining: 0, stoppedReason: 'empty' };
    }
    const flushed: string[] = [];
    for (const entry of queue) {
        try {
            await publishEepsiteToDaemon(config, entry.eepsite);
            await dequeue(entry.eepsiteName);
            flushed.push(entry.eepsiteName);
        } catch (e) {
            const isNetwork = e instanceof SyncDaemonError && e.cause !== undefined;
            if (isNetwork) {
                // Daemon unreachable — stop, keep the rest queued.
                return {
                    flushed,
                    remaining: await queueLength(),
                    stoppedReason: 'daemon-unreachable',
                };
            }
            // Server-side rejection (e.g. size cap). Bump attempts, skip,
            // keep going — don't let one bad site block the queue.
            await bumpAttempts(entry);
        }
    }
    return { flushed, remaining: await queueLength(), stoppedReason: 'done' };
}

/**
 * Register a one-off Background Sync tag so the service worker can
 * flush the queue even after the page is closed (Chromium only;
 * silent no-op elsewhere). The SW listens for the 'echelon-publish'
 * sync tag.
 */
export async function registerBackgroundSync(): Promise<void> {
    try {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        const reg = await navigator.serviceWorker.ready;
        // `sync` is not in the base TS lib types; guard + cast.
        const syncMgr = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
        if (syncMgr) {
            await syncMgr.register('echelon-publish');
        }
    } catch {
        // Background Sync unsupported or denied — the in-app flush on
        // next daemon-reachable still covers it.
    }
}
