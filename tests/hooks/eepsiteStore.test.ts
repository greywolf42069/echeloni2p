/**
 * eepsiteStore (IndexedDB persistence) tests.
 *
 * Each test runs against a fresh fake-indexeddb instance because the
 * setup file resets storage between tests. We delete the database
 * explicitly here too in case other code touched it.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
    deleteEepsite,
    loadAllEepsites,
    putEepsite,
    saveAllEepsites,
} from '../../hooks/eepsiteStore';
import type { Eepsite } from '../../types';

const sample = (id: string, name: string, status: Eepsite['status'] = 'Offline'): Eepsite => ({
    id,
    name,
    localDirectory: `/eepsites/${name}`,
    status,
    createdAt: new Date('2025-01-15T12:00:00Z'),
    files: { 'index.html': { content: `<h1>${name}</h1>` } },
});

beforeEach(async () => {
    // Wipe any existing eepsite rows between tests (IDB persists in
    // fake-indexeddb across test calls within the same process).
    await saveAllEepsites([]);
});

describe('eepsiteStore', () => {
    it('loadAllEepsites returns [] on a fresh database', async () => {
        const all = await loadAllEepsites();
        expect(all).toEqual([]);
    });

    it('saveAllEepsites round-trips multiple entries', async () => {
        const a = sample('a', 'a.i2p', 'Online');
        const b = sample('b', 'b.i2p', 'Offline');
        await saveAllEepsites([a, b]);

        const reloaded = await loadAllEepsites();
        expect(reloaded).toHaveLength(2);
        const byId = Object.fromEntries(reloaded.map(e => [e.id, e]));
        expect(byId['a'].name).toBe('a.i2p');
        expect(byId['a'].status).toBe('Online');
        expect(byId['b'].status).toBe('Offline');
    });

    it('saveAllEepsites preserves Date instances on the createdAt field', async () => {
        const original = sample('a', 'a.i2p');
        await saveAllEepsites([original]);
        const [reloaded] = await loadAllEepsites();
        expect(reloaded.createdAt).toBeInstanceOf(Date);
        expect(reloaded.createdAt.toISOString()).toBe(original.createdAt.toISOString());
    });

    it('saveAllEepsites overwrites previously-saved entries (no orphaned rows)', async () => {
        await saveAllEepsites([sample('a', 'a.i2p'), sample('b', 'b.i2p')]);
        await saveAllEepsites([sample('a', 'a.i2p')]); // dropped 'b'

        const reloaded = await loadAllEepsites();
        expect(reloaded).toHaveLength(1);
        expect(reloaded[0].id).toBe('a');
    });

    it('putEepsite inserts a new row and updates an existing one', async () => {
        await putEepsite(sample('a', 'a.i2p', 'Offline'));
        let all = await loadAllEepsites();
        expect(all).toHaveLength(1);

        // Update.
        await putEepsite({ ...sample('a', 'a.i2p', 'Online') });
        all = await loadAllEepsites();
        expect(all).toHaveLength(1);
        expect(all[0].status).toBe('Online');
    });

    it('deleteEepsite removes only the matching row', async () => {
        await saveAllEepsites([sample('a', 'a.i2p'), sample('b', 'b.i2p')]);
        await deleteEepsite('a');
        const all = await loadAllEepsites();
        expect(all).toHaveLength(1);
        expect(all[0].id).toBe('b');
    });

    it('deleteEepsite is a no-op when the id does not exist', async () => {
        await saveAllEepsites([sample('a', 'a.i2p')]);
        await expect(deleteEepsite('nonexistent')).resolves.toBeUndefined();
        const all = await loadAllEepsites();
        expect(all).toHaveLength(1);
    });
});
