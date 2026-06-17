import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';

// IMPORTANT: We deliberately do NOT inject any API key into the bundle.
// Echelon is a public/self-host tool — users supply their own Gemini API
// key from inside the app UI (stored in localStorage on their device).
// Do not re-add `define: { 'process.env.API_KEY': ... }` here.
export default defineConfig({
    // Relative base — works for GitHub Pages, custom domains, and subdirectory
    // deployments. All asset URLs become relative (./assets/...) instead of
    // absolute (/assets/...), so the app works at any path.
    base: './',
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    plugins: [
        react(),
        // @solana/spl-token (and its transitive splDiscriminate helper)
        // imports Node's `crypto`/`stream`. Polyfill them so the browser
        // bundle resolves cleanly. `Buffer`/`process` are also commonly
        // expected by Solana libs.
        nodePolyfills({
            include: ['crypto', 'stream', 'buffer', 'process', 'util', 'events'],
            globals: { Buffer: true, global: true, process: true },
        }),
        // PWA service worker (Workbox under the hood).
        //   • manifest: false  → we ship our own hand-crafted
        //     public/manifest.json + <link> in index.html.
        //   • registerType: 'autoUpdate' → new SW activates on next load,
        //     no "click to update" prompt needed.
        //   • devOptions.enabled: false → SW only in production builds,
        //     so the dev server (and the restricted AI Studio iframe
        //     that originally forced SW-disable) is never affected.
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            manifest: false,
            devOptions: { enabled: false },
            workbox: {
                // Precache the Vite-built app shell (hashed → cache-forever).
                globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
                // The JS bundle is ~2.3MB; bump the precache size ceiling.
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                // SPA: serve the cached index.html shell for any navigation
                // request that isn't precached. Uses a relative path so it
                // works on GitHub Pages (username.github.io/repo-name/).
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [
                    // Never SPA-fallback the loopback daemon/i2pd ports.
                    /^https?:\/\/127\.0\.0\.1:707\d/,
                    /^https?:\/\/127\.0\.0\.1:4444/,
                    /^https?:\/\/localhost:707\d/,
                ],
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                runtimeCaching: [
                    {
                        // Sync daemon + i2pd: ALWAYS live. Never cache —
                        // stale telemetry / stale eepsite state is worse
                        // than a failed fetch (the app handles failures).
                        urlPattern: ({ url }) =>
                            /(^|\.)127\.0\.0\.1$|localhost/.test(url.hostname) &&
                            /^(707\d|4444|7070)$/.test(url.port),
                        handler: 'NetworkOnly',
                    },
                    {
                        // Solana RPC + any other https GET: stale-while-
                        // revalidate so a flaky connection still renders
                        // something, but fresh data lands on the next poll.
                        urlPattern: ({ url, request }) =>
                            url.protocol === 'https:' && request.method === 'GET',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'echelon-runtime',
                            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
