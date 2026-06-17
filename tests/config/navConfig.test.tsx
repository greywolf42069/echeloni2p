import { describe, expect, it } from 'vitest';

import { getFooterNav, isPageBlocked, TOKEN_GATED_PAGES } from '../../config/navConfig';
import type { Page } from '../../types';

describe('navConfig', () => {
    describe('TOKEN_GATED_PAGES', () => {
        it('contains exactly the v0.2 token-economy pages', () => {
            const expected: Page[] = ['staking', 'governance', 'bounties', 'emissions', 'referrals'];
            expect(TOKEN_GATED_PAGES.size).toBe(expected.length);
            for (const page of expected) {
                expect(TOKEN_GATED_PAGES.has(page)).toBe(true);
            }
        });

        it('does NOT contain v0.1 product pages', () => {
            const v0_1_pages: Page[] = [
                'dashboard', 'browser', 'eepsite-hosting', 'protect',
                'wallet', 'settings', 'code-editor', 'meshnet-config',
                'outproxy-config', 'wasm', 'native', 'workflows', 'templates', 'subscription',
            ];
            for (const page of v0_1_pages) {
                expect(TOKEN_GATED_PAGES.has(page)).toBe(false);
            }
        });
    });

    describe('getFooterNav', () => {
        it('returns the v0.1 nav when tokenEconomy is off', () => {
            const items = getFooterNav({ tokenEconomy: false });
            const labels = items.map(i => i.label);
            expect(labels).toContain('Browser');
            expect(labels).toContain('Eepsites');
            expect(labels).not.toContain('Staking');
            expect(labels).not.toContain('Bounties');
            expect(labels).not.toContain('Governance');
            expect(labels).not.toContain('Referrals');
        });

        it('returns the v0.2 nav when tokenEconomy is on', () => {
            const items = getFooterNav({ tokenEconomy: true });
            const labels = items.map(i => i.label);
            expect(labels).toContain('Staking');
            expect(labels).toContain('Bounties');
            expect(labels).toContain('Governance');
            expect(labels).toContain('Referrals');
        });

        it('always includes Dashboard and Protect (both nav variants)', () => {
            for (const tokenEconomy of [true, false]) {
                const items = getFooterNav({ tokenEconomy });
                const pages = items.map(i => i.page);
                expect(pages).toContain('dashboard');
                expect(pages).toContain('protect');
            }
        });

        it('every nav item has an icon and a label', () => {
            for (const tokenEconomy of [true, false]) {
                const items = getFooterNav({ tokenEconomy });
                for (const item of items) {
                    expect(item.label).toBeTruthy();
                    expect(item.icon).toBeTruthy();
                    expect(item.page).toBeTruthy();
                }
            }
        });

        it('returns a small enough nav for mobile (≤6 items)', () => {
            for (const tokenEconomy of [true, false]) {
                const items = getFooterNav({ tokenEconomy });
                expect(items.length).toBeLessThanOrEqual(6);
            }
        });

        it('returned arrays are not the same instance for different flag states', () => {
            const off = getFooterNav({ tokenEconomy: false });
            const on = getFooterNav({ tokenEconomy: true });
            expect(off).not.toBe(on);
        });
    });

    describe('isPageBlocked', () => {
        it('blocks token-gated pages when tokenEconomy is off', () => {
            const flags = { tokenEconomy: false };
            expect(isPageBlocked('staking', flags)).toBe(true);
            expect(isPageBlocked('governance', flags)).toBe(true);
            expect(isPageBlocked('bounties', flags)).toBe(true);
            expect(isPageBlocked('emissions', flags)).toBe(true);
            expect(isPageBlocked('referrals', flags)).toBe(true);
        });

        it('does NOT block product pages when tokenEconomy is off', () => {
            const flags = { tokenEconomy: false };
            expect(isPageBlocked('dashboard', flags)).toBe(false);
            expect(isPageBlocked('browser', flags)).toBe(false);
            expect(isPageBlocked('eepsite-hosting', flags)).toBe(false);
            expect(isPageBlocked('protect', flags)).toBe(false);
            expect(isPageBlocked('wallet', flags)).toBe(false);
            expect(isPageBlocked('settings', flags)).toBe(false);
            expect(isPageBlocked('code-editor', flags)).toBe(false);
            expect(isPageBlocked('meshnet-config', flags)).toBe(false);
            expect(isPageBlocked('outproxy-config', flags)).toBe(false);
            expect(isPageBlocked('templates', flags)).toBe(false);
            expect(isPageBlocked('subscription', flags)).toBe(false);
        });

        it('blocks NOTHING when tokenEconomy is on', () => {
            const flags = { tokenEconomy: true };
            const allPages: Page[] = [
                'dashboard', 'emissions', 'settings', 'browser', 'wasm', 'native',
                'workflows', 'protect', 'wallet', 'staking', 'governance',
                'bounties', 'referrals', 'eepsite-hosting', 'code-editor',
                'meshnet-config', 'outproxy-config', 'templates', 'subscription',
            ];
            for (const page of allPages) {
                expect(isPageBlocked(page, flags)).toBe(false);
            }
        });
    });
});
