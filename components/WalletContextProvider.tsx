import React, { FC, useMemo, ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionProvider, WalletProvider, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Connection, clusterApiUrl } from '@solana/web3.js';

// ── Platform Detection (safe, no require()) ─────────────────
function isAndroid(): boolean {
    try {
        // Check for Capacitor native platform via the global it sets
        return !!(window as any).Capacitor?.isNativePlatform?.() &&
               (window as any).Capacitor?.getPlatform?.() === 'android';
    } catch {
        return false;
    }
}

// ── Mobile Wallet Adapter (MWA) ──────────────────────────────
let MwaAdapter: any = null;
let createDefaultAddressSelector: any = null;
let createDefaultAuthorizationResultCache: any = null;
let createDefaultWalletNotFoundHandler: any = null;

try {
    const mwa = require('@solana-mobile/wallet-adapter-mobile');
    MwaAdapter = mwa.SolanaMobileWalletAdapter;
    createDefaultAddressSelector = mwa.createDefaultAddressSelector;
    createDefaultAuthorizationResultCache = mwa.createDefaultAuthorizationResultCache;
    createDefaultWalletNotFoundHandler = mwa.createDefaultWalletNotFoundHandler;
} catch {
    // Not bundled — pure web build. MWA will be unavailable.
}

// ── RPC Endpoint Resilience ──────────────────────────────────
const RPC_ENDPOINTS: string[] = [
    clusterApiUrl(WalletAdapterNetwork.Mainnet),
    'https://solana-mainnet.g.alchemy.com/v2/demo',
    'https://rpc.ankr.com/solana',
].filter(Boolean);

// ── Connection Health Monitor ─────────────────────────────────

export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected';

interface ConnectionHealth {
    status: ConnectionStatus;
    latency: number;
    endpoint: string;
    lastCheck: number;
    consecutiveFailures: number;
}

const HEALTH_CHECK_INTERVAL = 30_000;
const LATENCY_THRESHOLD = 5000;
const MAX_FAILURES = 3;

export function useConnectionHealth(): ConnectionHealth {
    const { connection } = useConnection();
    const [health, setHealth] = useState<ConnectionHealth>({
        status: 'connected',
        latency: 0,
        endpoint: '',
        lastCheck: Date.now(),
        consecutiveFailures: 0,
    });
    const failuresRef = useRef(0);

    const checkHealth = useCallback(async () => {
        const start = performance.now();
        try {
            await connection.getVersion();
            const latency = performance.now() - start;
            failuresRef.current = 0;
            setHealth({
                status: latency > LATENCY_THRESHOLD ? 'degraded' : 'connected',
                latency: Math.round(latency),
                endpoint: connection.rpcEndpoint.replace(/\/\?.*$/, '').replace(/https?:\/\//, '').split('/')[0],
                lastCheck: Date.now(),
                consecutiveFailures: 0,
            });
        } catch {
            failuresRef.current += 1;
            setHealth(prev => ({
                ...prev,
                status: failuresRef.current >= MAX_FAILURES ? 'disconnected' : 'degraded',
                latency: -1,
                lastCheck: Date.now(),
                consecutiveFailures: failuresRef.current,
            }));
        }
    }, [connection]);

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, [checkHealth]);

    return health;
}

// ── Retry Wrapper ─────────────────────────────────────────────

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: { maxAttempts?: number; baseDelay?: number; label?: string } = {}
): Promise<T> {
    const { maxAttempts = 3, baseDelay = 1000, label = 'RPC' } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isLastAttempt = attempt === maxAttempts - 1;
            if (isLastAttempt) throw err;

            const isRateLimit =
                err?.message?.includes('429') ||
                err?.message?.includes('rate limit') ||
                err?.message?.includes('-32005') ||
                err?.statusCode === 429;

            const isTransient =
                err?.message?.includes('503') ||
                err?.message?.includes('timeout') ||
                err?.message?.includes('ECONNRESET') ||
                err?.message?.includes('fetch failed') ||
                err?.message?.includes('socket hang up');

            if (!isRateLimit && !isTransient) throw err;

            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
            console.warn(
                `[${label}] Attempt ${attempt + 1}/${maxAttempts} failed (${isRateLimit ? 'rate-limit' : 'transient'}). ` +
                `Retrying in ${Math.round(delay)}ms...`
            );
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw new Error(`${label}: All ${maxAttempts} attempts failed`);
}

// ── Main Provider ─────────────────────────────────────────────

const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const network = WalletAdapterNetwork.Mainnet;

    const endpoint = useMemo(() => {
        return RPC_ENDPOINTS[0] || clusterApiUrl(network);
    }, [network]);

    const wallets = useMemo(() => {
        try {
            if (isAndroid() && MwaAdapter && createDefaultAddressSelector && createDefaultAuthorizationResultCache && createDefaultWalletNotFoundHandler) {
                return [
                    new MwaAdapter({
                        addressSelector: createDefaultAddressSelector(),
                        appIdentity: {
                            name: 'Echelon',
                            uri: 'https://echelon.app',
                            icon: 'icons/icon-192.png',
                        },
                        authorizationResultCache: createDefaultAuthorizationResultCache(),
                        cluster: network === WalletAdapterNetwork.Mainnet ? 'mainnet-beta' : network,
                        onWalletNotFound: createDefaultWalletNotFoundHandler(),
                    }),
                ];
            }

            return [
                new PhantomWalletAdapter(),
                new SolflareWalletAdapter({ network }),
            ];
        } catch (err) {
            console.warn('[WalletContextProvider] Failed to initialize wallet adapters:', err);
            return [];
        }
    }, [network]);

    return (
        <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed', confirmTransactionInitialTimeout: 60000 }}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletContextProvider;
