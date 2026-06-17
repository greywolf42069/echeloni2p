#!/usr/bin/env node
/**
 * Static PWA installability audit (a Lighthouse-lite gate).
 *
 * Full Lighthouse needs a headless Chrome + a running server, which is
 * heavy and flaky in CI. This script instead statically validates the
 * built dist/ against the concrete, checkable PWA installability
 * criteria that Lighthouse's "Installable" audit enforces:
 *
 *   1. dist/index.html links a manifest
 *   2. manifest has name, short_name, start_url, display=standalone,
 *      theme_color, background_color
 *   3. manifest has 192 + 512 PNG icons that exist on disk
 *   4. manifest has a maskable icon
 *   5. a service worker is registered + present
 *   6. index.html has a theme-color meta + viewport meta
 *   7. no third-party CDN <script>/<link> (privacy + offline)
 *
 * Run after `vite build`:  node scripts/pwa_audit.mjs
 * Exits non-zero on any failure so CI fails loudly.
 *
 * For a full Lighthouse run (performance, a11y, best-practices,
 * PWA-category score), see docs/release.md — it's a manual step on a
 * machine with Chrome installed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const failures = [];
const ok = [];
function check(label, cond) {
    if (cond) ok.push(label);
    else failures.push(label);
}

if (!existsSync(dist)) {
    console.error('✗ dist/ not found — run `vite build` first.');
    process.exit(1);
}

const html = readFileSync(resolve(dist, 'index.html'), 'utf-8');

// 1. manifest link
check('index.html links a manifest', /<link[^>]+rel="manifest"/.test(html));

// 2-4. manifest contents + icons
const manifestPath = resolve(dist, 'manifest.json');
check('manifest.json present in dist', existsSync(manifestPath));
if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    check('manifest has name', !!m.name);
    check('manifest has short_name', !!m.short_name);
    check('manifest has start_url', !!m.start_url);
    check('manifest display=standalone', m.display === 'standalone');
    check('manifest theme_color', /^#[0-9a-f]{6}$/i.test(m.theme_color || ''));
    check('manifest background_color', /^#[0-9a-f]{6}$/i.test(m.background_color || ''));

    const icons = m.icons || [];
    const has192 = icons.some((i) => i.sizes === '192x192' && i.type === 'image/png');
    const has512 = icons.some((i) => i.sizes === '512x512' && i.type === 'image/png');
    const hasMaskable = icons.some((i) => (i.purpose || '').includes('maskable'));
    check('manifest has 192x192 PNG icon', has192);
    check('manifest has 512x512 PNG icon', has512);
    check('manifest has a maskable icon', hasMaskable);

    for (const icon of icons) {
        const p = resolve(dist, icon.src.replace(/^\//, ''));
        check(`icon file exists: ${icon.src}`, existsSync(p));
    }
}

// 5. service worker
check('service worker (sw.js) generated', existsSync(resolve(dist, 'sw.js')));
check('index.html registers a service worker', /register-sw|registerSW|serviceWorker/i.test(html));

// 6. meta tags
check('index.html has theme-color meta', /<meta[^>]+name="theme-color"/.test(html));
check('index.html has viewport meta', /<meta[^>]+name="viewport"/.test(html));
check('index.html has apple-touch-icon', /rel="apple-touch-icon"/.test(html));

// 7. no third-party CDN
const cdnOffenders = (html.match(/https:\/\/[a-zA-Z0-9.-]+/g) || []).filter((u) =>
    /esm\.sh|cdn\.tailwindcss|unpkg\.com|aistudiocdn|jsdelivr|cdnjs/.test(u),
);
check('no third-party CDN references', cdnOffenders.length === 0);

// ── Report ──────────────────────────────────────────────────────────
for (const o of ok) console.log(`✓ ${o}`);
if (failures.length) {
    console.error('\nPWA audit FAILED:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
}
console.log(`\n✓ PWA audit passed — ${ok.length} checks.`);
