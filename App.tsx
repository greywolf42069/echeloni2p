import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import Layout from './components/layout/Layout.tsx';
import Dashboard from './components/pages/Dashboard.tsx';
import Emissions from './components/pages/Emissions.tsx';
import Settings from './components/pages/Settings.tsx';
import Welcome from './components/pages/Welcome.tsx';
import Browser from './components/pages/Browser.tsx';
import Assistant from './components/pages/Assistant.tsx';
import Wasm from './components/pages/Wasm.tsx';
import NativeConnect from './components/pages/NativeConnect.tsx';
import Workflows from './components/pages/Workflows.tsx';
import Protect from './components/pages/Protect.tsx';
import Wallet from './components/pages/Wallet.tsx';
import Staking from './components/pages/Staking.tsx';
import Governance from './components/pages/Governance.tsx';
import Bounties from './components/pages/Bounties.tsx';
import Referrals from './components/pages/Referrals.tsx';
import EepsiteHosting from './components/pages/EepsiteHosting.tsx';
import Templates from './components/pages/Templates.tsx';
import Subscription from './components/pages/Subscription.tsx';
import RTDSwap from './components/RTDSwap.tsx';
import NetworkDoctor from './components/pages/NetworkDoctor.tsx';
import CodeEditor from './components/pages/CodeEditor.tsx';
import MeshnetConfig from './components/pages/MeshnetConfig.tsx';
import OutproxyConfig from './components/pages/OutproxyConfig.tsx';
import SendModal from './components/SendModal.tsx';
import ReceiveModal from './components/ReceiveModal.tsx';
import SubscriptionModal from './components/SubscriptionModal.tsx';
import HostEepsiteModal from './components/HostEepsiteModal.tsx';
import Toast from './components/Toast.tsx';
import InstallPrompt from './components/InstallPrompt.tsx';
import type { Page, UserData, WasmStatus, Notification, Transaction, ToastMessage, TokenBalance, SubscriptionTier, PaymentMethod, StakingEvent, Threat, ProofOfRelayVoucher, Proposal, UserVote, VoteOption, Bounty, Achievement, Eepsite, FileTree } from './types.ts';
// Fix: Using explicit '.ts' extension to resolve module import ambiguity.
// data.ts mock imports kept narrow on purpose. Token-economy mocks
// (LEADERBOARD_DATA, EMISSION_CHART_DATA, STAKED_SUPPLY_HISTORY_DATA,
// APR_DECAY_DATA, SIMULATED_THREATS_DATA, SIMULATED_NOTIFICATIONS,
// TOKEN_BALANCES_DATA, TRANSACTION_HISTORY_DATA) are NOT imported here
// and never reach the v0.1 user. Whatever's left below is either:
//  (a) used as a never-displayed empty-list placeholder, OR
//  (b) consumed by a token-gated page that only renders when
//      featureFlags.tokenEconomy is on.
import { SUBSCRIPTION_TIERS, INITIAL_POR_VOUCHERS_DATA, PROPOSALS_DATA, BOUNTIES_DATA, ACHIEVEMENTS_DATA } from './data.ts';
import { loadAllEepsites, saveAllEepsites } from './hooks/eepsiteStore.ts';
import { useI2pRouterHealth } from './hooks/useI2pRouterHealth.ts';
import { useI2pStats } from './hooks/useI2pStats.ts';
import { useFilterEvents } from './hooks/useFilterEvents.ts';
import { fetchTokenBalances, fetchRecentSignatures, sendToken, SolanaSendError } from './hooks/solanaActions.ts';
import { useFeatureFlags } from './hooks/useFeatureFlags.ts';
import {
    applySubscribe,
    getSubscription,
    saveSubscription,
    tierIdFromName,
} from './hooks/subscriptionClient.ts';
import { getFooterNav, isPageBlocked } from './config/navConfig.tsx';
import { foundationUsdcRecipient } from './config/foundation.ts';
import { walletHoldsGenesisToken } from './hooks/seekerVerification.ts';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [devMode, setDevMode] = useState<boolean>(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  // Feature flag snapshot — re-renders when flags change. Drives:
  //   • Footer nav (token-economy pages hidden in v0.1)
  //   • Route guard (redirect to dashboard if user lands on a gated page)
  //   • Token-economy UI surfaces (RTD balance, staking, governance, etc.)
  const featureFlags = useFeatureFlags();
  const footerNavItems = React.useMemo(
    () => getFooterNav(featureFlags),
    [featureFlags.tokenEconomy],
  );

  // Route guard: if a token-economy page is reached while the flag
  // is off (deep-linked, restored from session, or programmatically
  // navigated by stale code), bounce to dashboard.
  useEffect(() => {
    if (isPageBlocked(page, featureFlags)) {
      console.warn(
        `[App] Page "${page}" is gated behind featureFlags.tokenEconomy. Redirecting to dashboard.`,
      );
      setPage('dashboard');
    }
  }, [page, featureFlags]);

  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  // Real i2pd telemetry. The router health hook directly probes i2pd's
  // web console (no sync daemon needed); the stats hook goes through
  // the local sync daemon for the full structured payload.
  const { status: routerStatus } = useI2pRouterHealth(5000);
  const { stats: i2pStats } = useI2pStats(5000);
  // Real ad/threat block events from the daemon-side filter proxy. While
  // the daemon is down `blockEvents` stays empty + `filterError` is set;
  // we never fabricate entries.
  const { events: blockEvents } = useFilterEvents({ intervalMs: 5000, maxEvents: 50 });
  const wasmStatus: WasmStatus = routerStatus === 'running' ? 'running' : 'stopped';

  // Notifications state. v0.1 starts empty — no fake notifications
  // are seeded into the bell. Real entries land here from real events
  // (claim succeeded, subscription expiring, etc.) once those flows
  // ship. SIMULATED_NOTIFICATIONS spam is gone.
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Wallet State — populated from the chain when a wallet is connected.
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [walletLoading, setWalletLoading] = useState<boolean>(false);
  const [activeModal, setActiveModal] = useState<'send' | 'receive' | 'subscription' | 'host-eepsite' | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);

  // Threat Intel — sourced live from useFilterEvents above.
  // The legacy `threatLog: Threat[]` array is gone; everywhere that
  // used to consume it now reads `blockEvents: BlockEvent[]`.

  // Token-economy state. In v0.1 (featureFlags.tokenEconomy === false)
  // the consuming pages are blocked by the route guard so these arrays
  // stay empty and dead. They are seeded with mock data ONLY when token
  // economy is on so the v0.2 UI has something to show until real
  // on-chain reads land. Once Phase D + E ship, these become
  // chain-fetched and the seeds go away entirely.
  const tokenEconomyOn = featureFlags.tokenEconomy;
  const [porVouchers, setPorVouchers] = useState<ProofOfRelayVoucher[]>(
    () => (tokenEconomyOn ? INITIAL_POR_VOUCHERS_DATA : []),
  );
  const [proposals, setProposals] = useState<Proposal[]>(
    () => (tokenEconomyOn ? PROPOSALS_DATA : []),
  );
  const [userVotes, setUserVotes] = useState<UserVote>({});
  const [bounties, setBounties] = useState<Bounty[]>(
    () => (tokenEconomyOn ? BOUNTIES_DATA : []),
  );
  const [achievements, setAchievements] = useState<Achievement[]>(
    () => (tokenEconomyOn ? ACHIEVEMENTS_DATA : []),
  );

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const checkAndUnlockAchievement = useCallback((id: string) => {
    setAchievements(prev => prev.map(a => {
      if (a.id === id && !a.isUnlocked) {
        showToast(`Achievement Unlocked: ${a.title}!`, 'success');
        // Add reward to user balance
        setUserData(ud => ({ ...ud, rtdBalance: ud.rtdBalance + a.reward }));
        return { ...a, isUnlocked: true };
      }
      return a;
    }));
  }, [showToast]);

  // Eepsite Hosting State (hydrated from IndexedDB on boot, persisted on every change).
  const [eepsites, setEepsites] = useState<Eepsite[]>([]);
  const [eepsitesHydrated, setEepsitesHydrated] = useState(false);
  const [editingEepsite, setEditingEepsite] = useState<Eepsite | undefined>(undefined);
  const [activeEepsite, setActiveEepsite] = useState<Eepsite | null>(null);

  // Hydrate eepsites from IndexedDB on first mount. v0.1 starts empty
  // (no seeded mock eepsites). Users create their own via the IDE +
  // hosting flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadAllEepsites();
      if (cancelled) return;
      setEepsites(stored);
      setEepsitesHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist any change to eepsites back to IndexedDB. We skip the very
  // first effect run (when state is still the empty array pre-hydration).
  useEffect(() => {
    if (!eepsitesHydrated) return;
    saveAllEepsites(eepsites);
  }, [eepsites, eepsitesHydrated]);

  // userData defaults are HONEST: zero everywhere except real-derived
  // fields. v0.1 (featureFlags.tokenEconomy === false) hides
  // rtdBalance / staked / accruedStakingRewards / referrals from the
  // UI entirely. dataRelayed is mirrored from i2pStats.totalTransitBytes
  // by the effect below, only when the daemon reports real numbers.
  // rank is meaningful only after Phase D ships and the leaderboard
  // becomes real; until then it stays 0 and is hidden behind the flag.
  const [userData, setUserData] = useState<UserData>({
    subscription: 'Free',
    rtdBalance: 0,
    staked: 0,
    referrals: 0,
    accruedStakingRewards: 0,
    dataRelayed: 0,
    rank: 0,
  });
  
  const [stakingHistory, setStakingHistory] = useState<StakingEvent[]>([]);
  const [currentApr, setCurrentApr] = useState(0);

  // Fetch real balances + recent signatures whenever the wallet connects
  // or the user opens the wallet page. Replaces the previous hardcoded
  // TOKEN_BALANCES_DATA / TRANSACTION_HISTORY_DATA mock rows.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!connected || !publicKey) {
        setTokenBalances([]);
        setTransactions([]);
        return;
      }
      setWalletLoading(true);
      try {
        const [balances, sigs] = await Promise.all([
          fetchTokenBalances(connection, publicKey),
          fetchRecentSignatures(connection, publicKey, 25),
        ]);
        if (cancelled) return;
        setTokenBalances(balances);
        setTransactions(sigs);
      } catch (e) {
        if (!cancelled) {
          console.warn('[App] wallet refresh failed', e);
          showToast('Could not fetch wallet data from RPC.', 'error');
        }
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    };
    refresh();
    return () => { cancelled = true; };
  }, [connected, publicKey, connection, showToast]);

  // Hydrate userData.subscription from the persisted record on wallet
  // connect. (The localStorage record is the v0.1 source of truth;
  // v0.2 will read SubscriptionPDA on-chain.)
  useEffect(() => {
    if (!connected || !publicKey) return;
    const wallet = publicKey.toBase58();
    const rec = getSubscription(wallet);
    if (rec && rec.tier !== 'free') {
      const tierDef = SUBSCRIPTION_TIERS.find(t => t.id === rec.tier);
      if (tierDef) {
        setUserData(prev => prev.subscription === tierDef.name ? prev : { ...prev, subscription: tierDef.name });
      }
    }
  }, [connected, publicKey]);

  // Eepsite Actions
  // (handleUpdateEepsiteFile removed — the IDE replaces the whole file
  //  tree via handleUpdateEepsiteFiles below, which is depth-safe.)

  useEffect(() => {
    console.log('[App] Component mounted.');
    return () => console.log('[App] Component unmounted.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log(`[App] Navigated to page: ${page}`);
  }, [page]);

  // Mirror real i2pd transit volume into userData.dataRelayed so the
  // dashboard's "data relayed" stat is honest. Until Phase D ships the
  // Proof-of-Relay protocol there are no auto-generated vouchers and
  // the daily-relay bounty / relay achievements no longer auto-tick on
  // fake numbers.
  useEffect(() => {
    if (!i2pStats.running) return;
    const totalMib = i2pStats.totalTransitBytes / (1024 * 1024);
    setUserData(prev => (
      prev.dataRelayed === totalMib ? prev : { ...prev, dataRelayed: totalMib }
    ));
  }, [i2pStats.running, i2pStats.totalTransitBytes]);

  // Until the relay-claim Anchor program ships in v0.2 there is no
  // real APR to show — the simulator's projection lives in the
  // economy doc, not in user-facing state. currentApr stays 0 in
  // v0.1; the staking page is route-guarded and never reads it
  // anyway. The previous calculateCurrentApr(TOTAL_STAKED_RTD,
  // TOTAL_RTD_SUPPLY) call (using mock supply totals from data.ts)
  // is gone.
  //
  // The 35-second SIMULATED_NOTIFICATIONS spammer is also gone.
  // Real notifications will land here from real events.
  // ── (Effect intentionally absent.) ──

  // Staking reward accrual was previously a Math-based 5s setInterval
  // that ticked accruedStakingRewards forward against the fake APR.
  // It's gone. When Phase E.4 ships on v0.2, accruedStakingRewards
  // will be derived from on-chain stake account state read in real
  // time — no client-side simulation. Until then, accruedStakingRewards
  // stays 0 and is gated off in the UI by featureFlags.tokenEconomy.
  // ── (Effect intentionally absent.) ──

  // Threat detection used to be Math.random() picking from a fixed list
  // every 7 seconds. That's been removed. Real entries will land in
  // threatLog when Phase C wires up the daemon-side adblock filter. The
  // empty array stays empty until then.
  // (Effect intentionally absent.)

  const handleWasmSimulateError = useCallback(() => {
    // No-op kept only as a hook for the legacy assistant tool. With the
    // real i2pd integration there is no in-browser router to "simulate".
  }, []);

  const handleMarkNotificationAsRead = useCallback((id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)), []);
  const handleMarkAllNotificationsAsRead = useCallback(() => setNotifications(prev => prev.map(n => ({ ...n, read: true }))), []);

  const openModal = useCallback((modal: 'send' | 'receive') => setActiveModal(modal), []);
  const closeModal = useCallback(() => { setActiveModal(null); setSelectedTier(null); setEditingEepsite(undefined); }, []);

  // Real Solana send. Builds + signs + broadcasts a transaction via the
  // connected wallet adapter. Optimistically appends the signature to
  // history; the chain is the source of truth on next refresh.
  const handleSendTransaction = useCallback(async (tx: { recipient: string; amount: number; token: TokenBalance }) => {
    if (!publicKey || !sendTransaction) {
      showToast('Connect a wallet first.', 'error');
      return;
    }
    try {
      const sig = await sendToken(connection, { publicKey, sendTransaction }, {
        recipient: tx.recipient,
        amount: tx.amount,
        token: tx.token,
      });
      const broadcastTx: Transaction = {
        id: sig,
        type: 'send',
        tokenSymbol: tx.token.symbol,
        amount: tx.amount,
        party: tx.recipient,
        timestamp: new Date(),
        status: 'Pending',
      };
      setTransactions(prev => [broadcastTx, ...prev]);
      closeModal();
      showToast(`Submitted ${tx.amount} ${tx.token.symbol}. Signature: ${sig.slice(0, 8)}…`, 'success');
    } catch (e) {
      const msg = e instanceof SolanaSendError ? e.message
                : e instanceof Error ? e.message
                : 'Transaction failed.';
      console.error('[App] sendToken failed', e);
      showToast(msg, 'error');
    }
  }, [closeModal, connection, publicKey, sendTransaction, showToast]);

  const handleStake = useCallback((amount: number) => {
    if (amount <= 0 || amount > userData.rtdBalance) { showToast('Invalid stake amount.', 'error'); return; }
    const newStakedAmount = userData.staked + amount;
    setUserData(prev => ({ ...prev, rtdBalance: prev.rtdBalance - amount, staked: newStakedAmount }));
    setStakingHistory(prev => [{ type: 'Stake', amount, date: new Date() }, ...prev]);
    showToast(`Successfully staked ${amount.toLocaleString()} RTD!`, 'success');
    if (newStakedAmount >= 1000) checkAndUnlockAchievement('ach-stake-1');
    if (newStakedAmount >= 10000) checkAndUnlockAchievement('ach-stake-2');
    if (newStakedAmount >= 50000) checkAndUnlockAchievement('ach-stake-3');
  }, [userData.rtdBalance, userData.staked, showToast, checkAndUnlockAchievement]);

  const handleUnstake = useCallback((amount: number) => {
    if (amount <= 0 || amount > userData.staked) { showToast('Invalid unstake amount.', 'error'); return; }
    setUserData(prev => ({ ...prev, rtdBalance: prev.rtdBalance + amount, staked: prev.staked - amount }));
    setStakingHistory(prev => [{ type: 'Unstake', amount, date: new Date() }, ...prev]);
    showToast(`Successfully unstaked ${amount.toLocaleString()} RTD!`, 'success');
  }, [userData.staked, showToast]);

  const handleClaimRewards = useCallback(() => {
    const rewardsToClaim = userData.accruedStakingRewards;
    if (rewardsToClaim <= 0) { showToast('No rewards to claim.', 'error'); return; }
    setUserData(prev => ({ ...prev, rtdBalance: prev.rtdBalance + rewardsToClaim, accruedStakingRewards: 0 }));
    setStakingHistory(prev => [{ type: 'Claim', amount: rewardsToClaim, date: new Date() }, ...prev]);
    showToast(`Successfully claimed ${rewardsToClaim.toFixed(2)} RTD!`, 'success');
  }, [userData.accruedStakingRewards, showToast]);

  const handleClaimPorVouchers = useCallback(() => {
    const unclaimedVouchers = porVouchers.filter(v => !v.claimed);
    if (unclaimedVouchers.length === 0) { showToast('No relay rewards to claim.', 'error'); return; }
    const totalReward = unclaimedVouchers.reduce((sum, v) => sum + v.reward, 0);
    setUserData(prev => ({ ...prev, rtdBalance: prev.rtdBalance + totalReward }));
    setPorVouchers(prev => prev.map(v => ({ ...v, claimed: true })));
    showToast(`Successfully claimed ${totalReward.toFixed(2)} RTD from relay vouchers!`, 'success');
  }, [porVouchers, showToast]);

  const handleVote = useCallback((proposalId: string, vote: VoteOption) => {
    if (userData.staked <= 0) { showToast('You must have RTD staked to vote.', 'error'); return; }
    if (userVotes[proposalId]) { showToast('You have already voted on this proposal.', 'error'); return; }
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, votes: { ...p.votes, [vote]: p.votes[vote] + userData.staked } } : p));
    setUserVotes(prev => ({ ...prev, [proposalId]: vote }));
    showToast(`Successfully voted '${vote}' with ${userData.staked.toLocaleString()} power!`, 'success');
    checkAndUnlockAchievement('ach-gov-1');
    const newVoteCount = Object.keys(userVotes).length + 1;
    if (newVoteCount >= 5) checkAndUnlockAchievement('ach-gov-2');
  }, [userData.staked, userVotes, showToast, checkAndUnlockAchievement]);
  
  const openSubscriptionModal = useCallback((tier: SubscriptionTier) => { setSelectedTier(tier); setActiveModal('subscription'); }, []);

  const handleUpgrade = useCallback(async (tier: SubscriptionTier, paymentMethod: PaymentMethod) => {
    if (!publicKey || !sendTransaction) {
      showToast('Connect a wallet first.', 'error');
      return;
    }
    const wallet = publicKey.toBase58();
    const price = tier.prices[paymentMethod];
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Invalid price.', 'error');
      return;
    }

    // v0.1 only supports USDC + SOL payment lanes for actual chain
    // transfers; RTD + XMR are gated off in SubscriptionModal until
    // tokenEconomy=true and the RTD mint exists on-chain.
    if (paymentMethod !== 'USDC' && paymentMethod !== 'SOL') {
      showToast(`${paymentMethod} payment lane activates at v0.2.`, 'error');
      return;
    }

    const tokenBalance = tokenBalances.find(b => b.symbol === paymentMethod);
    if (!tokenBalance || tokenBalance.balance < price) {
      showToast(`Insufficient ${paymentMethod} balance.`, 'error');
      return;
    }

    // Single source of truth for the foundation recipient (config/foundation.ts).
    // Must be set to the real multisig before mainnet; placeholder is loud.
    const foundationRecipient = foundationUsdcRecipient();

    let signature: string;
    try {
      signature = await sendToken(connection, { publicKey, sendTransaction }, {
        recipient: foundationRecipient,
        amount: price,
        token: tokenBalance,
      });
    } catch (e) {
      const msg = e instanceof SolanaSendError ? e.message : e instanceof Error ? e.message : String(e);
      showToast(`Payment failed: ${msg}`, 'error');
      return;
    }

    // Persist the subscription record (mirrors the on-chain SubscriptionPDA
    // shape that programs/echelon-subscription/ will write at v0.2).
    const tierId = tierIdFromName(tier.name);
    if (tierId === 'free') return;
    const existing = getSubscription(wallet);
    const isFirstSubscribe = existing === null || existing.tier === 'free';

    // Real Seeker/Saga Genesis Token check on first subscribe. The flag
    // is sticky-once-true in applySubscribe, so we only need to detect
    // it the first time. A flaky NFT lookup just yields false (the user
    // keeps the boost-able status for a later re-subscribe).
    let isSeekerHolder = false;
    if (isFirstSubscribe) {
      try {
        isSeekerHolder = await walletHoldsGenesisToken(connection, publicKey);
      } catch {
        isSeekerHolder = false;
      }
    }

    const updated = applySubscribe(existing, {
      wallet,
      tier: tierId,
      durationMonths: 1,
      micros: paymentMethod === 'USDC'
        ? Math.round(price * 1_000_000)
        : 0, // SOL paid value isn't recorded as USDC; treated as USD-pegged 0 for airdrop weight
      signature,
      isFirstSubscribe,
      isSeekerHolder,
    });
    saveSubscription(updated);
    if (isSeekerHolder) {
      showToast('Seeker Genesis Token detected — 2× airdrop weight applied.', 'success');
    }

    setUserData(prev => ({ ...prev, subscription: tier.name }));
    showToast(`Subscribed to ${tier.name}. Signature: ${signature.slice(0, 8)}…`, 'success');
    closeModal();
  }, [publicKey, sendTransaction, tokenBalances, connection, showToast, closeModal]);

  const handleClaimBounty = useCallback((bountyId: string) => {
      let bountyTitle = '';
      setBounties(prev => prev.map(b => {
          if (b.id === bountyId && b.isComplete && !b.isClaimed) {
              bountyTitle = b.title;
              setUserData(u => ({ ...u, rtdBalance: u.rtdBalance + b.reward }));
              return { ...b, isClaimed: true };
          }
          return b;
      }));
      if (bountyTitle) {
          showToast(`Claimed ${bountyTitle} reward!`, 'success');
      }
  }, [showToast]);

  const handleClaimAllCompletedBounties = useCallback(() => {
    const completed = bounties.filter(b => b.isComplete && !b.isClaimed);
    if(completed.length === 0) {
        showToast('No completed bounties to claim.', 'error');
        return 'No bounties to claim.';
    }
    const totalReward = completed.reduce((sum, b) => sum + b.reward, 0);
    setUserData(u => ({ ...u, rtdBalance: u.rtdBalance + totalReward }));
    setBounties(prev => prev.map(b => (b.isComplete && !b.isClaimed) ? { ...b, isClaimed: true } : b));
    showToast(`Claimed ${completed.length} bounties for ${totalReward} RTD!`, 'success');
    return `Successfully claimed ${completed.length} bounty rewards.`;
  }, [bounties, showToast]);

  // Eepsite Handlers
  const openHostEepsiteModal = useCallback((eepsite?: Eepsite) => {
      setEditingEepsite(eepsite);
      setActiveModal('host-eepsite');
  }, []);

  const handleSaveEepsite = useCallback((site: Eepsite, openEditorAfterSave: boolean) => {
    let newSite = site;
    setEepsites(prev => {
        const exists = prev.some(e => e.id === site.id);
        if (exists) {
            return prev.map(e => e.id === site.id ? site : e);
        }
        newSite = site; // Ensure newSite is the one being added
        return [site, ...prev];
    });
    showToast(editingEepsite ? 'Eepsite updated successfully!' : 'New eepsite hosted!', 'success');
    closeModal();

    if (openEditorAfterSave) {
        setActiveEepsite(newSite);
        setPage('code-editor');
    }
  }, [closeModal, showToast, editingEepsite]);

  const handleDeleteEepsite = useCallback((id: string) => {
    setEepsites(prev => prev.filter(e => e.id !== id));
    showToast('Eepsite removed.', 'success');
  }, [showToast]);

  const handleToggleEepsiteStatus = useCallback((id: string, nextStatus?: 'Online' | 'Offline' | 'Error') => {
    setEepsites(prev => prev.map(e => {
        if (e.id !== id) return e;
        if (nextStatus) return { ...e, status: nextStatus };
        // Legacy flip if no explicit status was supplied.
        if (e.status === 'Error') return e;
        return { ...e, status: e.status === 'Online' ? 'Offline' : 'Online' };
    }));
  }, []);

  const handleOpenEditor = useCallback((eepsite: Eepsite) => {
    setActiveEepsite(eepsite);
    setPage('code-editor');
  }, []);

  const handleUpdateEepsiteFiles = useCallback((eepsiteId: string, newFiles: FileTree) => {
    setEepsites(prev => prev.map(site => site.id === eepsiteId ? {...site, files: newFiles} : site));
    setActiveEepsite(prev => prev && prev.id === eepsiteId ? {...prev, files: newFiles} : prev);
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard setPage={setPage} openModal={openModal} userData={userData} onUpgrade={openSubscriptionModal} eepsites={eepsites} i2pStats={i2pStats} blockEvents={blockEvents} walletPubkey={publicKey ? publicKey.toBase58() : null} />;
      case 'emissions': return <Emissions userData={userData} porVouchers={porVouchers} onClaimPorVouchers={handleClaimPorVouchers} />;
      case 'settings': return <Settings />;
      case 'wallet': return <Wallet openModal={openModal} onSwap={() => setPage('swap')} transactions={transactions} tokenBalances={tokenBalances} />;
      case 'swap': return <RTDSwap />;
      case 'staking': return <Staking userData={userData} stakingHistory={stakingHistory} currentApr={currentApr} onStake={handleStake} onUnstake={handleUnstake} onClaimRewards={handleClaimRewards} />;
      case 'governance': return <Governance proposals={proposals} votingPower={userData.staked} userVotes={userVotes} onVote={handleVote} />;
      case 'bounties': return <Bounties bounties={bounties} achievements={achievements} onClaimBounty={handleClaimBounty} />;
      case 'browser': return <Browser setPage={setPage} eepsites={eepsites} />;
      case 'wasm': return <Wasm setPage={setPage} />;
      case 'native': return <NativeConnect setPage={setPage} />;
      case 'workflows': return <Workflows />;
      case 'protect': return <Protect setPage={setPage} eepsites={eepsites} />;
      case 'referrals': return <Referrals />;
      case 'eepsite-hosting': return <EepsiteHosting eepsites={eepsites} onToggleStatus={handleToggleEepsiteStatus} onDelete={handleDeleteEepsite} onEdit={openHostEepsiteModal} onAddNew={() => openHostEepsiteModal()} onOpenEditor={handleOpenEditor} showToast={showToast} />;
      case 'templates': return <Templates setPage={setPage} walletPubkey={publicKey ? publicKey.toBase58() : null} onCreateEepsite={(name, files) => {
        const id = `eepsite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newSite: Eepsite = {
          id,
          name,
          localDirectory: `/${name}`,
          status: 'Offline',
          createdAt: new Date(),
          files,
        };
        setEepsites(prev => [newSite, ...prev]);
        setActiveEepsite(newSite);
        showToast(`New eepsite "${name}" created from template.`, 'success');
      }} />;
      case 'code-editor': return <CodeEditor activeEepsite={activeEepsite} onUpdateFiles={handleUpdateEepsiteFiles} setPage={setPage} showToast={showToast} />;
      case 'meshnet-config': return <MeshnetConfig setPage={setPage} showToast={showToast} />;
      case 'outproxy-config': return <OutproxyConfig setPage={setPage} showToast={showToast} />;
      case 'subscription': return <Subscription setPage={setPage} walletPubkey={publicKey ? publicKey.toBase58() : null} onPickTier={openSubscriptionModal} />;
      case 'network-doctor': return <NetworkDoctor setPage={setPage} />;
      default: return <Dashboard setPage={setPage} openModal={openModal} userData={userData} onUpgrade={openSubscriptionModal} eepsites={eepsites} i2pStats={i2pStats} blockEvents={blockEvents} walletPubkey={publicKey ? publicKey.toBase58() : null} />;
    }
  };

  const handleDevLogin = useCallback(() => {
    setDevMode(true);
    showToast('Developer mode enabled.', 'success');
  }, [showToast]);

  if (!connected && !devMode) {
    return <Welcome onDevLogin={handleDevLogin} />;
  }

  return (
    <>
      <Layout 
        page={page} 
        setPage={setPage} 
        publicKey={publicKey ? publicKey.toBase58() : null} 
        userData={userData} 
        notifications={notifications} 
        onMarkNotificationAsRead={handleMarkNotificationAsRead} 
        onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead} 
        onOpenAssistant={() => setIsAssistantOpen(true)}
        footerNavItems={footerNavItems}
      >
        {renderPage()}
      </Layout>
      {activeModal === 'send' && <SendModal balances={tokenBalances} onClose={closeModal} onSend={handleSendTransaction} showToast={showToast} />}
      {activeModal === 'receive' && <ReceiveModal publicKey={publicKey ? publicKey.toBase58() : ''} onClose={closeModal} showToast={showToast} />}
      {activeModal === 'subscription' && selectedTier && <SubscriptionModal tier={selectedTier} userData={userData} balances={tokenBalances} onClose={closeModal} onConfirm={handleUpgrade} />}
      {activeModal === 'host-eepsite' && <HostEepsiteModal eepsiteToEdit={editingEepsite} onClose={closeModal} onSave={handleSaveEepsite} />}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      {isAssistantOpen && (
        <Assistant
            onClose={() => setIsAssistantOpen(false)}
            setPage={(page: Page) => {
                setPage(page);
                setIsAssistantOpen(false);
            }}
            userData={userData}
            threatLog={blockEvents}
            onStake={handleStake}
            onUnstake={handleUnstake}
            onClaimRewards={handleClaimRewards}
            porVouchers={porVouchers}
            onClaimPorVouchers={handleClaimPorVouchers}
            proposals={proposals}
            userVotes={userVotes}
            onVote={handleVote}
            bounties={bounties}
            achievements={achievements}
            onClaimAllBounties={handleClaimAllCompletedBounties}
        />
      )}
      <InstallPrompt />
    </>
  );
}