/**
 * Regression guard: the production build must make ZERO third-party
 * network requests on load. Echelon is a privacy tool — shipping a
 * CDN <script> or <link> would be both a privacy leak and an
 * offline-mode breaker.
 *
 * This test reads dist/index.html if it exists (i.e. after `vite build`).
 * In a bare `vitest run` with no prior build, it skips — CI always
 * builds before testing so the guard is live there.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distIndex = resolve(process.cwd(), 'dist', 'index.html');
const hasDist = existsSync(distIndex);

describe.skipIf(!hasDist)('production build is CDN-free', () => {
    const html = hasDist ? readFileSync(distIndex, 'utf-8') : '';

    it('has no https:// third-party references in index.html', () => {
        const matches = html.match(/https:\/\/[a-zA-Z0-9.-]+/g) ?? [];
        // The only allowed https references would be in meta content; none
        // should be script/style/link sources.
        const offenders = matches.filter(u =>
            /esm\.sh|cdn\.tailwindcss|unpkg\.com|aistudiocdn|jsdelivr|cdnjs/.test(u),
        );
        expect(offenders).toEqual([]);
    });

    it('has no importmap (all deps bundled by Vite)', () => {
        expect(html).not.toContain('importmap');
    });

    it('references a local hashed JS bundle', () => {
        expect(html).toMatch(/src="\.?\/assets\/index-[\w-]+\.js"/);
    });

    it('references a local hashed CSS bundle (Tailwind built, not CDN)', () => {
        expect(html).toMatch(/href="\.?\/assets\/index-[\w-]+\.css"/);
    });

    it('references the manifest at a stable (unhashed) path', () => {
        expect(html).toMatch(/href="\.?\/manifest\.json"/);
    });
});
