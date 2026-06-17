/**
 * Manifest + icon integrity guard.
 *
 * Reads public/manifest.json (the source) and asserts the PWA
 * installability requirements: a name, a 192 and a 512 icon, at least
 * one maskable icon, and that every referenced icon file actually
 * exists on disk.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC = resolve(process.cwd(), 'public');
const manifestPath = resolve(PUBLIC, 'manifest.json');

interface Icon { src: string; sizes: string; type?: string; purpose?: string; }
interface Manifest {
    name: string;
    short_name: string;
    description?: string;
    start_url: string;
    scope?: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: Icon[];
    shortcuts?: { name: string; url: string }[];
    categories?: string[];
}

const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

describe('PWA manifest', () => {
    it('has the core installability fields', () => {
        expect(manifest.name).toBeTruthy();
        expect(manifest.short_name).toBeTruthy();
        expect(manifest.start_url).toBeTruthy();
        expect(manifest.display).toBe('standalone');
        expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('has a description (drives the rich install prompt)', () => {
        expect(manifest.description && manifest.description.length).toBeGreaterThan(20);
    });

    it('declares a 192x192 PNG icon', () => {
        const has192 = manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png');
        expect(has192).toBe(true);
    });

    it('declares a 512x512 PNG icon', () => {
        const has512 = manifest.icons.some(i => i.sizes === '512x512' && i.type === 'image/png');
        expect(has512).toBe(true);
    });

    it('declares at least one maskable icon', () => {
        const hasMaskable = manifest.icons.some(i => (i.purpose ?? '').includes('maskable'));
        expect(hasMaskable).toBe(true);
    });

    it('every referenced icon file exists on disk', () => {
        for (const icon of manifest.icons) {
            const p = resolve(PUBLIC, icon.src.replace(/^\//, ''));
            expect(existsSync(p), `missing icon: ${icon.src}`).toBe(true);
        }
    });

    it('has app shortcuts for the key surfaces', () => {
        expect(manifest.shortcuts && manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
        const urls = (manifest.shortcuts ?? []).map(s => s.url).join(' ');
        expect(urls).toContain('browser');
        expect(urls).toContain('editor');
        expect(urls).toContain('wallet');
    });

    it('declares categories', () => {
        expect(manifest.categories && manifest.categories.length).toBeGreaterThan(0);
    });
});
