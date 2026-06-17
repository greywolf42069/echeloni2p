import React from 'react';

export interface Relayer {
  rank: number;
  publicKey: string;
  total_relayed_mb: number;
}

export interface EmissionDataPoint {
  block: number;
  emission: number;
}

export interface Referral {
    publicKey: string;
    date: string;
    reward: number;
    status: 'Completed' | 'Pending';
}

export type EepsiteStatus = 'Online' | 'Offline' | 'Error';

export interface FileContent {
    content: string;
}

export interface FileTree {
    [key: string]: FileTree | FileContent;
}

export interface Eepsite {
    id: string;
    name: string;
    localDirectory: string;
    status: EepsiteStatus;
    createdAt: Date;
    files: FileTree;
    /** Lightweight .git integration — every eepsite starts with an initial commit. */
    git?: {
        initialized: boolean;
        commits: GitCommit[];
    };
}

export interface GitCommit {
    id: string;           // short hash-like id
    message: string;
    timestamp: Date;
    /** Snapshot of the full FileTree at this commit (for restore) */
    filesSnapshot: FileTree;
    author?: string;      // future: wallet pubkey or "you"
}

export type Page = 'dashboard' | 'emissions' | 'settings' | 'browser' | 'wasm' | 'native' | 'workflows' | 'protect' | 'wallet' | 'swap' | 'staking' | 'governance' | 'bounties' | 'referrals' | 'eepsite-hosting' | 'code-editor' | 'meshnet-config' | 'outproxy-config' | 'templates' | 'subscription' | 'network-doctor';

export interface UserData {
    subscription: string;
    rtdBalance: number;
    staked: number;
    referrals: number;
    accruedStakingRewards: number;
    dataRelayed: number;
    rank: number;
}

export type WasmStatus = 'stopped' | 'initializing' | 'running' | 'error';

export interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'error' | 'warn';
}

export type WorkflowStatus = 'Active' | 'Paused' | 'Error';

export interface WorkflowConfig {
    // For "Mirror Blog"
    rssUrl?: string;
    eepsiteAddress?: string;
    // For "Peer Health Check"
    peerList?: string; // a string of comma-separated addresses
    notificationMethod?: string;
    // For "Staking Reward Auto-Compound"
    minClaimBalance?: number;
}

export interface Workflow {
    id: string;
    title: string;
    templateId: string; // Link back to the template
    description: string;
    status: WorkflowStatus;
    lastRun: string;
    runCount: number;
    config: WorkflowConfig;
}

export interface WorkflowTemplate {
    id: string;
    title: string;
    description: string;
    icon: string[]; // Store SVG path data as strings
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
    id: string;
    message: string;
    type: NotificationType;
    timestamp: Date;
    read: boolean;
}

export interface TokenBalance {
    name: string;
    symbol: string;
    logoUrl: string;
    balance: number;
    usdValue: number;
}

export interface Transaction {
    id: string; // signature
    type: 'send' | 'receive';
    tokenSymbol: string;
    amount: number;
    party: string; // other address
    timestamp: Date;
    status: 'Completed' | 'Pending' | 'Failed';
}

export interface ToastMessage {
    message: string;
    type: 'success' | 'error' | 'info';
}

export type PaymentMethod = 'RTD' | 'SOL' | 'USDC' | 'XMR';

export interface SubscriptionTier {
    id: string;
    name: string;
    prices: {
        [key in PaymentMethod]: number;
    };
    description: string;
    aprBoost: number;
}

export interface StakingEvent {
    type: 'Stake' | 'Unstake' | 'Claim';
    amount: number;
    date: Date;
}

export interface Threat {
    id: string;
    name: string;
    type: 'Tracker' | 'Malicious Site' | 'Phishing Attempt';
    timestamp: Date;
}

export interface ProofOfRelayVoucher {
    id:string;
    relayedMb: number;
    reward: number;
    claimed: boolean;
    timestamp: Date;
}

export type VoteOption = 'for' | 'against' | 'abstain';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: 'Active' | 'Passed' | 'Failed' | 'Executing';
  startDate: Date;
  endDate: Date;
  votes: {
      for: number;
      against: number;
      abstain: number;
  };
}

export interface UserVote {
    [proposalId: string]: VoteOption;
}

export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string; // Using a string for icon name/emoji for simplicity
    isUnlocked: boolean;
    reward: number; // RTD reward
}

export type BountyType = 'daily' | 'weekly' | 'special';

export interface Bounty {
    id: string;
    title: string;
    description: string;
    reward: number; // RTD reward
    goal: number;
    currentProgress: number;
    isComplete: boolean;
    isClaimed: boolean;
    type: BountyType;
    metric: string; // e.g. "MB Relayed", "Referrals"
}
