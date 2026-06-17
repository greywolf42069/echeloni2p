/**
 * Tiny zero-dependency IndexedDB wrapper for Echelon.
 *
 * We avoid the `idb` npm package on purpose — Echelon ships with no
 * build-time secrets and a minimal dep tree, and IndexedDB's raw API
 * is good enough for our small key/value needs.
 */

const DB_NAME = 'echelon';
const DB_VERSION = 1;
const STORE_EEPSITES = 'eepsites';

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
            if (!db.objectStoreNames.contains(STORE_EEPSITES)) {
                db.createObjectStore(STORE_EEPSITES, { keyPath: 'id' });
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

/* ----- Eepsite store API ------------------------------------------------ */

import type { Eepsite } from '../types.ts';

/** Plain serializable copy of an Eepsite (Date -> ISO string). */
interface StoredEepsite extends Omit<Eepsite, 'createdAt'> {
    createdAt: string;
}

function toStored(e: Eepsite): StoredEepsite {
    return { ...e, createdAt: e.createdAt.toISOString() };
}

function fromStored(s: StoredEepsite): Eepsite {
    return { ...s, createdAt: new Date(s.createdAt) };
}

export async function loadAllEepsites(): Promise<Eepsite[]> {
    try {
        const result = await tx<StoredEepsite[]>(STORE_EEPSITES, 'readonly', store => store.getAll());
        return (result || []).map(fromStored);
    } catch (e) {
        console.warn('[eepsiteStore] loadAllEepsites failed:', e);
        return [];
    }
}

export async function saveAllEepsites(eepsites: Eepsite[]): Promise<void> {
    try {
        await tx<void>(STORE_EEPSITES, 'readwrite', store => {
            store.clear();
            for (const e of eepsites) store.put(toStored(e));
        });
    } catch (e) {
        console.warn('[eepsiteStore] saveAllEepsites failed:', e);
    }
}

export async function putEepsite(eepsite: Eepsite): Promise<void> {
    try {
        await tx<void>(STORE_EEPSITES, 'readwrite', store => {
            store.put(toStored(eepsite));
        });
    } catch (e) {
        console.warn('[eepsiteStore] putEepsite failed:', e);
    }
}

export async function deleteEepsite(id: string): Promise<void> {
    try {
        await tx<void>(STORE_EEPSITES, 'readwrite', store => {
            store.delete(id);
        });
    } catch (e) {
        console.warn('[eepsiteStore] deleteEepsite failed:', e);
    }
}
