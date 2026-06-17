/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as bs from '../../hooks/browserStore';

async function clearAll() {
    const allBookmarks = await bs.loadAllBookmarks();
    for (const b of allBookmarks) await bs.removeBookmark(b.id);
    await bs.clearAllHistory();
    await bs.clearAllJsToggles();
    await bs.clearTabSnapshot();
}

describe('browserStore — bookmarks', () => {
    beforeEach(clearAll);

    it('starts empty', async () => {
        const all = await bs.loadAllBookmarks();
        expect(all).toEqual([]);
    });

    it('addBookmark stores a normalised id and round-trips', async () => {
        const added = await bs.addBookmark({ title: 'Wiki', url: 'wiki.i2p' });
        expect(added.id).toBe('bm:wiki.i2p');
        const all = await bs.loadAllBookmarks();
        expect(all).toHaveLength(1);
        expect(all[0].url).toBe('wiki.i2p');
        expect(all[0].title).toBe('Wiki');
    });

    it('addBookmark normalises trailing slashes + scheme', async () => {
        const a = await bs.addBookmark({ title: 'A', url: 'http://Example.i2p/' });
        const b = await bs.addBookmark({ title: 'B', url: 'example.i2p' });
        // Same id → second put overwrites first (b wins)
        expect(a.id).toBe(b.id);
        const all = await bs.loadAllBookmarks();
        expect(all).toHaveLength(1);
        expect(all[0].title).toBe('B');
    });

    it('removeBookmark deletes a single entry', async () => {
        await bs.addBookmark({ title: 'A', url: 'a.i2p' });
        await bs.addBookmark({ title: 'B', url: 'b.i2p' });
        await bs.removeBookmark('bm:a.i2p');
        const all = await bs.loadAllBookmarks();
        expect(all).toHaveLength(1);
        expect(all[0].url).toBe('b.i2p');
    });

    it('isBookmarked returns true for existing, false for missing', async () => {
        await bs.addBookmark({ title: 'A', url: 'a.i2p' });
        expect(await bs.isBookmarked('a.i2p')).toBe(true);
        expect(await bs.isBookmarked('a.i2p/')).toBe(true); // normalised
        expect(await bs.isBookmarked('http://A.i2p')).toBe(true); // case-insensitive + scheme strip
        expect(await bs.isBookmarked('b.i2p')).toBe(false);
    });

    it('seedDefaultBookmarksIfEmpty adds defaults on first run', async () => {
        await bs.seedDefaultBookmarksIfEmpty();
        const all = await bs.loadAllBookmarks();
        expect(all.length).toBe(bs.DEFAULT_BOOKMARKS.length);
        const urls = all.map(b => b.url);
        expect(urls).toContain('i2p-projekt.i2p');
        expect(urls).toContain('notbob.i2p');
    });

    it('seedDefaultBookmarksIfEmpty is idempotent', async () => {
        await bs.seedDefaultBookmarksIfEmpty();
        const firstCount = (await bs.loadAllBookmarks()).length;
        await bs.seedDefaultBookmarksIfEmpty();
        const secondCount = (await bs.loadAllBookmarks()).length;
        expect(secondCount).toBe(firstCount);
    });

    it('seedDefaultBookmarksIfEmpty does NOT seed when user already has bookmarks', async () => {
        await bs.addBookmark({ title: 'My pin', url: 'mine.i2p' });
        await bs.seedDefaultBookmarksIfEmpty();
        const all = await bs.loadAllBookmarks();
        expect(all).toHaveLength(1);
        expect(all[0].url).toBe('mine.i2p');
    });
});

describe('browserStore — history', () => {
    beforeEach(clearAll);

    it('starts empty', async () => {
        const all = await bs.loadRecentHistory();
        expect(all).toEqual([]);
    });

    it('recordHistory persists and loadRecentHistory returns it', async () => {
        await bs.recordHistory({ url: 'a.i2p', title: 'A', timestamp: 100 });
        await bs.recordHistory({ url: 'b.i2p', title: 'B', timestamp: 200 });
        const all = await bs.loadRecentHistory();
        expect(all).toHaveLength(2);
        // Sorted newest-first
        expect(all[0].url).toBe('b.i2p');
        expect(all[1].url).toBe('a.i2p');
    });

    it('respects the limit', async () => {
        for (let i = 0; i < 100; i++) {
            await bs.recordHistory({ url: `${i}.i2p`, title: String(i), timestamp: i });
        }
        const all = await bs.loadRecentHistory(10);
        expect(all).toHaveLength(10);
    });

    it('clearAllHistory empties the store', async () => {
        await bs.recordHistory({ url: 'a.i2p', title: 'A', timestamp: 100 });
        await bs.recordHistory({ url: 'b.i2p', title: 'B', timestamp: 200 });
        await bs.clearAllHistory();
        const all = await bs.loadRecentHistory();
        expect(all).toEqual([]);
    });
});

describe('browserStore — JS toggle', () => {
    beforeEach(clearAll);

    it('defaults to true (JS enabled) for unknown hosts', async () => {
        expect(await bs.isJsEnabledForHost('newsite.i2p')).toBe(true);
    });

    it('persists per-host setting and recalls', async () => {
        await bs.setJsEnabledForHost('site.i2p', false);
        expect(await bs.isJsEnabledForHost('site.i2p')).toBe(false);
        await bs.setJsEnabledForHost('site.i2p', true);
        expect(await bs.isJsEnabledForHost('site.i2p')).toBe(true);
    });

    it('normalises hostname (case-insensitive, scheme-stripped)', async () => {
        await bs.setJsEnabledForHost('https://Example.i2p', false);
        expect(await bs.isJsEnabledForHost('example.i2p')).toBe(false);
        expect(await bs.isJsEnabledForHost('http://EXAMPLE.i2p/page')).toBe(false);
    });

    it('host-level isolation: separate sites independent', async () => {
        await bs.setJsEnabledForHost('a.i2p', false);
        await bs.setJsEnabledForHost('b.i2p', true);
        expect(await bs.isJsEnabledForHost('a.i2p')).toBe(false);
        expect(await bs.isJsEnabledForHost('b.i2p')).toBe(true);
    });

    it('loadAllJsToggles returns every entry', async () => {
        await bs.setJsEnabledForHost('a.i2p', false);
        await bs.setJsEnabledForHost('b.i2p', true);
        const all = await bs.loadAllJsToggles();
        expect(all.length).toBe(2);
        const map = new Map(all.map(t => [t.host, t.jsEnabled]));
        expect(map.get('a.i2p')).toBe(false);
        expect(map.get('b.i2p')).toBe(true);
    });
});

describe('browserStore — tab snapshot', () => {
    beforeEach(async () => {
        await clearAll();
        await bs.clearTabSnapshot();
    });

    it('starts with no snapshot', async () => {
        const snap = await bs.loadTabSnapshot();
        expect(snap).toBeNull();
    });

    it('saveTabSnapshot persists a snapshot that loadTabSnapshot reads back', async () => {
        await bs.saveTabSnapshot({
            tabs: [{ history: ['a.i2p'], historyIndex: 0, title: 'A' }],
            activeTabIndex: 0,
        });
        const snap = await bs.loadTabSnapshot();
        expect(snap).not.toBeNull();
        expect(snap!.tabs).toHaveLength(1);
        expect(snap!.tabs[0].history).toEqual(['a.i2p']);
        expect(snap!.activeTabIndex).toBe(0);
        expect(typeof snap!.savedAt).toBe('number');
    });

    it('saveTabSnapshot overwrites the singleton', async () => {
        await bs.saveTabSnapshot({
            tabs: [{ history: ['a.i2p'], historyIndex: 0, title: 'A' }],
            activeTabIndex: 0,
        });
        await bs.saveTabSnapshot({
            tabs: [
                { history: ['b.i2p'], historyIndex: 0, title: 'B' },
                { history: ['c.i2p'], historyIndex: 0, title: 'C' },
            ],
            activeTabIndex: 1,
        });
        const snap = await bs.loadTabSnapshot();
        expect(snap!.tabs).toHaveLength(2);
        expect(snap!.activeTabIndex).toBe(1);
    });

    it('clearTabSnapshot deletes the snapshot', async () => {
        await bs.saveTabSnapshot({
            tabs: [{ history: ['a.i2p'], historyIndex: 0, title: 'A' }],
            activeTabIndex: 0,
        });
        await bs.clearTabSnapshot();
        const snap = await bs.loadTabSnapshot();
        expect(snap).toBeNull();
    });
});
