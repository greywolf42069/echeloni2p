/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as queue from '../../hooks/publishQueue';
import * as syncClient from '../../hooks/syncDaemonClient';
import type { Eepsite } from '../../types';
import type { EchelonConfig } from '../../hooks/useEchelonConfig';

const CONFIG = {} as EchelonConfig;

const ep = (name: string): Eepsite => ({
    id: `id-${name}`,
    name,
    localDirectory: `/${name}`,
    status: 'Offline',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    files: { 'index.html': { content: `<h1>${name}</h1>` } },
});

async function clearQueue() {
    const all = await queue.loadQueue();
    for (const q of all) await queue.dequeue(q.eepsiteName);
}

describe('publishQueue', () => {
    beforeEach(clearQueue);
    afterEach(() => { vi.restoreAllMocks(); });

    it('starts empty', async () => {
        expect(await queue.loadQueue()).toEqual([]);
        expect(await queue.queueLength()).toBe(0);
    });

    it('enqueuePublish adds an entry', async () => {
        await queue.enqueuePublish(ep('a.i2p'));
        const all = await queue.loadQueue();
        expect(all).toHaveLength(1);
        expect(all[0].eepsiteName).toBe('a.i2p');
        expect(all[0].attempts).toBe(0);
        expect(typeof all[0].queuedAt).toBe('number');
    });

    it('re-queuing the same eepsite replaces (keyed by name), preserves queuedAt', async () => {
        await queue.enqueuePublish(ep('a.i2p'));
        const first = await queue.getQueued('a.i2p');
        await new Promise(r => setTimeout(r, 5));
        // Re-queue with edited content
        const edited = ep('a.i2p');
        edited.files = { 'index.html': { content: '<h1>edited</h1>' } };
        await queue.enqueuePublish(edited);
        const all = await queue.loadQueue();
        expect(all).toHaveLength(1);
        const stored = all[0].eepsite.files['index.html'] as { content: string };
        expect(stored.content).toBe('<h1>edited</h1>');
        // queuedAt preserved from first enqueue
        expect(all[0].queuedAt).toBe(first!.queuedAt);
    });

    it('loadQueue returns oldest-first', async () => {
        await queue.enqueuePublish(ep('a.i2p'));
        await new Promise(r => setTimeout(r, 5));
        await queue.enqueuePublish(ep('b.i2p'));
        const all = await queue.loadQueue();
        expect(all.map(q => q.eepsiteName)).toEqual(['a.i2p', 'b.i2p']);
    });

    it('dequeue removes a single entry', async () => {
        await queue.enqueuePublish(ep('a.i2p'));
        await queue.enqueuePublish(ep('b.i2p'));
        await queue.dequeue('a.i2p');
        const all = await queue.loadQueue();
        expect(all.map(q => q.eepsiteName)).toEqual(['b.i2p']);
    });

    describe('flushPublishQueue', () => {
        it('empty queue → stoppedReason empty', async () => {
            const r = await queue.flushPublishQueue(CONFIG);
            expect(r).toEqual({ flushed: [], remaining: 0, stoppedReason: 'empty' });
        });

        it('publishes all queued + removes them on success', async () => {
            const spy = vi.spyOn(syncClient, 'publishEepsiteToDaemon')
                .mockResolvedValue({ eepsite: 'x', writtenCount: 1, files: [], diskPath: '/x' });
            await queue.enqueuePublish(ep('a.i2p'));
            await queue.enqueuePublish(ep('b.i2p'));
            const r = await queue.flushPublishQueue(CONFIG);
            expect(r.stoppedReason).toBe('done');
            expect(r.flushed.sort()).toEqual(['a.i2p', 'b.i2p']);
            expect(r.remaining).toBe(0);
            expect(spy).toHaveBeenCalledTimes(2);
            expect(await queue.queueLength()).toBe(0);
        });

        it('stops on network failure, keeps remaining queued', async () => {
            const netErr = new syncClient.SyncDaemonError('unreachable', new Error('refused'));
            vi.spyOn(syncClient, 'publishEepsiteToDaemon').mockRejectedValue(netErr);
            await queue.enqueuePublish(ep('a.i2p'));
            await queue.enqueuePublish(ep('b.i2p'));
            const r = await queue.flushPublishQueue(CONFIG);
            expect(r.stoppedReason).toBe('daemon-unreachable');
            expect(r.flushed).toEqual([]);
            expect(r.remaining).toBe(2);
        });

        it('skips a server-rejected site (non-network) and continues', async () => {
            // a.i2p gets a 413-style rejection (no cause); b.i2p succeeds.
            const serverErr = new syncClient.SyncDaemonError('413 too large'); // no cause = not network
            vi.spyOn(syncClient, 'publishEepsiteToDaemon').mockImplementation(
                async (_cfg, e: Eepsite) => {
                    if (e.name === 'a.i2p') throw serverErr;
                    return { eepsite: e.name, writtenCount: 1, files: [], diskPath: '/x' };
                },
            );
            await queue.enqueuePublish(ep('a.i2p'));
            await queue.enqueuePublish(ep('b.i2p'));
            const r = await queue.flushPublishQueue(CONFIG);
            expect(r.stoppedReason).toBe('done');
            expect(r.flushed).toEqual(['b.i2p']);
            // a.i2p stays queued with a bumped attempt counter
            expect(r.remaining).toBe(1);
            const remaining = await queue.getQueued('a.i2p');
            expect(remaining?.attempts).toBe(1);
        });

        it('flushes in oldest-first order', async () => {
            const order: string[] = [];
            vi.spyOn(syncClient, 'publishEepsiteToDaemon').mockImplementation(
                async (_cfg, e: Eepsite) => {
                    order.push(e.name);
                    return { eepsite: e.name, writtenCount: 1, files: [], diskPath: '/x' };
                },
            );
            await queue.enqueuePublish(ep('first.i2p'));
            await new Promise(r => setTimeout(r, 5));
            await queue.enqueuePublish(ep('second.i2p'));
            await queue.flushPublishQueue(CONFIG);
            expect(order).toEqual(['first.i2p', 'second.i2p']);
        });
    });
});
