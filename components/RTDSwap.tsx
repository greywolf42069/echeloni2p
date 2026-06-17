/**
 * RTD Swap — PumpSwap Integration
 * 
 * Robinhood-inspired swap interface.
 * Clean, dark, minimal, SEXY.
 * 
 * Design principles:
 * - Dark mode with subtle gradients
 * - Big bold numbers
 * - Minimal chrome, maximum content
 * - Smooth micro-animations
 * - Glassmorphism cards
 * - One-tap swap
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import Banner from "./ui/Banner.tsx";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import "./RTDSwap.css";

// ── Constants ────────────────────────────────────────────────

function safePublicKey(value?: string | null): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

const RTD_MINT = safePublicKey((import.meta as any)?.env?.VITE_RTD_MINT || null);
const POOL_KEY = safePublicKey((import.meta as any)?.env?.VITE_POOL_KEY || null);
const SLIPPAGE = 0.5; // 0.5%

/** True when the token + pool are live and trading is possible. */
const POOL_LIVE = Boolean(RTD_MINT && POOL_KEY);

// ── Types ────────────────────────────────────────────────────

interface PoolStats {
  price: number;
  priceChange24h: number;
  tvl: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

type SwapDirection = "buy" | "sell";

// ── Sparkline Component ──────────────────────────────────────

const Sparkline: React.FC<{ data: number[]; positive: boolean }> = ({
  data,
  positive,
}) => {
  if (!data.length) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 120;
  const height = 40;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="sparkline">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={positive ? "#00d4aa" : "#ff4466"}
            stopOpacity="0.3"
          />
          <stop
            offset="100%"
            stopColor={positive ? "#00d4aa" : "#ff4466"}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#00d4aa" : "#ff4466"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ── Main Component ───────────────────────────────────────────

export const RTDSwap: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [direction, setDirection] = useState<SwapDirection>("buy");
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [flipAnimation, setFlipAnimation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch Pool Stats ──

  const fetchPoolStats = useCallback(async () => {
    if (!RTD_MINT || !POOL_KEY) {
      setPoolStats(null);
      setError(null);
      return;
    }
    try {
      // Real implementation: const pumpAmmSdk = new PumpAmmSdk(connection);
      // const pool = await pumpAmmSdk.fetchPool(POOL_KEY);
      setPoolStats(null);
      setPriceHistory([]);
    } catch (err) {
      console.error("Pool fetch failed:", err);
    }
  }, [connection]);

  useEffect(() => {
    fetchPoolStats();
    const interval = setInterval(fetchPoolStats, 10000);
    return () => clearInterval(interval);
  }, [fetchPoolStats]);

  // ── Calculate Output ──

  useEffect(() => {
    if (!inputAmount || !poolStats || parseFloat(inputAmount) === 0) {
      setOutputAmount("");
      return;
    }

    const input = parseFloat(inputAmount);
    const price = poolStats.price;

    if (direction === "buy") {
      setOutputAmount((input / price).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      }));
    } else {
      setOutputAmount((input * price).toFixed(6));
    }
  }, [inputAmount, poolStats, direction]);

  // ── Swap Handler ──

  const handleSwap = async () => {
    if (!POOL_LIVE) {
      setError("RTD token has not launched yet. Swap will be available once the token pool goes live.");
      return;
    }
    if (!publicKey || !inputAmount) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Real PumpSwap implementation goes here once token launches
      setError("Swap execution is not enabled yet. PumpSwap integration is still pending.");
    } catch (err: any) {
      setError(err.message || "Swap failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Flip with Animation ──

  const flipDirection = () => {
    setFlipAnimation(true);
    setTimeout(() => {
      setDirection((d) => (d === "buy" ? "sell" : "buy"));
      setInputAmount("");
      setOutputAmount("");
      setFlipAnimation(false);
    }, 200);
  };

  // ── Render ──

  const isPositive = (poolStats?.priceChange24h ?? 0) >= 0;

  return (
    <div className="rtd-swap">
      {/* ── Header Card ── */}
      <div className="swap-hero">
        <div className="hero-top">
          <div className="token-identity">
            <div className="token-icon">
              <span className="icon-glyph">⚡</span>
            </div>
            <div>
              <h1 className="token-name">RTD</h1>
              <span className="token-full">Echelon</span>
            </div>
          </div>
          <div className="hero-price">
            <span className="price-main">
              {poolStats
                ? `$${poolStats.price.toFixed(6)}`
                : "—"}
            </span>
            <span
              className={`price-change ${isPositive ? "positive" : "negative"}`}
            >
              {isPositive ? "↑" : "↓"}{" "}
              {Math.abs(poolStats?.priceChange24h ?? 0).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="hero-chart">
          <Sparkline data={priceHistory} positive={isPositive} />
        </div>

        {/* Stats Row */}
        <div className="hero-stats">
          <div className="stat-pill">
            <span className="stat-label">TVL</span>
            <span className="stat-value">
              {poolStats ? `${poolStats.tvl.toFixed(1)} SOL` : "—"}
            </span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">24h Vol</span>
            <span className="stat-value">
              {poolStats ? `${poolStats.volume24h.toFixed(0)} SOL` : "—"}
            </span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">High</span>
            <span className="stat-value">
              {poolStats ? `$${poolStats.high24h.toFixed(6)}` : "—"}
            </span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Low</span>
            <span className="stat-value">
              {poolStats ? `$${poolStats.low24h.toFixed(6)}` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Swap Card ── */}
      <div className={`swap-card ${inputFocused ? "focused" : ""}`}>
        {!POOL_LIVE && (
          <Banner kind="prelaunch" className="mb-4">
            RTD has not launched yet. The swap UI is preview-only — inputs are disabled until the token pool goes live on PumpSwap.
          </Banner>
        )}

        {!POOL_LIVE && (
          <div className="swap-details" style={{ marginBottom: 16 }}>
            <div className="detail-row">
              <span>Token</span>
              <span style={{ color: '#f59e0b' }}>Not deployed yet</span>
            </div>
            <div className="detail-row">
              <span>Liquidity pool</span>
              <span style={{ color: '#f59e0b' }}>Pending token launch</span>
            </div>
            <div className="detail-row">
              <span>Launch plan</span>
              <span>See RTD_LAUNCH_PLAN.md</span>
            </div>
            <div className="detail-row">
              <span>Launch prerequisite</span>
              <span>v0.1 traction (500+ subs, 50+ eepsites)</span>
            </div>
          </div>
        )}
        {/* Direction Toggle */}
        <div className="direction-toggle">
          <button
            className={`toggle-btn ${direction === "buy" ? "active buy" : ""}`}
            onClick={() => direction !== "buy" && flipDirection()}
          >
            Buy
          </button>
          <button
            className={`toggle-btn ${direction === "sell" ? "active sell" : ""}`}
            onClick={() => direction !== "sell" && flipDirection()}
          >
            Sell
          </button>
        </div>

        {/* Input Section */}
        <div className={`swap-input-section ${flipAnimation ? "flipping" : ""}`}>
          <div className="input-label-row">
            <span className="input-label">
              {direction === "buy" ? "You pay" : "You sell"}
            </span>
            {publicKey && (
              <span className="balance-hint">
                Balance: {direction === "buy" ? "0.00 SOL" : "0 RTD"}
              </span>
            )}
          </div>

          <div className={`big-input-wrapper ${inputFocused ? "focused" : ""}`}>
            <span className="input-currency">
              {direction === "buy" ? "SOL" : "RTD"}
            </span>
            <input
              ref={inputRef}
              type="number"
              className="big-input"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={POOL_LIVE ? "0" : "Token not launched"}
              min="0"
              step={direction === "buy" ? "0.01" : "1000"}
              disabled={!POOL_LIVE}
              style={!POOL_LIVE ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            />
          </div>

          {/* Quick Amount Buttons */}
          {direction === "buy" && POOL_LIVE && (
            <div className="quick-amounts">
              {["0.1", "0.5", "1", "5"].map((amt) => (
                <button
                  key={amt}
                  className={`quick-btn ${inputAmount === amt ? "active" : ""}`}
                  onClick={() => setInputAmount(amt)}
                >
                  {amt} SOL
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Arrow */}
        <div className="swap-arrow">
          <div className="arrow-line" />
          <div className="arrow-icon">↓</div>
          <div className="arrow-line" />
        </div>

        {/* Output Section */}
        <div className="swap-output-section">
          <div className="input-label-row">
            <span className="input-label">
              {direction === "buy" ? "You receive" : "You receive"}
            </span>
          </div>

          <div className="big-input-wrapper output">
            <span className="input-currency">
              {direction === "buy" ? "RTD" : "SOL"}
            </span>
            <span className="big-output">
              {outputAmount || "0"}
            </span>
          </div>
        </div>

        {/* Price Impact */}
        {inputAmount && poolStats && (
          <div className="swap-details">
            <div className="detail-row">
              <span>Price</span>
              <span>
                1 RTD = {poolStats.price.toFixed(8)} SOL
              </span>
            </div>
            <div className="detail-row">
              <span>Slippage</span>
              <span>{SLIPPAGE}%</span>
            </div>
            <div className="detail-row">
              <span>Fee</span>
              <span>0.25%</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="swap-message error">
            <span className="msg-icon">⚠️</span>
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="swap-message success">
            <span className="msg-icon">✅</span>
            {success}
          </div>
        )}

        {/* Swap Button */}
        {!POOL_LIVE ? (
          <button
            className="swap-execute-btn prelaunch"
            type="button"
            disabled
          >
            <span className="btn-copy">
              🚀 RTD Token — Coming Soon
            </span>
            <span className="btn-subcopy">
              Swap will unlock after the token launch on PumpSwap
            </span>
          </button>
        ) : (
          <button
            className={`swap-execute-btn ${direction} ${loading ? "loading" : ""}`}
            onClick={handleSwap}
            disabled={!connected || !inputAmount || loading}
          >
            {loading ? (
              <div className="btn-spinner" />
            ) : !connected ? (
              "Connect Wallet"
            ) : !inputAmount ? (
              "Enter an amount"
            ) : direction === "buy" ? (
              `Buy RTD`
            ) : (
              `Sell RTD`
            )}
          </button>
        )}
      </div>

      {/* ── Footer Links ── */}
      <div className="swap-footer">
        <a
          href={POOL_KEY ? `https://dexscreener.com/solana/${POOL_KEY.toBase58()}` : "https://dexscreener.com"}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          <span>📊</span> DexScreener
        </a>
        <a
          href={RTD_MINT ? `https://solscan.io/token/${RTD_MINT.toBase58()}` : "https://solscan.io"}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          <span>🔍</span> Solscan
        </a>
        <a
          href="https://github.com/echelon"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          <span>💻</span> GitHub
        </a>
      </div>
    </div>
  );
};

export default RTDSwap;





