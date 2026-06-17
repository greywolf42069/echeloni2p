// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';

import {
    GENESIS_COLLECTION_MINTS,
    parseCollectionFromMetadata,
    walletHoldsGenesisToken,
} from '../../hooks/seekerVerification';

const SAGA_GENESIS = '46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC';

// ── Build a synthetic Metaplex Metadata account buffer ──────────────
// Layout per the parser: key(1) updateAuth(32) mint(32) name(str)
// symbol(str) uri(str) sellerFee(2) creators(Option<Vec>) primarySale(1)
// isMutable(1) editionNonce(Option<u8>) tokenStandard(Option<u8>)
// collection(Option<{verified:bool, key:pubkey}>)

function u32le(n: number): number[] {
    return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}
function strField(s: string): number[] {
    const bytes = Array.from(new TextEncoder().encode(s));
    return [...u32le(bytes.length), ...bytes];
}

function buildMetadata(opts: {
    collectionKey?: string;
    verified?: boolean;
    hasCollection?: boolean;
    creators?: number;
}): Uint8Array {
    const bytes: number[] = [];
    bytes.push(4);                       // key
    bytes.push(...new Array(32).fill(1)); // updateAuthority
    bytes.push(...new Array(32).fill(2)); // mint
    bytes.push(...strField('Genesis Token')); // name
    bytes.push(...strField('SGT'));      // symbol
    bytes.push(...strField('https://x.i2p/m.json')); // uri (in-network-ish; irrelevant here)
    bytes.push(0, 0);                    // sellerFeeBasisPoints
    // creators Option<Vec<Creator>>
    const nCreators = opts.creators ?? 0;
    if (nCreators > 0) {
        bytes.push(1);                   // Some
        bytes.push(...u32le(nCreators));
        for (let i = 0; i < nCreators; i++) {
            bytes.push(...new Array(32).fill(9)); // creator pubkey
            bytes.push(1);               // verified
            bytes.push(100);             // share
        }
    } else {
        bytes.push(0);                   // None
    }
    bytes.push(0);                       // primarySaleHappened
    bytes.push(1);                       // isMutable
    bytes.push(0);                       // editionNonce None
    bytes.push(0);                       // tokenStandard None
    // collection Option
    if (opts.hasCollection === false) {
        bytes.push(0);                   // None
    } else {
        bytes.push(1);                   // Some
        bytes.push(opts.verified ? 1 : 0);
        const key = new PublicKey(opts.collectionKey ?? SAGA_GENESIS);
        bytes.push(...Array.from(key.toBytes()));
    }
    return new Uint8Array(bytes);
}

describe('parseCollectionFromMetadata', () => {
    it('parses a verified Saga Genesis collection', () => {
        const data = buildMetadata({ collectionKey: SAGA_GENESIS, verified: true });
        const result = parseCollectionFromMetadata(data);
        expect(result).not.toBeNull();
        expect(result!.key).toBe(SAGA_GENESIS);
        expect(result!.verified).toBe(true);
    });

    it('parses an unverified collection (verified=false)', () => {
        const data = buildMetadata({ collectionKey: SAGA_GENESIS, verified: false });
        const result = parseCollectionFromMetadata(data);
        expect(result!.verified).toBe(false);
    });

    it('returns null when there is no collection', () => {
        const data = buildMetadata({ hasCollection: false });
        expect(parseCollectionFromMetadata(data)).toBeNull();
    });

    it('parses correctly past a creators array', () => {
        const data = buildMetadata({ collectionKey: SAGA_GENESIS, verified: true, creators: 3 });
        const result = parseCollectionFromMetadata(data);
        expect(result!.key).toBe(SAGA_GENESIS);
        expect(result!.verified).toBe(true);
    });

    it('returns null on truncated garbage instead of throwing', () => {
        expect(parseCollectionFromMetadata(new Uint8Array([4, 1, 2, 3]))).toBeNull();
    });

    it('GENESIS_COLLECTION_MINTS contains the Saga collection', () => {
        expect(GENESIS_COLLECTION_MINTS).toContain(SAGA_GENESIS);
    });
});

// ── walletHoldsGenesisToken against a fake Connection ───────────────

function fakeConnection(opts: {
    nftMints: string[];
    metadataByPda: Record<string, Uint8Array | null>;
}): any {
    return {
        getParsedTokenAccountsByOwner: async () => ({
            value: opts.nftMints.map(mint => ({
                account: {
                    data: {
                        parsed: {
                            info: {
                                mint,
                                tokenAmount: { decimals: 0, uiAmount: 1 },
                            },
                        },
                    },
                },
            })),
        }),
        getMultipleAccountsInfo: async (pdas: PublicKey[]) =>
            pdas.map(pda => {
                const data = opts.metadataByPda[pda.toBase58()];
                return data ? { data } : null;
            }),
    };
}

// Helper: compute the metadata PDA the way the module does.
const METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
function metaPda(mintB58: string): string {
    const mint = new PublicKey(mintB58);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
        METADATA_PROGRAM,
    );
    return pda.toBase58();
}

const FAKE_MINT = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
const OWNER = new PublicKey('9oG2Aw3Kw7VXTrqJL3rfwBcRsM5jq6N7gW8aBcDeFgHj');

describe('walletHoldsGenesisToken', () => {
    it('returns true for a verified Genesis NFT', async () => {
        const conn = fakeConnection({
            nftMints: [FAKE_MINT],
            metadataByPda: {
                [metaPda(FAKE_MINT)]: buildMetadata({ collectionKey: SAGA_GENESIS, verified: true }),
            },
        });
        expect(await walletHoldsGenesisToken(conn, OWNER)).toBe(true);
    });

    it('returns false for an UNVERIFIED Genesis collection (anti-spoof)', async () => {
        // Anyone can claim the collection key; only verified counts.
        const conn = fakeConnection({
            nftMints: [FAKE_MINT],
            metadataByPda: {
                [metaPda(FAKE_MINT)]: buildMetadata({ collectionKey: SAGA_GENESIS, verified: false }),
            },
        });
        expect(await walletHoldsGenesisToken(conn, OWNER)).toBe(false);
    });

    it('returns false for a verified NFT in a DIFFERENT collection', async () => {
        const otherCollection = new PublicKey('11111111111111111111111111111112').toBase58();
        const conn = fakeConnection({
            nftMints: [FAKE_MINT],
            metadataByPda: {
                [metaPda(FAKE_MINT)]: buildMetadata({ collectionKey: otherCollection, verified: true }),
            },
        });
        expect(await walletHoldsGenesisToken(conn, OWNER)).toBe(false);
    });

    it('returns false when the wallet has no NFTs', async () => {
        const conn = fakeConnection({ nftMints: [], metadataByPda: {} });
        expect(await walletHoldsGenesisToken(conn, OWNER)).toBe(false);
    });

    it('returns false (not throw) when the RPC errors', async () => {
        const conn: any = {
            getParsedTokenAccountsByOwner: async () => { throw new Error('rpc down'); },
        };
        expect(await walletHoldsGenesisToken(conn, OWNER)).toBe(false);
    });

    it('ignores fungible tokens (decimals != 0)', async () => {
        const conn: any = {
            getParsedTokenAccountsByOwner: async () => ({
                value: [{
                    account: { data: { parsed: { info: {
                        mint: FAKE_MINT,
                        tokenAmount: { decimals: 6, uiAmount: 100 },
                    } } } },
                }],
            }),
            getMultipleAccountsInfo: async () => [],
        };
        expect(await walletHoldsGenesisToken(conn, OWNER)).toBe(false);
    });
});
