/**
 * Wallet Page — Robinhood-Inspired Redesign
 * 
 * Dark, clean, minimal. Big numbers. Glassmorphism.
 * Matches the RTD Swap aesthetic.
 */

import React, { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import TokenBalanceCard from '../TokenBalanceCard.tsx';
import type { Transaction, TokenBalance } from '../../types';
import './Wallet.css';

// ── Icons ────────────────────────────────────────────────────

const ArrowUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4v5h5M20 20v-5h-5" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 4m16 16l-1.64-1.64A9 9 0 0 1 3.51 15" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
  </svg>
);

// ── Helpers ──────────────────────────────────────────────────

const timeSince = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
};

const truncateAddress = (addr: string) =>
  `${addr.substring(0, 4)}...${addr.substring(addr.length - 4)}`;

// ── Transaction Row ──────────────────────────────────────────

const TransactionRow: React.FC<{ tx: Transaction }> = ({ tx }) => {
  const isSend = tx.type === 'send';

  return (
    <a
      href={`https://solscan.io/tx/${tx.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="wallet-tx-row"
    >
      <div className="tx-left">
        <div className={`tx-icon ${isSend ? 'send' : 'receive'}`}>
          {isSend ? <ArrowUpIcon /> : <ArrowDownIcon />}
        </div>
        <div>
          <p className="tx-type">
            {isSend ? 'Sent' : 'Received'} {tx.tokenSymbol}
          </p>
          <p className="tx-party">
            {isSend ? 'To' : 'From'} {truncateAddress(tx.party)}
          </p>
        </div>
      </div>
      <div className="tx-right">
        <p className={`tx-amount ${isSend ? 'send' : 'receive'}`}>
          {isSend ? '-' : '+'}{tx.amount.toLocaleString()} {tx.tokenSymbol}
        </p>
        <p className="tx-time">{timeSince(tx.timestamp)}</p>
      </div>
    </a>
  );
};

// ── Sparkline Mini ───────────────────────────────────────────

const MiniSparkline: React.FC<{ positive: boolean }> = ({ positive }) => {
  const data = Array.from({ length: 20 }, (_, i) =>
    positive ? 50 + Math.random() * 50 : 30 + Math.random() * 40
  );
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 60;
      const y = 24 - ((v - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="60" height="24" className="mini-sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? 'var(--wlt-green)' : 'var(--wlt-red)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ── Main Component ───────────────────────────────────────────

interface WalletProps {
  openModal: (modal: 'send' | 'receive') => void;
  onSwap: () => void;
  transactions: Transaction[];
  tokenBalances: TokenBalance[];
}

const Wallet: React.FC<WalletProps> = ({ openModal, onSwap, transactions, tokenBalances }) => {
  const { publicKey } = useWallet();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'send' | 'receive'>('all');
  const [copied, setCopied] = useState(false);

  const totalPortfolioValue = tokenBalances.reduce((acc, token) => acc + token.usdValue, 0);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const typeMatch = filterType === 'all' || tx.type === filterType;
      const searchMatch = searchTerm === '' ||
        tx.party.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.id.toLowerCase().includes(searchTerm.toLowerCase());
      return typeMatch && searchMatch;
    });
  }, [transactions, searchTerm, filterType]);

  return (
    <div className="wallet-page">

      {/* ── Hero: Portfolio Value ── */}
      <div className="wallet-hero">
        <div className="hero-header">
          {publicKey && (
            <button className="address-badge" onClick={copyAddress}>
              <span className="address-text">{truncateAddress(publicKey.toBase58())}</span>
              {copied ? <span className="copied-hint">Copied!</span> : <CopyIcon />}
            </button>
          )}
          <button
            className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshIcon />
          </button>
        </div>

        <div className="portfolio-value-section">
          <p className="portfolio-label">Portfolio Value</p>
          <h1 className="portfolio-value">
            ${totalPortfolioValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </h1>
          <div className="portfolio-change positive">
            <span>↑</span>
            <span>$124.50 (2.1%) today</span>
          </div>
          <div className="portfolio-cta-row">
            <button
              className="portfolio-swap-btn"
              onClick={onSwap}
              title="Go to RTD Swap"
              aria-label="Go to RTD Swap"
            >
              <span>Swap RTD</span>
              <span className="portfolio-swap-arrow">→</span>
            </button>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="quick-actions">
          <button className="action-btn send" onClick={() => openModal('send')}>
            <ArrowUpIcon />
            <span>Send</span>
          </button>
          <button className="action-btn receive" onClick={() => openModal('receive')}>
            <ArrowDownIcon />
            <span>Receive</span>
          </button>
        </div>
      </div>

      {/* ── Token List ── */}
      <div className="wallet-section">
        <h2 className="section-title">Tokens</h2>
        <div className="token-list">
          {tokenBalances.map(token => (
            <TokenBalanceCard key={token.symbol} token={token} />
          ))}
        </div>
      </div>

      {/* ── Activity ── */}
      <div className="wallet-section">
        <div className="activity-header">
          <h2 className="section-title">Activity</h2>
          <div className="filter-pills">
            {(['all', 'send', 'receive'] as const).map(type => (
              <button
                key={type}
                className={`filter-pill ${filterType === type ? 'active' : ''}`}
                onClick={() => setFilterType(type)}
              >
                {type === 'all' ? 'All' : type === 'send' ? 'Sent' : 'Received'}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="search-wrapper">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search address or TX..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Transaction List */}
        <div className="tx-list">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map(tx => (
              <TransactionRow key={tx.id} tx={tx} />
            ))
          ) : (
            <div className="empty-state">
              <p className="empty-icon">📭</p>
              <p className="empty-title">No transactions</p>
              <p className="empty-hint">Your activity will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer Links ── */}
      <div className="wallet-footer">
        {publicKey && (
          <a
            href={`https://solscan.io/account/${publicKey.toBase58()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            View on Solscan <ExternalLinkIcon />
          </a>
        )}
      </div>
    </div>
  );
};

export default Wallet;




