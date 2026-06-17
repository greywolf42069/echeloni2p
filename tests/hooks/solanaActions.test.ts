/**
 * solanaActions tests.
 *
 * @vitest-environment node
 *
 * Pure unit tests against mocked Connection / wallet adapter.  We never
 * touch a real RPC.  The Connection mock implements just the methods
 * solanaActions actually uses.
 *
 * NOTE: this file uses the `node` test environment instead of jsdom.
 * @solana/buffer-layout does an instanceof Uint8Array check that fails
 * across the jsdom <-> Node realm boundary.  Solana logic doesn't need
 * a DOM anyway.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    type Connection,
    type TransactionSignature,
} from '@solana/web3.js';
import {
    SolanaSendError,
    fetchRecentSignatures,
    fetchTokenBalances,
    isValidSolanaAddress,
    sendToken,
} from '../../hooks/solanaActions';
import type { TokenBalance } from '../../types';

// Real-looking devnet/mainnet addresses for the test vectors.
const OWNER = new PublicKey('FwR3SzS3a2gJxdFsAhxSv6cFYNvFn2NFWGVy7H7TiToM');
const RECIPIENT = '4Nd1mYvzLZ4Z31x3yRYcF8AXaCwsGbqK8FoEYGm5z3vG';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Real Solana mainnet pubkeys we use as token-account stand-ins. Any
// valid base58 of length 32-44 works — these are SPL program addresses.
const TOKEN_ACCOUNT_PUBKEYS = [
    'So11111111111111111111111111111111111111112',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
];

/* ---------------------------------------------------------- isValid + helpers */

describe('isValidSolanaAddress', () => {
    it('accepts valid base58 pubkeys', () => {
        expect(isValidSolanaAddress(RECIPIENT)).toBe(true);
        expect(isValidSolanaAddress(OWNER.toBase58())).toBe(true);
    });

    it('rejects garbage / empty / wrong-length', () => {
        expect(isValidSolanaAddress('')).toBe(false);
        expect(isValidSolanaAddress('not-an-address')).toBe(false);
        expect(isValidSolanaAddress('0OIl_invalid_chars')).toBe(false);
    });
});

/* ----------------------------------------------------------- fetchTokenBalances */

function makeConnectionMock(opts: {
    lamports?: number;
    parsedAccounts?: Array<{ mint: string; uiAmount: number }>;
    signatures?: Array<{ signature: string; blockTime: number; err: unknown }>;
}) {
    return {
        getBalance: vi.fn().mockResolvedValue(opts.lamports ?? 0),
        getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
            value: (opts.parsedAccounts ?? []).map(({ mint, uiAmount }, i) => ({
                pubkey: new PublicKey(TOKEN_ACCOUNT_PUBKEYS[i % TOKEN_ACCOUNT_PUBKEYS.length]),
                account: {
                    data: { parsed: { info: { mint, tokenAmount: { uiAmount } } } },
                },
            })),
        }),
        getSignaturesForAddress: vi.fn().mockResolvedValue(opts.signatures ?? []),
    } as unknown as Connection;
}

describe('fetchTokenBalances', () => {
    it('always returns the SOL row first, with the correct ui amount', async () => {
        const conn = makeConnectionMock({ lamports: 2 * LAMPORTS_PER_SOL });
        const balances = await fetchTokenBalances(conn, OWNER);
        expect(balances[0].symbol).toBe('SOL');
        expect(balances[0].balance).toBeCloseTo(2);
    });

    it('labels USDC by name when its mint is present', async () => {
        const conn = makeConnectionMock({
            lamports: 0,
            parsedAccounts: [{ mint: USDC_MINT, uiAmount: 12.5 }],
        });
        const balances = await fetchTokenBalances(conn, OWNER);
        const usdc = balances.find(b => b.symbol === 'USDC');
        expect(usdc).toBeDefined();
        expect(usdc!.balance).toBe(12.5);
        expect(usdc!.name).toBe('USD Coin');
    });

    it('falls back to a truncated mint when the mint is unknown', async () => {
        const unknownMint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
        const conn = makeConnectionMock({
            lamports: 0,
            parsedAccounts: [{ mint: unknownMint, uiAmount: 100 }],
        });
        const balances = await fetchTokenBalances(conn, OWNER);
        const unknown = balances.find(b => b.name === unknownMint);
        expect(unknown).toBeDefined();
        // Truncated symbol is "JUPy…vCN".
        expect(unknown!.symbol).toMatch(/JUPy.*vCN/);
    });

    it('skips token accounts with zero balance', async () => {
        const conn = makeConnectionMock({
            lamports: 0,
            parsedAccounts: [
                { mint: USDC_MINT, uiAmount: 0 },
                { mint: USDC_MINT, uiAmount: 5 },
            ],
        });
        const balances = await fetchTokenBalances(conn, OWNER);
        // Only the non-zero USDC row, plus SOL itself.
        expect(balances.filter(b => b.symbol === 'USDC')).toHaveLength(1);
    });
});

describe('fetchRecentSignatures', () => {
    it('maps signature confirmations into AppTransaction shape', async () => {
        const conn = makeConnectionMock({
            signatures: [
                { signature: 'sig1', blockTime: 1700000000, err: null },
                { signature: 'sig2', blockTime: 1700001000, err: { InstructionError: [0, 'X'] } },
            ],
        });
        const txs = await fetchRecentSignatures(conn, OWNER, 25);
        expect(txs).toHaveLength(2);
        expect(txs[0]).toMatchObject({ id: 'sig1', status: 'Completed' });
        expect(txs[1]).toMatchObject({ id: 'sig2', status: 'Failed' });
    });
});

/* ---------------------------------------------------------------------- sendToken */

const solBalance: TokenBalance = {
    name: 'Solana', symbol: 'SOL', logoUrl: '', balance: 5, usdValue: 0,
};

describe('sendToken', () => {
    it('refuses to send when wallet is not connected', async () => {
        const conn = makeConnectionMock({});
        await expect(sendToken(conn, { publicKey: null, sendTransaction: vi.fn() }, {
            recipient: RECIPIENT, amount: 1, token: solBalance,
        })).rejects.toBeInstanceOf(SolanaSendError);
    });

    it('refuses an invalid recipient', async () => {
        const conn = makeConnectionMock({});
        const adapter = { publicKey: OWNER, sendTransaction: vi.fn() };
        await expect(sendToken(conn, adapter, {
            recipient: 'not-an-address', amount: 1, token: solBalance,
        })).rejects.toThrow(/valid Solana address/);
    });

    it('refuses non-positive amounts', async () => {
        const conn = makeConnectionMock({});
        const adapter = { publicKey: OWNER, sendTransaction: vi.fn() };
        await expect(sendToken(conn, adapter, {
            recipient: RECIPIENT, amount: 0, token: solBalance,
        })).rejects.toThrow(/positive number/);
        await expect(sendToken(conn, adapter, {
            recipient: RECIPIENT, amount: -1, token: solBalance,
        })).rejects.toThrow(/positive number/);
    });

    it('builds a SystemProgram.transfer when sending native SOL', async () => {
        const sendTransaction = vi.fn().mockResolvedValue('sig-sol' as TransactionSignature);
        const conn = makeConnectionMock({});
        const adapter = { publicKey: OWNER, sendTransaction };

        const sig = await sendToken(conn, adapter, {
            recipient: RECIPIENT, amount: 1.5, token: solBalance,
        });
        expect(sig).toBe('sig-sol');
        expect(sendTransaction).toHaveBeenCalledTimes(1);
        const [tx] = sendTransaction.mock.calls[0] as [Transaction, Connection];
        expect(tx.instructions).toHaveLength(1);
        const ix = tx.instructions[0];
        expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
        // Lamports field encoded in the transfer instruction (offset 4 = u64).
        // We can read it from ix.data; SystemProgram.transfer puts amount at offset 4 as u64 LE.
        const lamports = Number(ix.data.readBigUInt64LE(4));
        expect(lamports).toBe(1.5 * LAMPORTS_PER_SOL);
    });

    it('refuses to send tokens whose mint is unknown', async () => {
        const conn = makeConnectionMock({});
        const adapter = { publicKey: OWNER, sendTransaction: vi.fn() };
        const mystery: TokenBalance = {
            name: 'Mystery', symbol: 'MYST', logoUrl: '', balance: 1, usdValue: 0,
        };
        await expect(sendToken(conn, adapter, {
            recipient: RECIPIENT, amount: 1, token: mystery,
        })).rejects.toThrow(/mint address/);
    });

    it('wraps wallet adapter errors as SolanaSendError', async () => {
        const sendTransaction = vi.fn().mockRejectedValue(new Error('user rejected'));
        const conn = makeConnectionMock({});
        const adapter = { publicKey: OWNER, sendTransaction };
        await expect(sendToken(conn, adapter, {
            recipient: RECIPIENT, amount: 1, token: solBalance,
        })).rejects.toBeInstanceOf(SolanaSendError);
    });
});
