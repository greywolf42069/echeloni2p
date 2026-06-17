/**
 * Smoke test: confirms vitest + jsdom + fake-indexeddb are wired up.
 * If this fails, every other test file in the suite is suspect.
 */
import { describe, expect, it } from 'vitest';

describe('test infrastructure', () => {
    it('runs in jsdom (window + document defined)', () => {
        expect(typeof window).toBe('object');
        expect(typeof document).toBe('object');
        expect(typeof navigator).toBe('object');
    });

    it('has a working localStorage', () => {
        window.localStorage.setItem('echelon_test', 'ok');
        expect(window.localStorage.getItem('echelon_test')).toBe('ok');
    });

    it('has fake-indexeddb available', () => {
        expect(typeof indexedDB).toBe('object');
        expect(typeof indexedDB.open).toBe('function');
    });

    it('can fetch (jsdom + node fetch)', () => {
        expect(typeof fetch).toBe('function');
    });
});
