import type { Relayer, EmissionDataPoint, Referral, Workflow, Notification, NotificationType, TokenBalance, Transaction, SubscriptionTier, StakingEvent, Threat, ProofOfRelayVoucher, Proposal, Bounty, Achievement, Eepsite } from './types';

/* -----------------------------------------------------------------
 * v2.1 data audit (2026-05-28).
 *
 * The constants in this file fall into three buckets:
 *
 * 1. **REAL** — actually used by the v0.1 product.
 *      • SUBSCRIPTION_TIERS — wired into Dashboard + SubscriptionModal.
 *
 * 2. **TOKEN-GATED MOCKS** — only ever displayed when
 *      featureFlags.tokenEconomy === true. The pages that consume them
 *      (Staking, Governance, Bounties, Emissions, Referrals) are
 *      route-guarded in v0.1 and never render. These constants are
 *      kept as illustrative seeds for v0.2 development; they will be
 *      replaced with chain-fetched data once the relevant Anchor
 *      programs ship in Phase D + E.
 *      • LEADERBOARD_DATA, EMISSION_CHART_DATA, REFERRAL_DATA,
 *        WORKFLOW_DATA, STAKING_HISTORY_DATA,
 *        STAKED_SUPPLY_HISTORY_DATA, APR_DECAY_DATA,
 *        PROPOSALS_DATA, BOUNTIES_DATA, ACHIEVEMENTS_DATA,
 *        INITIAL_POR_VOUCHERS_DATA, SIMULATED_THREATS_DATA,
 *        TOTAL_RTD_SUPPLY, TOTAL_STAKED_RTD.
 *
 * 3. **DELETED** — the v2 cleanup landed in commit 1c6cd48 dropped
 *      the spammer setIntervals that consumed these. The constants
 *      themselves have been removed from this file:
 *        SIMULATED_NOTIFICATIONS    (notification spammer killed)
 *        NOTIFICATIONS_DATA         (App.tsx now starts with [])
 *        TRANSACTION_HISTORY_DATA   (replaced by fetchRecentSignatures)
 *        TOKEN_BALANCES_DATA        (replaced by fetchTokenBalances)
 *        EEPSITE_HOSTING_DATA       (eepsiteStore IndexedDB starts empty)
 *
 * Any constant in bucket 2 that does not have a `*_DATA` or
 * `~ illustrative` suffix in this file is an oversight — please
 * grep `/\* @illustrative \*\/` to spot them.
 * ----------------------------------------------------------------- */

/* @illustrative — token-gated mock; replaced by on-chain reads in v0.2 */
export const LEADERBOARD_DATA: Relayer[] = [
  { rank: 1, publicKey: 'Relay...XyZ1', total_relayed_mb: 150234 },
  { rank: 2, publicKey: 'Data...AbC2', total_relayed_mb: 145890 },
  { rank: 3, publicKey: 'Node...DeF3', total_relayed_mb: 139012 },
  { rank: 4, publicKey: 'Serv...GhI4', total_relayed_mb: 121567 },
  { rank: 5, publicKey: 'Prox...JkL5', total_relayed_mb: 118999 },
  { rank: 6, publicKey: 'Rout...MnP6', total_relayed_mb: 105432 },
  { rank: 7, publicKey: 'Hop...QrS7', total_relayed_mb: 98765 },
  { rank: 8, publicKey: 'I2P...TuV8', total_relayed_mb: 92345 },
  { rank: 9, publicKey: 'Sol...WxY9', total_relayed_mb: 88123 },
  { rank: 10, publicKey: 'Path...ZaB0', total_relayed_mb: 85678 },
];

export const EMISSION_CHART_DATA: EmissionDataPoint[] = [
    { block: 0, emission: 1000 },
    { block: 1000000, emission: 950 },
    { block: 2000000, emission: 880 },
    { block: 3000000, emission: 800 },
    { block: 4000000, emission: 710 },
    { block: 5000000, emission: 625 },
    { block: 6000000, emission: 550 },
    { block: 7000000, emission: 480 },
    { block: 8000000, emission: 410 },
    { block: 9000000, emission: 350 },
    { block: 10000000, emission: 300 },
    { block: 11000000, emission: 260 },
    { block: 12000000, emission: 220 },
    { block: 13000000, emission: 190 },
    { block: 14000000, emission: 160 },
    { block: 15000000, emission: 140 },
];

export const REFERRAL_DATA: Referral[] = [
    { publicKey: 'User...AbC1', date: '2023-10-26', reward: 50.00, status: 'Completed' },
    { publicKey: 'New...DeF2', date: '2023-10-25', reward: 50.00, status: 'Completed' },
    { publicKey: 'Friend...GhI3', date: '2023-10-22', reward: 25.00, status: 'Pending' },
    { publicKey: 'Peer...JkL4', date: '2023-10-20', reward: 50.00, status: 'Completed' },
];

export const WORKFLOW_DATA: Workflow[] = [
    { id: 'wf1', templateId: 'mirror-blog', title: 'Mirror Blog to I2P', description: 'Automatically syncs and re-hosts your public blog onto an I2P eepsite every 24 hours.', status: 'Active', lastRun: '3 hours ago', runCount: 128, config: { rssUrl: 'https://my-crypto-musings.com/rss', eepsiteAddress: 'myblog.i2p' } },
    { id: 'wf2', templateId: 'peer-health', title: 'Peer Health Check', description: 'Pings a list of private I2P peers and sends a notification if any are offline for more than 15 minutes.', status: 'Active', lastRun: '10 minutes ago', runCount: 2041, config: { peerList: 'peer1.i2p,peer2.i2p,peer3.i2p', notificationMethod: 'push' } },
    { id: 'wf3', templateId: 'auto-compound', title: 'Staking Reward Auto-Compound', description: 'Claims available staking rewards and re-stakes them into the pool once the balance exceeds 10 RTD.', status: 'Paused', lastRun: '2 days ago', runCount: 45, config: { minClaimBalance: 10 } },
    { id: 'wf4', templateId: 'ipfs-pin', title: 'IPFS Content Pinning', description: 'Monitors a directory for new files and automatically pins them to IPFS via a pinning service.', status: 'Error', lastRun: '1 hour ago', runCount: 93, config: {} },
    { id: 'wf5', templateId: 'mirror-blog', title: 'Backup News Feed', description: 'Keeps an I2P mirror of an important news feed.', status: 'Active', lastRun: '1 hour ago', runCount: 152, config: { rssUrl: 'https://important-news.com/feed.xml', eepsiteAddress: 'newsbackup.i2p' } },
];

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
    // v0.1 tiers — USDC-primary, RTD-discount surfaces only when
    // featureFlags.tokenEconomy is on.
    //
    // Free tier is implicit (every user is on Free until they
    // subscribe). It's listed here so the tier comparison UI can
    // show the full ladder; a user is never "subscribed" to Free.
    {
        id: 'free',
        name: 'Free',
        prices: { RTD: 0, SOL: 0, USDC: 0, XMR: 0 },
        description: 'Local I2P browser + IDE. Bring your own Gemini API key for AI assist. 3 starter templates. 1 hosted eepsite up to 10 MB.',
        aprBoost: 0,
    },
    {
        id: 'plus',
        name: 'Plus',
        prices: { RTD: 6.75, SOL: 0.06, USDC: 9, XMR: 0.06 },
        description: '50 GB bandwidth. Hosted EepGen (Gemma 3 4B) 100K tokens/day. 20 templates. 5 hosted eepsites up to 50 MB each.',
        aprBoost: 0,
    },
    {
        id: 'privacy',
        name: 'Privacy',
        prices: { RTD: 21.75, SOL: 0.19, USDC: 29, XMR: 0.18 },
        description: '200 GB bandwidth. Outproxy access (clearnet bridge). Priority routing. EepGen 1M tokens/day. Cover traffic. 10 hosted eepsites up to 100 MB each.',
        aprBoost: 0,
    },
    {
        id: 'operator',
        name: 'Operator',
        prices: { RTD: 74.25, SOL: 0.66, USDC: 99, XMR: 0.62 },
        description: '1 TB bandwidth. Cover traffic always-on. Dedicated outproxy. EepGen 5M tokens/day. Operator analytics. Eligible for early operator bond grant in v0.2.',
        aprBoost: 0,
    },
];

export const STAKING_HISTORY_DATA: StakingEvent[] = [
    { type: 'Stake', amount: 5000, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { type: 'Claim', amount: 125.72, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    { type: 'Unstake', amount: 1000, date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    { type: 'Stake', amount: 2500, date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
];


/* @illustrative — v2.1 design freeze: 100M cap (was 1B in v1). */
export const TOTAL_RTD_SUPPLY = 100_000_000;
/* @illustrative — bootstrap baseline; 5% bonded per simulator §9.6. */
export const TOTAL_STAKED_RTD = 5_000_000; // ~5% bonded

// Simulate the growth of staked supply over the same 66-day period as the APR decay
export const STAKED_SUPPLY_HISTORY_DATA: { day: number; stakedPercentage: number }[] = [
    { day: 0, stakedPercentage: 5.0 },
    { day: 4, stakedPercentage: 15.2 },
    { day: 8, stakedPercentage: 24.8 },
    { day: 12, stakedPercentage: 32.1 },
    { day: 16, stakedPercentage: 38.5 },
    { day: 20, stakedPercentage: 43.2 },
    { day: 24, stakedPercentage: 46.8 },
    { day: 30, stakedPercentage: 50.1 },
    { day: 38, stakedPercentage: 52.9 },
    { day: 46, stakedPercentage: 54.8 },
    { day: 54, stakedPercentage: 56.1 },
    { day: 60, stakedPercentage: 56.9 },
    { day: 66, stakedPercentage: 57.2 },
];


export const APR_DECAY_DATA: { day: number; apr: number }[] = [];
const initialAPR = 2000;
const finalAPR = 80;
const totalDays = 66;
const decayRate = -Math.log(finalAPR / initialAPR) / totalDays; // ≈ 0.04877

// Generate points for the chart, simulating the APR decay over time.
for (let day = 0; day <= totalDays; day += 4) {
    const apr = initialAPR * Math.exp(-decayRate * day);
    APR_DECAY_DATA.push({ day: day, apr: parseFloat(apr.toFixed(2)) });
}
if (APR_DECAY_DATA[APR_DECAY_DATA.length - 1].day < totalDays) {
    APR_DECAY_DATA.push({ day: totalDays, apr: finalAPR });
}

// A static list of potential threats to simulate real-time detection.
export const SIMULATED_THREATS_DATA: Omit<Threat, 'id' | 'timestamp'>[] = [
    { name: 'doubleclick.net', type: 'Tracker' },
    { name: 'googlesyndication.com', type: 'Tracker' },
    { name: 'badsite-miner.xyz', type: 'Malicious Site' },
    { name: 'facebook.com/tr', type: 'Tracker' },
    { name: 'solana-walet-verify.io', type: 'Phishing Attempt' },
    { name: 'ad.doubleclick.net', type: 'Tracker' },
    { name: 'crypto-drainer.ru', type: 'Malicious Site' },
    { name: 'c.clarity.ms', type: 'Tracker' },
    { name: 'phantom-claim-nft.com', type: 'Phishing Attempt' },
    { name: 'google-analytics.com', type: 'Tracker' },
    { name: 'evil-script.js', type: 'Malicious Site' },
    { name: 'track.adform.net', type: 'Tracker' },
    { name: 'verify-ledger.link', type: 'Phishing Attempt' },
    { name: 'yandex.ru/metrika', type: 'Tracker' },
    { name: 'malware-cdn.net', type: 'Malicious Site' },
    { name: 'free-sol-airdrop.org', type: 'Phishing Attempt' },
];

export const INITIAL_POR_VOUCHERS_DATA: ProofOfRelayVoucher[] = [
    { id: 'por_1', relayedMb: 500, reward: 2.5, claimed: true, timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    { id: 'por_2', relayedMb: 500, reward: 2.5, claimed: false, timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { id: 'por_3', relayedMb: 500, reward: 2.5, claimed: false, timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
];

export const PROPOSALS_DATA: Proposal[] = [
    {
        id: 'eip-001',
        title: 'EIP-001: Increase Staking APR Boost for Tier 2',
        description: 'This proposal suggests increasing the staking APR boost for Tier 2 subscribers from 15% to 20%. The goal is to further incentivize long-term network support from our most dedicated users. The additional rewards will be sourced from the community treasury fund, which has a sufficient surplus to cover this increase for the next 24 months without impacting the emission schedule.',
        proposer: 'Echelon Core Team',
        status: 'Active',
        startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        votes: { for: 12580000, against: 3450000, abstain: 1100000 },
    },
    {
        id: 'eip-002',
        title: 'EIP-002: Allocate Treasury Funds for I2P Router Development',
        description: 'To accelerate the development of our next-generation WASM-based I2P router, this proposal seeks to allocate 2,500,000 RTD from the treasury to a dedicated development grant. The funds will be disbursed over 6 months to a team of 3 core developers specializing in Rust and WebAssembly. A detailed budget and milestone breakdown is attached in the full proposal document.',
        proposer: 'User...DevFund',
        status: 'Active',
        startDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        votes: { for: 28900000, against: 1200000, abstain: 500000 },
    },
    {
        id: 'eip-003',
        title: 'EIP-003: Partnership with Monero Ecosystem',
        description: 'This proposal outlines a strategic partnership with the Monero community to integrate XMR as a primary payment option for Echelon subscriptions and to promote Echelon as a privacy-preserving network layer for Monero users. This involves joint marketing efforts and technical collaboration.',
        proposer: 'User...PrivacyMaxi',
        status: 'Passed',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000),
        votes: { for: 45000000, against: 5000000, abstain: 800000 },
    },
    {
        id: 'eip-004',
        title: 'EIP-004: Reduce Proof-of-Relay Voucher Threshold',
        description: 'To increase the frequency of rewards for smaller relay operators, this proposal suggests reducing the data threshold for generating a Proof-of-Relay voucher from 500MB to 250MB. This will not change the total RTD per MB relayed but will make rewards more accessible.',
        proposer: 'User...SmallRelay',
        status: 'Failed',
        startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000),
        votes: { for: 15000000, against: 21000000, abstain: 2000000 },
    },
];

export const BOUNTIES_DATA: Bounty[] = [
    { id: 'daily-relay', title: 'Daily Relay', description: 'Contribute to the network by relaying data.', reward: 5, goal: 1024, currentProgress: 768, isComplete: false, isClaimed: false, type: 'daily', metric: 'MB Relayed' },
    { id: 'weekly-stake', title: 'Weekly Staker', description: 'Stake RTD to help secure the network.', reward: 25, goal: 1000, currentProgress: 0, isComplete: false, isClaimed: false, type: 'weekly', metric: 'RTD Staked' },
    { id: 'weekly-refer', title: 'Network Growth', description: 'Invite new users to join the Echelon meshnet.', reward: 100, goal: 1, currentProgress: 1, isComplete: true, isClaimed: false, type: 'weekly', metric: 'Referrals' },
    { id: 'special-governance', title: 'Civic Duty', description: 'Participate in the future of Echelon by voting on a proposal.', reward: 50, goal: 1, currentProgress: 0, isComplete: false, isClaimed: false, type: 'special', metric: 'Votes Cast' },
];

export const ACHIEVEMENTS_DATA: Achievement[] = [
    { id: 'ach-stake-1', title: 'Novice Staker', description: 'Stake your first 1,000 RTD.', icon: '🏆', isUnlocked: true, reward: 10 },
    { id: 'ach-stake-2', title: 'Adept Staker', description: 'Stake over 10,000 RTD.', icon: '🏆', isUnlocked: true, reward: 50 },
    { id: 'ach-stake-3', title: 'Master Staker', description: 'Stake over 50,000 RTD.', icon: '🏆', isUnlocked: false, reward: 250 },
    { id: 'ach-relay-1', title: 'First Steps', description: 'Relay your first 10 GB of data.', icon: '⚡️', isUnlocked: true, reward: 10 },
    { id: 'ach-relay-2', title: 'Data Superhighway', description: 'Relay over 100 GB of data.', icon: '⚡️', isUnlocked: true, reward: 50 },
    { id: 'ach-relay-3', title: 'Network Backbone', description: 'Relay over 1 TB of data.', icon: '⚡️', isUnlocked: false, reward: 500 },
    { id: 'ach-gov-1', title: 'First Vote', description: 'Cast your first vote in a governance proposal.', icon: '🗳️', isUnlocked: false, reward: 20 },
    { id: 'ach-gov-2', title: 'Active Citizen', description: 'Vote on 5 different proposals.', icon: '🗳️', isUnlocked: false, reward: 100 },
    { id: 'ach-ref-1', title: 'Connector', description: 'Successfully refer 1 user.', icon: '🤝', isUnlocked: true, reward: 25 },
    { id: 'ach-ref-2', title: 'Superconnector', description: 'Successfully refer 5 users.', icon: '🤝', isUnlocked: false, reward: 150 },
    { id: 'ach-tier-1', title: 'Upgraded', description: 'Subscribe to a premium tier.', icon: '💎', isUnlocked: false, reward: 20 },
    { id: 'ach-native', title: 'Fully Protected', description: 'Enable system-wide protection with the native app.', icon: '🛡️', isUnlocked: false, reward: 20 },
];

// EEPSITE_HOSTING_DATA + defaultBlogHtml + defaultBlogCss removed in
// the v2.1 audit. The eepsite store hydrates from IndexedDB starting
// empty; users create their own eepsites in the IDE. The starter
// templates that used to live here will be re-introduced as proper
// designed templates in Phase E.6 (premium templates marketplace).