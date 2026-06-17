/**
 * Browser-tab IndexedDB persistence: bookmarks (always on), history
 * (opt-in, off by default), per-site JS toggles (always on), and
 * tab-restore snapshots (opt-in, off by default).
 *
 * Uses a SEPARATE database from `eepsiteStore` (echelon vs.
 * echelon-browser) so bumping browser-store schemas can never
 * brick eepsite hydration. Tests for the two stores stay
 * independent.
 */

const DB_NAME = 'echelon-browser';
const DB_VERSION = 2;
const STORE_BOOKMARKS = 'bookmarks';
const STORE_HISTORY = 'history';
const STORE_JS_TOGGLES = 'jsToggles';
const STORE_TAB_SNAPSHOT = 'tabSnapshot';

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
            if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
                db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
                store.createIndex('byTimestamp', 'timestamp');
            }
            if (!db.objectStoreNames.contains(STORE_JS_TOGGLES)) {
                db.createObjectStore(STORE_JS_TOGGLES, { keyPath: 'host' });
            }
            if (!db.objectStoreNames.contains(STORE_TAB_SNAPSHOT)) {
                db.createObjectStore(STORE_TAB_SNAPSHOT, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function tx<T>(
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
    return openDb().then(db => new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
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

// ── Bookmarks ────────────────────────────────────────────────────────

export interface Bookmark {
    /** Stable id (we use the URL itself, after normalization). */
    id: string;
    /** User-editable display name. */
    title: string;
    /** Bookmarked URL — either an eepsite address or a clearnet URL. */
    url: string;
    /** Display category for grouping in the UI. */
    category?: string;
    /** Unix ms when added. */
    addedAt: number;
}

/** Default seed bookmarks shipped with v0.1. */
export const DEFAULT_BOOKMARKS: ReadonlyArray<Bookmark> = [
    { id: 'bm:i2p-projekt.i2p',  title: 'I2P Project Homepage',         url: 'i2p-projekt.i2p',  category: 'I2P', addedAt: 0 },
    { id: 'bm:wiki.i2p',         title: 'The Invisible Wiki',           url: 'wiki.i2p',          category: 'I2P', addedAt: 0 },
    { id: 'bm:identiguy.i2p',    title: 'Identiguy (eepsite directory)',url: 'identiguy.i2p',     category: 'Directories', addedAt: 0 },
    { id: 'bm:notbob.i2p',       title: 'Notbob (search)',              url: 'notbob.i2p',        category: 'Search', addedAt: 0 },
    { id: 'bm:i2pforum.i2p',     title: 'I2P Forum',                    url: 'i2pforum.i2p',      category: 'Community', addedAt: 0 },
    { id: 'bm:stats.i2p',        title: 'Stats / NetDB',                url: 'stats.i2p',         category: 'I2P', addedAt: 0 },
    { id: 'bm:planet.i2p',       title: 'Planet I2P',                   url: 'planet.i2p',        category: 'Community', addedAt: 0 },
    { id: 'bm:zerobin.i2p',      title: 'ZeroBin (paste)',              url: 'zerobin.i2p',       category: 'Tools', addedAt: 0 },
];

function normaliseBookmarkId(url: string): string {
    return 'bm:' + url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export async function loadAllBookmarks(): Promise<Bookmark[]> {
    try {
        const result = await tx<Bookmark[]>(STORE_BOOKMARKS, 'readonly', store => store.getAll());
        return result || [];
    } catch (e) {
        console.warn('[browserStore] loadAllBookmarks failed:', e);
        return [];
    }
}

export async function addBookmark(b: Omit<Bookmark, 'id' | 'addedAt'> & { addedAt?: number }): Promise<Bookmark> {
    const bookmark: Bookmark = {
        id: normaliseBookmarkId(b.url),
        title: b.title.trim() || b.url,
        url: b.url.trim(),
        category: b.category,
        addedAt: b.addedAt ?? Date.now(),
    };
    try {
        await tx<void>(STORE_BOOKMARKS, 'readwrite', store => {
            store.put(bookmark);
        });
    } catch (e) {
        console.warn('[browserStore] addBookmark failed:', e);
    }
    return bookmark;
}

export async function removeBookmark(id: string): Promise<void> {
    try {
        await tx<void>(STORE_BOOKMARKS, 'readwrite', store => {
            store.delete(id);
        });
    } catch (e) {
        console.warn('[browserStore] removeBookmark failed:', e);
    }
}

export async function isBookmarked(url: string): Promise<boolean> {
    try {
        const id = normaliseBookmarkId(url);
        const result = await tx<Bookmark | undefined>(STORE_BOOKMARKS, 'readonly', store => store.get(id));
        return result !== undefined;
    } catch (e) {
        console.warn('[browserStore] isBookmarked failed:', e);
        return false;
    }
}

/**
 * Seed the default bookmarks on first run only. Idempotent — re-running
 * does not duplicate or overwrite user-edited bookmarks.
 */
export async function seedDefaultBookmarksIfEmpty(): Promise<void> {
    try {
        const existing = await loadAllBookmarks();
        if (existing.length > 0) return;
        await tx<void>(STORE_BOOKMARKS, 'readwrite', store => {
            for (const b of DEFAULT_BOOKMARKS) store.put(b);
        });
    } catch (e) {
        console.warn('[browserStore] seedDefaultBookmarksIfEmpty failed:', e);
    }
}

// ── History (opt-in, off by default) ─────────────────────────────────

export interface HistoryEntry {
    id?: number; // auto-incrementing
    url: string;
    title: string;
    /** Unix ms */
    timestamp: number;
}

export async function loadRecentHistory(limit = 50): Promise<HistoryEntry[]> {
    try {
        const result = await tx<HistoryEntry[]>(STORE_HISTORY, 'readonly', store => store.getAll());
        return (result || []).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch (e) {
        console.warn('[browserStore] loadRecentHistory failed:', e);
        return [];
    }
}

export async function recordHistory(entry: Omit<HistoryEntry, 'id'>): Promise<void> {
    try {
        await tx<void>(STORE_HISTORY, 'readwrite', store => {
            store.add(entry);
        });
    } catch (e) {
        console.warn('[browserStore] recordHistory failed:', e);
    }
}

export async function clearAllHistory(): Promise<void> {
    try {
        await tx<void>(STORE_HISTORY, 'readwrite', store => {
            store.clear();
        });
    } catch (e) {
        console.warn('[browserStore] clearAllHistory failed:', e);
    }
}

// ── JS toggle (per-site) ─────────────────────────────────────────────

export interface JsToggle {
    /** Hostname (e.g. "example.i2p"), normalised lowercase, no scheme. */
    host: string;
    /** When false, JavaScript is disabled for this host (sandbox enforces). */
    jsEnabled: boolean;
}

function normaliseHost(rawUrl: string): string {
    const trimmed = rawUrl.trim().toLowerCase().replace(/^https?:\/\//, '');
    // Take the part before the first '/', '?', or '#'
    const m = trimmed.match(/^[^/?#]+/);
    return m ? m[0] : trimmed;
}

/**
 * Returns true if JS should be enabled for this URL's host. Default
 * is `true` (JS-on for unknown hosts) since most eepsites need it.
 */
export async function isJsEnabledForHost(rawUrl: string): Promise<boolean> {
    try {
        const host = normaliseHost(rawUrl);
        if (!host) return true;
        const result = await tx<JsToggle | undefined>(STORE_JS_TOGGLES, 'readonly', store => store.get(host));
        return result === undefined ? true : result.jsEnabled;
    } catch (e) {
        console.warn('[browserStore] isJsEnabledForHost failed:', e);
        return true;
    }
}

export async function setJsEnabledForHost(rawUrl: string, jsEnabled: boolean): Promise<void> {
    try {
        const host = normaliseHost(rawUrl);
        if (!host) return;
        await tx<void>(STORE_JS_TOGGLES, 'readwrite', store => {
            store.put({ host, jsEnabled });
        });
    } catch (e) {
        console.warn('[browserStore] setJsEnabledForHost failed:', e);
    }
}

export async function loadAllJsToggles(): Promise<JsToggle[]> {
    try {
        const result = await tx<JsToggle[]>(STORE_JS_TOGGLES, 'readonly', store => store.getAll());
        return result || [];
    } catch (e) {
        console.warn('[browserStore] loadAllJsToggles failed:', e);
        return [];
    }
}

/** Test/admin helper — drops every per-host JS toggle entry. */
export async function clearAllJsToggles(): Promise<void> {
    try {
        await tx<void>(STORE_JS_TOGGLES, 'readwrite', store => {
            store.clear();
        });
    } catch (e) {
        console.warn('[browserStore] clearAllJsToggles failed:', e);
    }
}

// ── Tab snapshot (opt-in restore) ────────────────────────────────────

/**
 * Plain-data snapshot of the tab list at a moment in time. Persisted
 * only when `featureFlags.restoreTabs` is on (or via the per-tab
 * Settings toggle once we add one). Restored on next browser mount.
 */
export interface TabSnapshot {
    id: 'singleton'; // we only ever store one snapshot
    savedAt: number;
    tabs: Array<{
        history: string[];
        historyIndex: number;
        title: string;
    }>;
    activeTabIndex: number;
}

export async function saveTabSnapshot(snap: Omit<TabSnapshot, 'id' | 'savedAt'>): Promise<void> {
    try {
        const record: TabSnapshot = {
            id: 'singleton',
            savedAt: Date.now(),
            tabs: snap.tabs,
            activeTabIndex: snap.activeTabIndex,
        };
        await tx<void>(STORE_TAB_SNAPSHOT, 'readwrite', store => {
            store.put(record);
        });
    } catch (e) {
        console.warn('[browserStore] saveTabSnapshot failed:', e);
    }
}

export async function loadTabSnapshot(): Promise<TabSnapshot | null> {
    try {
        const result = await tx<TabSnapshot | undefined>(STORE_TAB_SNAPSHOT, 'readonly', store => store.get('singleton'));
        return result ?? null;
    } catch (e) {
        console.warn('[browserStore] loadTabSnapshot failed:', e);
        return null;
    }
}

export async function clearTabSnapshot(): Promise<void> {
    try {
        await tx<void>(STORE_TAB_SNAPSHOT, 'readwrite', store => {
            store.delete('singleton');
        });
    } catch (e) {
        console.warn('[browserStore] clearTabSnapshot failed:', e);
    }
}
