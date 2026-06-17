/**
 * Global test setup for Vitest. Runs in both jsdom and node environments —
 * each block guards itself with `typeof window` so node-env tests don't blow up.
 *
 * - jest-dom matchers (only relevant in jsdom)
 * - fake-indexeddb (only in jsdom)
 * - in-memory localStorage / sessionStorage shims (Node 25's experimental
 *   localStorage conflicts with jsdom's; we replace both here)
 * - polyfills for things jsdom does not implement: scrollIntoView,
 *   clipboard, matchMedia
 */
import { afterEach, beforeEach, vi } from 'vitest';

const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';

if (HAS_DOM) {
    // jest-dom is jsdom-only; importing it in a node env throws.
    await import('@testing-library/jest-dom/vitest');
    await import('fake-indexeddb/auto');
}

class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number { return this.store.size; }
    clear(): void { this.store.clear(); }
    getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
    setItem(key: string, value: string): void { this.store.set(String(key), String(value)); }
    removeItem(key: string): void { this.store.delete(key); }
    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }
}

function installStorage(name: 'localStorage' | 'sessionStorage') {
    if (!HAS_DOM) return;
    const fresh = new MemoryStorage();
    Object.defineProperty(window, name, {
        value: fresh,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, name, {
        value: fresh,
        writable: true,
        configurable: true,
    });
}

if (HAS_DOM) {
    installStorage('localStorage');
    installStorage('sessionStorage');

    // jsdom doesn't implement scrollIntoView; several components call it.
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }

    // jsdom doesn't implement clipboard; tests can spy on this.
    if (!navigator.clipboard) {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        });
    }

    // jsdom hasn't implemented matchMedia; recharts and a couple components use it.
    if (!window.matchMedia) {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    }
}

beforeEach(() => {
    if (HAS_DOM) {
        installStorage('localStorage');
        installStorage('sessionStorage');
    }
});

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});
