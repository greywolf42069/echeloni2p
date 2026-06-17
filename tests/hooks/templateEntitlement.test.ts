import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    clearEntitlement,
    getEntitlement,
    recordEntitlement,
} from '../../hooks/templateEntitlement';

const TEST_WALLET = 'TestWalletPubkey1111111111111111111111';

describe('templateEntitlement', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
    });
    afterEach(() => {
        try { localStorage.clear(); } catch { /* no-op */ }
    });

    it('getEntitlement returns null for an un-purchased wallet', () => {
        expect(getEntitlement(TEST_WALLET)).toBeNull();
    });

    it('getEntitlement returns null for null/undefined wallet', () => {
        expect(getEntitlement(null)).toBeNull();
    });

    it('recordEntitlement persists and getEntitlement reads it back', () => {
        recordEntitlement({
            wallet: TEST_WALLET,
            signature: '5JKqXyZ12345678901234567890ABC',
            paidAt: 1234567890,
        });
        const got = getEntitlement(TEST_WALLET);
        expect(got).toEqual({
            wallet: TEST_WALLET,
            signature: '5JKqXyZ12345678901234567890ABC',
            paidAt: 1234567890,
        });
    });

    it('entitlement is per-wallet (no leakage across wallets)', () => {
        recordEntitlement({
            wallet: TEST_WALLET,
            signature: 'sig',
            paidAt: 1,
        });
        expect(getEntitlement('OtherWalletDoesNotPay999')).toBeNull();
        expect(getEntitlement(TEST_WALLET)).not.toBeNull();
    });

    it('clearEntitlement removes the record for a wallet', () => {
        recordEntitlement({
            wallet: TEST_WALLET,
            signature: 'sig',
            paidAt: 1,
        });
        expect(getEntitlement(TEST_WALLET)).not.toBeNull();
        clearEntitlement(TEST_WALLET);
        expect(getEntitlement(TEST_WALLET)).toBeNull();
    });

    it('garbage in localStorage returns null (does not throw)', () => {
        localStorage.setItem('echelon.templatePack.entitlement.' + TEST_WALLET, '{not-json');
        expect(getEntitlement(TEST_WALLET)).toBeNull();
    });

    it('record with mismatched wallet field returns null', () => {
        localStorage.setItem(
            'echelon.templatePack.entitlement.' + TEST_WALLET,
            JSON.stringify({ wallet: 'someoneElse', signature: 'sig', paidAt: 1 }),
        );
        // Stored under TEST_WALLET key but record has wallet=someoneElse → reject
        expect(getEntitlement(TEST_WALLET)).toBeNull();
    });
});
