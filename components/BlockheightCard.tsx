import React, { useState, useEffect, useCallback, useRef } from 'react';
import Card from './ui/Card.tsx';

// A modernized, curated list of public RPC endpoints from diverse providers.
const RPC_ENDPOINTS = [
    'https://rpc.ankr.com/solana',
    'https://solana-rpc.publicnode.com',
    'https://solana-mainnet.rpc.triton.one/',
    'https://mainnet.rpc.solana.solutions',
    'https://api.rpcpool.com',
    'https://api.mainnet-beta.solana.com', // Official, lower priority
];

const NORMAL_REFRESH_INTERVAL = 30000; // 30 seconds
const INITIAL_BACKOFF_DELAY = 5000; // 5 seconds
const MAX_BACKOFF_DELAY = 60000; // 1 minute

const useSolanaBlockheight = () => {
    const [blockheight, setBlockheight] = useState<number | null>(null);
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    
    const timeoutIdRef = useRef<number | null>(null);
    const backoffDelayRef = useRef<number>(INITIAL_BACKOFF_DELAY);

    const fetchBlockheight = useCallback(async () => {
        console.log('[Blockheight] Attempting to fetch blockheight...');
        if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
        }

        const fetchPromises = RPC_ENDPOINTS.map(endpoint => 
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getBlockHeight'
                }),
                signal: AbortSignal.timeout(8000) // 8-second timeout per request
            }).then(async response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                if (data.error) throw new Error(`API Error on ${endpoint}: ${data.error.message}`);
                if (typeof data.result !== 'number') throw new Error(`Invalid response from ${endpoint}`);
                console.log(`[Blockheight] Success from endpoint: ${endpoint}`);
                return data.result;
            }).catch(error => {
                console.warn(`[Blockheight] Failed to fetch from endpoint: ${endpoint}`, error.message);
                throw error; // Re-throw to be caught by Promise.any logic
            })
        );

        try {
            // Fix: Replace `Promise.any` with a compatible implementation to support older TypeScript/JavaScript environments.
            const result = await new Promise<number>((resolve, reject) => {
                const errors: Error[] = [];
                let rejectedCount = 0;

                if (!fetchPromises || fetchPromises.length === 0) {
                    return reject(new Error('No promises to process.'));
                }

                fetchPromises.forEach((p, i) => {
                    Promise.resolve(p)
                        .then(resolve)
                        .catch(error => {
                            errors[i] = error;
                            rejectedCount++;
                            if (rejectedCount === fetchPromises.length) {
                                reject(new Error('All promises were rejected.'));
                            }
                        });
                });
            });
            
            console.log(`[Blockheight] Successfully fetched blockheight: ${result}`);
            setBlockheight(result);
            setStatus('success');
            backoffDelayRef.current = INITIAL_BACKOFF_DELAY; // Reset backoff on success
            console.log(`[Blockheight] Scheduling next fetch in ${NORMAL_REFRESH_INTERVAL / 1000}s.`);
            timeoutIdRef.current = window.setTimeout(fetchBlockheight, NORMAL_REFRESH_INTERVAL);
        } catch (error) {
            console.error("[Blockheight] Failed to fetch blockheight from all endpoints:", error);
            setStatus('error');
            // Schedule next attempt with exponential backoff
            console.log(`[Blockheight] Network error. Retrying in ${backoffDelayRef.current / 1000}s.`);
            timeoutIdRef.current = window.setTimeout(fetchBlockheight, backoffDelayRef.current);
            // Increase backoff for next failure
            backoffDelayRef.current = Math.min(backoffDelayRef.current * 2, MAX_BACKOFF_DELAY);
        }
    }, []);

    useEffect(() => {
        console.log('[Blockheight] Hook mounted. Starting blockheight fetch loop.');
        fetchBlockheight(); // Initial fetch
        
        return () => { // Cleanup on unmount
            console.log('[Blockheight] Hook unmounted. Clearing fetch timeout.');
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
            }
        };
    }, [fetchBlockheight]);

    return { blockheight, status };
};

const BlockheightCard: React.FC = () => {
  const { blockheight, status } = useSolanaBlockheight();

  const getEmissionValue = (height: number | null) => {
      if (height === null) return 'N/A';
      return (1000 * Math.exp(-height / 25000000)).toFixed(4);
  }
  
  const renderContent = () => {
      const errorMessage = "Network unstable. Retrying...";

      if (status === 'loading') {
          return <div className="h-8 w-32 bg-slate-700 rounded-md animate-pulse"></div>;
      }
      
      if (status === 'error' && blockheight === null) {
          return <span className="text-yellow-400 font-mono text-sm text-right">{errorMessage}</span>;
      }

      if (blockheight !== null) {
          const isStale = status === 'error';
          return (
              <div className="text-right">
                  <p className={`text-2xl font-bold transition-colors ${isStale ? 'text-gray-500' : 'text-purple-400'}`}>{blockheight.toLocaleString()}</p>
                  <p className={`text-sm transition-colors ${isStale ? 'text-yellow-400' : 'text-teal-400'}`}>
                      {isStale ? errorMessage : `${getEmissionValue(blockheight)} RTD/block`}
                  </p>
              </div>
          );
      }
      
      return null;
  };

  return (
    <Card className="max-w-md">
      <h2 className="text-xl font-semibold text-white">Network Status</h2>
      <div className="mt-4 flex justify-between items-baseline min-h-[48px]">
        <span className="text-gray-400">Emissions @ Blockheight:</span>
        {renderContent()}
      </div>
    </Card>
  );
};

export default BlockheightCard;