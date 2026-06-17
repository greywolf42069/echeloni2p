/**
 * TokenBalanceCard — Robinhood-Style
 * 
 * Clean, dark, minimal token row with sparkline.
 * Matches the wallet page aesthetic.
 */

import React from 'react';
import type { TokenBalance } from '../types';
import './TokenBalanceCard.css';

interface TokenBalanceCardProps {
  token: TokenBalance;
}

const MiniSparkline: React.FC<{ positive: boolean }> = ({ positive }) => {
  const data = Array.from({ length: 16 }, (_, i) =>
    positive ? 40 + Math.random() * 60 : 20 + Math.random() * 50
  );
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 48;
      const y = 20 - ((v - min) / range) * 20;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="48" height="20" className="token-mini-sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? 'var(--tbc-green)' : 'var(--tbc-red)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const TokenBalanceCard: React.FC<TokenBalanceCardProps> = ({ token }) => {
  // Simulate a random price change for demo
  const priceChange = (Math.random() - 0.4) * 10;
  const isPositive = priceChange >= 0;

  return (
    <div className="token-balance-card">
      {/* Left: Token Info */}
      <div className="tbc-left">
        <div className="tbc-icon-wrapper">
          {token.logoUrl ? (
            <img
              src={token.logoUrl}
              alt={`${token.name} logo`}
              className="tbc-icon-img"
            />
          ) : (
            <div className="tbc-icon-fallback">
              {token.symbol.substring(0, 2)}
            </div>
          )}
        </div>
        <div>
          <p className="tbc-name">{token.name}</p>
          <p className="tbc-symbol">{token.symbol}</p>
        </div>
      </div>

      {/* Center: Sparkline */}
      <div className="tbc-center">
        <MiniSparkline positive={isPositive} />
      </div>

      {/* Right: Value */}
      <div className="tbc-right">
        <p className="tbc-balance">
          {token.balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          })}
        </p>
        <p className="tbc-usd">
          ${token.usdValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>
    </div>
  );
};

export default TokenBalanceCard;
