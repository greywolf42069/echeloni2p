import { describe, expect, it } from 'vitest';

import {
    ALL_TEMPLATES,
    FREE_TEMPLATES,
    PREMIUM_TEMPLATES,
    findTemplate,
} from '../../components/templates/catalog';

describe('templates catalog', () => {
    it('FREE_TEMPLATES has at least 3 entries', () => {
        expect(FREE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    });

    it('PREMIUM_TEMPLATES has at least 3 entries', () => {
        expect(PREMIUM_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    });

    it('every template has unique id', () => {
        const ids = ALL_TEMPLATES.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every free template has tier=free, every premium has tier=premium', () => {
        for (const t of FREE_TEMPLATES) expect(t.tier).toBe('free');
        for (const t of PREMIUM_TEMPLATES) expect(t.tier).toBe('premium');
    });

    it('every template buildFiles() returns a FileTree with at least an index.html', () => {
        for (const t of ALL_TEMPLATES) {
            const files = t.buildFiles();
            expect(files['index.html']).toBeDefined();
            const indexEntry = files['index.html'];
            // FileContent has 'content' property
            expect((indexEntry as { content: string }).content).toContain('<html');
        }
    });

    it('every template has a non-empty name and description', () => {
        for (const t of ALL_TEMPLATES) {
            expect(t.name.length).toBeGreaterThan(0);
            expect(t.description.length).toBeGreaterThan(10);
        }
    });

    it('findTemplate returns the right entry by id', () => {
        const blank = findTemplate('tpl-blank');
        expect(blank?.name).toBe('Blank');
        expect(findTemplate('does-not-exist')).toBeUndefined();
    });

    it('buildFiles is a fresh object each call (no shared mutation risk)', () => {
        const first = FREE_TEMPLATES[0].buildFiles();
        const second = FREE_TEMPLATES[0].buildFiles();
        expect(first).not.toBe(second);
        // structurally equal though
        expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    });
});
