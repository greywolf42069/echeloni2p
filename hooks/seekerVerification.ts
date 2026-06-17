/**
 * Seeker / Saga Genesis Token verification (real on-chain check).
 *
 * Replaces the v0.1 `isSeekerHolder: false` placeholder with an actual
 * verification: does the connected wallet hold a Saga or Seeker Genesis
 * Token, verified-belonging to the official Solana Mobile collection?
 *
 * Method (per Solana Mobile docs — "Detecting Seeker Users", Method 2):
 *   1. Enumerate the wallet's SPL token accounts.
 *   2. Keep NFT candidates: amount == 1, decimals == 0.
 *   3. For each candidate mint, derive its Metaplex Token Metadata PDA
 *      and read the `collection` field.
 *   4. The wallet is a holder iff any NFT's collection.key is the
 *      official Genesis collection mint AND collection.verified == true.
 *      (The `verified` flag is the anti-spoof: anyone can put a
 *      collection key in their own NFT's metadata, but only the
 *      collection authority can set verified=true.)
 *
 * Genesis collection mints (from Solana Mobile docs):
 *   Saga:   46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC
 *   Seeker: published by Solana Mobile; added here when finalized. The
 *           list is checked as a set so adding the Seeker mint is a
 *           one-line change with no logic change.
 *
 * NOTE on trust model: a full guarantee uses Sign-In-With-Solana to
 * prove wallet ownership before this check (so a user can't claim
 * someone else's holdings). In v0.1 the wallet is already the
 * connected, signing wallet (we only ever check the user's OWN
 * connected pubkey), so ownership is implicit. When MWA SIWS lands
 * (Phase H), the daemon-side airdrop snapshot will re-verify.
 */

import {
    Connection,
    PublicKey,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

/** Official Genesis collection mints. Set = trivially extensible. */
export const GENESIS_COLLECTION_MINTS: ReadonlyArray<string> = [
    // Saga Genesis Token collection (confirmed, Solana Mobile docs).
    '46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC',
    // Seeker Genesis Token collection mint — add when Solana Mobile
    // publishes the final address. The check below already handles it.
];

const GENESIS_SET = new Set(GENESIS_COLLECTION_MINTS);

// Metaplex Token Metadata program id (mainnet).
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/** Derive the metadata PDA for a given mint. */
function metadataPda(mint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        METADATA_PROGRAM_ID,
    );
    return pda;
}

/**
 * Parse the `collection` field (key + verified) out of raw Metaplex
 * Token Metadata account data.
 *
 * The on-chain layout (Metaplex `Metadata`) is, in order:
 *   key:                u8         (1)
 *   updateAuthority:    pubkey     (32)
 *   mint:               pubkey     (32)
 *   name:               string     (4 len + N)
 *   symbol:             string     (4 len + N)
 *   uri:                string     (4 len + N)
 *   sellerFeeBasisPoints: u16      (2)
 *   creators:           Option<Vec<Creator>>
 *   primarySaleHappened: bool      (1)
 *   isMutable:          bool       (1)
 *   editionNonce:       Option<u8>
 *   tokenStandard:      Option<u8>
 *   collection:         Option<{ verified: bool, key: pubkey }>
 *
 * We parse forward to the collection Option. Returns
 * { key, verified } or null if absent / unparseable.
 */
export function parseCollectionFromMetadata(
    data: Uint8Array,
): { key: string; verified: boolean } | null {
    try {
        let o = 0;
        const need = (n: number) => {
            if (o + n > data.length) throw new RangeError('metadata truncated');
        };
        const skip = (n: number) => { need(n); o += n; };
        const readU32 = () => {
            need(4);
            const v = data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24);
            o += 4;
            return v >>> 0;
        };
        const skipString = () => { const len = readU32(); skip(len); };
        const readBool = () => { need(1); return data[o++] !== 0; };
        const readOption = () => { need(1); return data[o++] !== 0; }; // 1 = Some, 0 = None

        skip(1);          // key
        skip(32);         // updateAuthority
        skip(32);         // mint
        skipString();     // name
        skipString();     // symbol
        skipString();     // uri
        skip(2);          // sellerFeeBasisPoints

        // creators: Option<Vec<Creator>>
        if (readOption()) {
            const n = readU32();
            // each Creator = pubkey(32) + verified bool(1) + share u8(1) = 34
            o += n * 34;
        }

        skip(1);          // primarySaleHappened
        skip(1);          // isMutable

        // editionNonce: Option<u8>
        if (readOption()) skip(1);
        // tokenStandard: Option<u8>
        if (readOption()) skip(1);

        // collection: Option<Collection { verified: bool, key: pubkey }>
        if (!readOption()) return null;
        const verified = readBool();
        need(32);
        const keyBytes = data.slice(o, o + 32);
        o += 32;
        const key = new PublicKey(keyBytes).toBase58();
        return { key, verified };
    } catch {
        return null;
    }
}

/**
 * Returns true if `owner` holds a verified Genesis Token.
 *
 * Resilient: any RPC hiccup → returns false (we never block a
 * subscription on a flaky NFT lookup; worst case the user just
 * doesn't get the Seeker boost flag and can re-verify later).
 */
export async function walletHoldsGenesisToken(
    connection: Connection,
    owner: PublicKey,
): Promise<boolean> {
    let candidateMints: PublicKey[];
    try {
        const resp = await connection.getParsedTokenAccountsByOwner(owner, {
            programId: TOKEN_PROGRAM_ID,
        });
        candidateMints = resp.value
            .map(({ account }) => {
                const info = (account.data as { parsed?: { info?: any } }).parsed?.info;
                const amt = info?.tokenAmount;
                // NFT candidate: exactly 1 token, 0 decimals.
                if (amt && amt.decimals === 0 && amt.uiAmount === 1) {
                    try { return new PublicKey(info.mint); } catch { return null; }
                }
                return null;
            })
            .filter((m): m is PublicKey => m !== null);
    } catch (e) {
        console.warn('[seeker] token account lookup failed:', e);
        return false;
    }

    if (candidateMints.length === 0) return false;

    // Fetch metadata accounts for all candidates in one batch.
    const pdas = candidateMints.map(metadataPda);
    try {
        const accounts = await connection.getMultipleAccountsInfo(pdas);
        for (const acct of accounts) {
            if (!acct || !acct.data) continue;
            const collection = parseCollectionFromMetadata(
                acct.data instanceof Uint8Array ? acct.data : new Uint8Array(acct.data),
            );
            if (collection && collection.verified && GENESIS_SET.has(collection.key)) {
                return true;
            }
        }
    } catch (e) {
        console.warn('[seeker] metadata fetch failed:', e);
        return false;
    }
    return false;
}
