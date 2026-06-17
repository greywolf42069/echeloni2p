/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    // Cast: vitest ships its own pinned vite version which has a slightly
    // different Plugin type than the @vitejs/plugin-react binding. Both
    // are structurally compatible at runtime; the cast avoids a noisy
    // tsc error without weakening any real type checking.
    plugins: [react()] as any,
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        globals: true,
        css: false,
        // Component + hook tests live next to source under `tests/`. Python
        // tests for the sync daemon live under `scripts/tests/` and are
        // excluded from vitest entirely.
        include: ['tests/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', 'dist', 'scripts/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['hooks/**/*.ts', 'components/**/*.{ts,tsx}', 'App.tsx', 'utils.ts'],
            exclude: ['**/*.d.ts', 'tests/**'],
        },
    },
});
