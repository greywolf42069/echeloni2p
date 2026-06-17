/**
 * Service-worker build guard. Asserts that `vite build` produced a
 * registered, correctly-configured Workbox service worker. Skips when
 * dist/ is absent (bare vitest run); live in CI (build runs first).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const swPath = resolve(dist, 'sw.js');
const indexPath = resolve(dist, 'index.html');
const hasBuild = existsSync(swPath) && existsSync(indexPath);

describe.skipIf(!hasBuild)('service worker build', () => {
    const sw = hasBuild ? readFileSync(swPath, 'utf-8') : '';
    const html = hasBuild ? readFileSync(indexPath, 'utf-8') : '';

    it('index.html registers the service worker', () => {
        expect(html).toMatch(/register-sw|registerSW\.js|serviceWorker/i);
    });

    it('sw.js precaches the app shell (index.html)', () => {
        expect(sw).toContain('index.html');
    });

    it('sw.js precaches the hashed JS + CSS bundles', () => {
        expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
        expect(sw).toMatch(/assets\/index-[\w-]+\.css/);
    });

    it('sw.js precaches the PWA icons', () => {
        expect(sw).toContain('icon-512.png');
        expect(sw).toContain('manifest.json');
    });

    it('sw.js includes a navigation fallback (SPA offline support)', () => {
        // Workbox emits NavigationRoute for navigateFallback.
        expect(sw).toMatch(/NavigationRoute|navigateFallback|createHandlerBoundToURL/);
    });

    it('sw.js does NOT NetworkOnly-cache loopback daemon ports as precache', () => {
        // The loopback hosts must never appear in the precache manifest
        // (they're runtime NetworkOnly, never precached).
        expect(sw).not.toMatch(/127\.0\.0\.1:707\d.*revision/);
    });
});
