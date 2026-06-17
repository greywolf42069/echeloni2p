/**
 * Real Solana actions for Echelon.
 *
 * Replaces the previous `sim_tx_${Date.now()}` stubs with actual
 * SystemProgram / SPL token transfers signed via the connected wallet
 * adapter and broadcast to mainnet.
 *
 * Token list: we keep a tiny in-app registry of well-known mainnet
 * mints (SOL is native; USDC has a well-known mint). Anything else the
 * user holds will surface as the raw mint address — honest behaviour
 * beats fake "JUP" rows.
 */

import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    type TransactionSignature,
    type Finality,
} from '@solana/web3.js';
import {
    createTransferInstruction,
    getAssociatedTokenAddress,
    getAccount,
    getMint,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { TokenBalance, Transaction as AppTransaction } from '../types.ts';

/** Wallet-adapter shape we actually care about. Mirrors useWallet(). */
export interface AdapterLike {
    publicKey: PublicKey | null;
    sendTransaction: (tx: Transaction, connection: Connection) => Promise<TransactionSignature>;
}

const NATIVE_SOL_MINT = 'native:SOL';

/** Well-known mainnet mints we know how to label. */
const KNOWN_MINTS: Record<string, { name: string; symbol: string; logoUrl?: string }> = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
        name: 'USD Coin',
        symbol: 'USDC',
        logoUrl:
            'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    },
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
        name: 'Tether',
        symbol: 'USDT',
    },
};

const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

/* ---------------------------------------------------------------- balances */

/**
 * Returns the connected wallet's SOL balance plus any SPL token accounts.
 * No fake rows. Returns an empty list if the wallet is disconnected.
 */
export async function fetchTokenBalances(
    connection: Connection,
    owner: PublicKey,
): Promise<TokenBalance[]> {
    const out: TokenBalance[] = [];

    // Native SOL.
    const lamports = await connection.getBalance(owner, 'confirmed');
    out.push({
        name: 'Solana',
        symbol: 'SOL',
        logoUrl: SOL_LOGO,
        balance: lamports / LAMPORTS_PER_SOL,
        // We deliberately do not invent a USD value; a real price feed is
        // a separate concern (and a separate dependency).
        usdValue: 0,
    });

    // SPL tokens.
    const resp = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
    });
    for (const { account } of resp.value) {
        const info: any = account.data.parsed?.info;
        const mint: string | undefined = info?.mint;
        const ui: number | undefined = info?.tokenAmount?.uiAmount;
        if (!mint || ui === undefined || ui === 0) continue;
        const known = KNOWN_MINTS[mint];
        out.push({
            name: known?.name ?? mint,
            symbol: known?.symbol ?? mint.slice(0, 4) + '…' + mint.slice(-4),
            logoUrl: known?.logoUrl ?? '',
            balance: ui,
            usdValue: 0,
        });
    }

    return out;
}

/* ------------------------------------------------------------ transactions */

/** Resolve a TokenBalance row back to its on-chain mint, if applicable. */
function findMintForSymbol(symbol: string): string | null {
    if (symbol === 'SOL') return NATIVE_SOL_MINT;
    for (const [mint, meta] of Object.entries(KNOWN_MINTS)) {
        if (meta.symbol === symbol) return mint;
    }
    return null; // Unknown symbol → caller must supply mint directly.
}

export interface SendParams {
    /** What to send. */
    token: TokenBalance;
    /** Recipient wallet address (base58). */
    recipient: string;
    /** Human amount (e.g. 0.5 SOL, 10 USDC). */
    amount: number;
    /** Optional override mint when the symbol isn't in KNOWN_MINTS. */
    mintOverride?: string;
}

export class SolanaSendError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'SolanaSendError';
    }
}

/** Validate a base58 Solana address shape. */
export function isValidSolanaAddress(s: string): boolean {
    try {
        new PublicKey(s);
        return true;
    } catch {
        return false;
    }
}

/**
 * Build, sign, and broadcast a real transfer.
 *
 * Returns the on-chain signature once it's been submitted (we don't await
 * confirmation here — UIs can poll separately if they want a "Confirmed"
 * state). Throws SolanaSendError on any failure with a user-friendly
 * message.
 */
export async function sendToken(
    connection: Connection,
    adapter: AdapterLike,
    params: SendParams,
): Promise<TransactionSignature> {
    if (!adapter.publicKey) {
        throw new SolanaSendError('Wallet is not connected.');
    }
    if (!isValidSolanaAddress(params.recipient)) {
        throw new SolanaSendError('Recipient is not a valid Solana address.');
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
        throw new SolanaSendError('Amount must be a positive number.');
    }

    const recipient = new PublicKey(params.recipient);
    const tx = new Transaction();

    const mint = params.mintOverride ?? findMintForSymbol(params.token.symbol);
    if (!mint) {
        throw new SolanaSendError(
            `Echelon does not yet know the mint address for ${params.token.symbol}. Send unsupported.`,
        );
    }

    if (mint === NATIVE_SOL_MINT) {
        const lamports = Math.round(params.amount * LAMPORTS_PER_SOL);
        tx.add(SystemProgram.transfer({
            fromPubkey: adapter.publicKey,
            toPubkey: recipient,
            lamports,
        }));
    } else {
        // SPL transfer. We need to know the mint's decimals to convert
        // a UI amount into raw token units.
        const mintPubkey = new PublicKey(mint);
        const mintInfo = await getMint(connection, mintPubkey);
        const factor = 10 ** mintInfo.decimals;
        const rawAmount = BigInt(Math.round(params.amount * factor));

        const fromAta = await getAssociatedTokenAddress(mintPubkey, adapter.publicKey);
        const toAta = await getAssociatedTokenAddress(mintPubkey, recipient);

        // Create the recipient's ATA on-the-fly if it doesn't exist.
        try {
            await getAccount(connection, toAta);
        } catch {
            tx.add(createAssociatedTokenAccountInstruction(
                adapter.publicKey, // payer
                toAta,
                recipient,
                mintPubkey,
            ));
        }

        tx.add(createTransferInstruction(
            fromAta,
            toAta,
            adapter.publicKey,
            rawAmount,
        ));
    }

    try {
        const sig = await adapter.sendTransaction(tx, connection);
        return sig;
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Transaction failed.';
        throw new SolanaSendError(msg, e);
    }
}

/* ------------------------------------------------------------------- recent */

/**
 * Fetch a list of recent signatures for an address. Lightweight; we don't
 * fan out a getParsedTransaction per signature here because that's many RPC
 * calls. The wallet UI can lazily expand.
 */
export async function fetchRecentSignatures(
    connection: Connection,
    owner: PublicKey,
    limit: number = 25,
    commitment: Finality = 'confirmed',
): Promise<AppTransaction[]> {
    const sigs = await connection.getSignaturesForAddress(owner, { limit }, commitment);
    return sigs.map(s => ({
        id: s.signature,
        type: 'send',  // direction unknown without parsing — neutral default
        tokenSymbol: 'SOL',
        amount: 0,
        party: '',
        timestamp: s.blockTime ? new Date(s.blockTime * 1000) : new Date(),
        status: s.err ? 'Failed' : 'Completed',
    }));
}
