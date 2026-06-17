#!/usr/bin/env node
/**
 * RTD Token Launch Script
 * 
 * Orchestrates the full RTD token launch on PumpSwap:
 * 1. Creates RTD SPL token
 * 2. Creates PumpSwap pool (RTD/SOL)
 * 3. Seeds initial liquidity
 * 4. Verifies everything is live
 * 
 * Usage:
 *   npx ts-node scripts/launch-rtd.ts [--dry-run]
 * 
 * Environment:
 *   SOLANA_RPC_URL     - RPC endpoint (default: mainnet-beta)
 *   FOUNDATION_KEYPAIR  - Path to foundation wallet keypair JSON
 *   INITIAL_RTD        - RTD to seed (default: 10000000 = 10M tokens)
 *   INITIAL_SOL        - SOL to seed (default: 10 = 10 SOL)
 *   SLIPPAGE           - Slippage tolerance % (default: 1)
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import { createRTDToken } from "./rtd-pumpswap";

// ── Config ───────────────────────────────────────────────────

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH = process.env.FOUNDATION_KEYPAIR || process.env.HOME + "/.echelon/keys/deployer.json";
const INITIAL_RTD = new BN(process.env.INITIAL_RTD || "10000000000000000"); // 10M RTD (9 decimals)
const INITIAL_SOL = new BN(String((parseFloat(process.env.INITIAL_SOL || "10")) * LAMPORTS_PER_SOL));
const SLIPPAGE = parseFloat(process.env.SLIPPAGE || "1");
const DRY_RUN = process.argv.includes("--dry-run");

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("       RTD TOKEN LAUNCH — PUMPSWAP");
  console.log("═══════════════════════════════════════════════════");
  console.log();

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN MODE — no transactions will be sent");
    console.log();
  }

  // Load foundation keypair
  let foundationKeypair: Keypair;
  try {
    const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
    foundationKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    console.log(`🔑 Foundation wallet: ${foundationKeypair.publicKey.toBase58()}`);
  } catch (e) {
    console.error(`❌ Failed to load keypair from ${KEYPAIR_PATH}`);
    console.error(`   Set FOUNDATION_KEYPAIR env var or place keypair at default path`);
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");

  // Check balance
  const balance = await connection.getBalance(foundationKeypair.publicKey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  console.log(`💰 Foundation balance: ${solBalance} SOL`);

  const requiredSOL = INITIAL_SOL.toNumber() / LAMPORTS_PER_SOL + 0.05; // pool creation + buffer
  if (solBalance < requiredSOL) {
    console.error(`❌ Insufficient SOL. Need ~${requiredSOL} SOL, have ${solBalance}`);
    process.exit(1);
  }

  console.log();
  console.log("📋 Launch Parameters:");
  console.log(`   Initial RTD:   ${INITIAL_RTD.toString()} (${INITIAL_RTD.toNumber() / 1e9} tokens)`);
  console.log(`   Initial SOL:   ${INITIAL_SOL.toNumber()} lamports (${INITIAL_SOL.toNumber() / LAMPORTS_PER_SOL} SOL)`);
  console.log(`   Slippage:      ${SLIPPAGE}%`);
  console.log(`   RPC:           ${RPC_URL}`);
  console.log();

  if (DRY_RUN) {
    console.log("✅ Dry run complete — config looks good!");
    return;
  }

  // ── Step 1: Create RTD Token ──
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  STEP 1: Create RTD SPL Token");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const rtdMint = await createRTDToken({
    authority: foundationKeypair,
    connection,
    decimals: 9,
    name: "Echelon RTD",
    symbol: "RTD",
  });

  console.log();

  // ── Token launch note ──
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  PUMPSWAP STEPS DEFERRED");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log();
  console.log("The RTD token can be created, but pool creation / liquidity seeding / launch verification");
  console.log("require the real PumpSwap SDK and on-chain launch stack to be installed in this environment.");
  console.log("This script is intentionally compile-safe and stops here until that dependency is present.");
  console.log();
  console.log(`  RTD Mint:  ${rtdMint.toBase58()}`);
  console.log(`  Explorer:  https://solscan.io/token/${rtdMint.toBase58()}`);
  console.log();
}

main().catch((err) => {
  console.error("❌ Launch failed:", err);
  process.exit(1);
});

