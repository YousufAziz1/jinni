import { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, 
  Brain, 
  TrendingUp, 
  Coins, 
  Shield, 
  Zap, 
  CheckCircle, 
  AlertTriangle, 
  ExternalLink, 
  Lock, 
  RefreshCw, 
  Square, 
  DollarSign, 
  Activity, 
  Database,
  Sparkles,
  Settings
} from 'lucide-react';
import confetti from 'canvas-confetti';

import { 
  connectWallet, 
  getBalances, 
  depositToken, 
  withdrawToken, 
  grantSelfDelegation,
  executeSwapTrade,
  revokeAgentDelegation,
  mintTestTokens,
  getPublicClient,
  updateTokenAddresses,
  persistTokenAddresses,
  areMockTokensInitialized,
  deployTestToken
} from './lib/web3';
import { api, API_BASE, setApiBase } from './lib/api';
import type { WalletPolicy, TokenScore, Position, ActivityLog, BackendStatus } from './lib/api';

export default function App() {
  // Authentication & Web3 State
  const [address, setAddress] = useState<string>('');
  const [balances, setBalances] = useState<Record<string, { wallet: string; vault: string }>>({});
  const [web3Loading, setWeb3Loading] = useState<boolean>(false);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);

  // System Status
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [apiUrlInput, setApiUrlInput] = useState<string>(API_BASE);

  // Faucet State — initialized from localStorage so it survives page refresh
  const [faucetLoading, setFaucetLoading] = useState<string | null>(null);
  const [mockInitialized, setMockInitialized] = useState<boolean>(() => areMockTokensInitialized());

  // Spending Policy States (editable by user)
  const [maxSpendTrade, setMaxSpendTrade] = useState<string>('5');
  const [maxSpendWeek, setMaxSpendWeek] = useState<string>('20');
  const [durationDays, setDurationDays] = useState<string>('7');

  // Deposit/Withdraw States
  const [vaultAmount, setVaultAmount] = useState<string>('');
  const [vaultToken, setVaultToken] = useState<string>('USDC');
  const [vaultLoading, setVaultLoading] = useState<boolean>(false);

  // Wallet Analysis & Policy Recommendation
  const [policyLoading, setPolicyLoading] = useState<boolean>(false);
  const [policy, setPolicy] = useState<WalletPolicy | null>(null);
  const [delegationState, setDelegationState] = useState<any>(null);
  const [delegationLoading, setDelegationLoading] = useState<boolean>(false);

  // Research State
  const [searchSymbol, setSearchSymbol] = useState<string>('LINK');
  const [researchLoading, setResearchLoading] = useState<boolean>(false);
  const [scoreResult, setScoreResult] = useState<TokenScore | null>(null);

  // Execution State
  const [tradeAmount, setTradeAmount] = useState<string>('5');
  const [tradeLoading, setTradeLoading] = useState<boolean>(false);
  const tpPct = 10;
  const slPct = 5;

  // Monitoring State
  const [positions, setPositions] = useState<Position[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [monitoringLoading, setMonitoringLoading] = useState<boolean>(false);

  // UI Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Fetch all user & log states
  const refreshData = useCallback(async (userAddr: string) => {
    if (!userAddr) return;
    try {
      // 1. Fetch Balances
      const bals = await getBalances(userAddr);
      setBalances(bals);

      // 2. Fetch active delegation status
      const del = await api.getDelegation(userAddr);
      setDelegationState(del);

      // 3. Fetch active positions
      const activePos = await api.getPositions(userAddr);
      setPositions(activePos);

      // 4. Fetch Activity Logs
      const activityLogs = await api.getActivityLogs();
      setLogs(activityLogs);
    } catch (e) {
      console.error("Error refreshing dashboard data:", e);
    }
  }, []);

  // Check backend status on load — update token addresses FIRST, then refresh balances
  useEffect(() => {
    api.getStatus()
      .then((status) => {
        setBackendStatus(status);
        if (status.token_addresses) {
          updateTokenAddresses(status.token_addresses);
          setMockInitialized(areMockTokensInitialized());
        }
        // If wallet already connected (page reload), re-fetch balances with correct addresses
        setAddress(prev => {
          if (prev) {
            // Use setTimeout to let TOKEN_INFO update propagate before reading
            setTimeout(() => refreshData(prev), 100);
          }
          return prev;
        });
      })
      .catch(() => showToast('Backend API is offline. Start uvicorn server.', 'error'));
  }, [showToast, refreshData]);

  // Polling for logs and positions (every 6 seconds for autonomous monitoring)
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      refreshData(address);
    }, 6000);
    return () => clearInterval(interval);
  }, [address, refreshData]);

  // Connect MetaMask
  const handleConnect = async () => {
    setWeb3Loading(true);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      setWalletConnected(true);
      showToast('Wallet Connected Successfully!', 'success');

      // CRITICAL: Fetch backend status first to update TOKEN_INFO with custom mock
      // addresses BEFORE reading balances, otherwise balances read from wrong contracts
      try {
        const status = await api.getStatus();
        setBackendStatus(status);
        if (status.token_addresses) {
          updateTokenAddresses(status.token_addresses);
        }
      } catch (_) { /* ignore — balance refresh still runs */ }

      await refreshData(addr);
    } catch (e: any) {
      showToast(e.message || 'Connection failed', 'error');
    } finally {
      setWeb3Loading(false);
    }
  };

  // Claim Test Tokens Faucet
  const handleFaucetClaim = async (symbol: string) => {
    if (!address) return;
    setFaucetLoading(symbol);
    try {
      const txHash = await mintTestTokens(address, symbol);
      const publicClient = getPublicClient();
      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      await api.logAction('Wallet', 'Faucet Mint', `Minted 1000 ${symbol} to wallet via MetaMask.`, txHash);
      showToast(`Minted 1000 ${symbol}! Tx: ${txHash.substring(0, 10)}...`, 'success');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.8 } });
      await refreshData(address);
    } catch (e: any) {
      showToast(e.message || 'Faucet mint failed', 'error');
    } finally {
      setFaucetLoading(null);
    }
  };

  const handleInitializeMocks = async () => {
    if (!address) return;
    setFaucetLoading('INITIALIZING');
    showToast('Initializing Mock Tokens... Please approve MetaMask deployment prompts.', 'info');
    try {
      // 1. Deploy USDC (6 decimals)
      showToast('Deploying Mock USDC (6 Decimals)... Approve prompt 1/3', 'info');
      const usdcAddr = await deployTestToken('Mock USDC', 'USDC', 6);
      
      // 2. Deploy LINK (18 decimals)
      showToast('Deploying Mock LINK (18 Decimals)... Approve prompt 2/3', 'info');
      const linkAddr = await deployTestToken('Mock LINK', 'LINK', 18);
      
      // 3. Deploy UNI (18 decimals)
      showToast('Deploying Mock UNI (18 Decimals)... Approve prompt 3/3', 'info');
      const uniAddr = await deployTestToken('Mock UNI', 'UNI', 18);
      
      showToast('Registering mock token contracts on backend...', 'info');
      
      // 4. Update backend config & env
      await api.updateTokens(usdcAddr, linkAddr, uniAddr);
      
      // 5. Persist to localStorage + update TOKEN_INFO (survives page refresh)
      persistTokenAddresses({ USDC: usdcAddr, LINK: linkAddr, UNI: uniAddr });
      setMockInitialized(true);
      
      // 6. Refresh status
      const updatedStatus = await api.getStatus();
      setBackendStatus(updatedStatus);
      
      showToast('Mock tokens initialized successfully!', 'success');
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      
      await refreshData(address);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Initialization failed', 'error');
    } finally {
      setFaucetLoading(null);
    }
  };

  // Deposit to Vault
  const handleDeposit = async () => {
    if (!address || !vaultAmount) return;
    setVaultLoading(true);
    try {
      const txHash = await depositToken(address, vaultToken, vaultAmount);
      showToast(`Deposit submitted! Tx: ${txHash.substring(0, 10)}...`, 'success');
      setVaultAmount('');
      await refreshData(address);
    } catch (e: any) {
      showToast(e.message || 'Deposit failed', 'error');
    } finally {
      setVaultLoading(false);
    }
  };

  // Withdraw from Vault
  const handleWithdraw = async () => {
    if (!address || !vaultAmount) return;
    setVaultLoading(true);
    try {
      const txHash = await withdrawToken(address, vaultToken, vaultAmount);
      showToast(`Withdrawal submitted! Tx: ${txHash.substring(0, 10)}...`, 'success');
      setVaultAmount('');
      await refreshData(address);
    } catch (e: any) {
      showToast(e.message || 'Withdrawal failed', 'error');
    } finally {
      setVaultLoading(false);
    }
  };

  // Step 2-3: Analyze Wallet via Venice AI
  const handleAnalyzeWallet = async () => {
    if (!address) return;
    setPolicyLoading(true);
    try {
      const pol = await api.analyzeWallet(address);
      setPolicy(pol);
      setMaxSpendTrade(pol.max_spend_trade.toString());
      setMaxSpendWeek(pol.max_spend_week.toString());
      setDurationDays(pol.duration_days.toString());
      showToast('Venice AI Recommended Spending Policy generated!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Analysis failed', 'error');
    } finally {
      setPolicyLoading(false);
    }
  };

  // Step 4: Grant Self-Delegation (user is both delegator AND agent)
  const handleGrantDelegation = async () => {
    if (!address) return;
    const tradeLimit = Number(maxSpendTrade) || 5;
    const weekLimit = Number(maxSpendWeek) || 20;
    const daysLimit = Number(durationDays) || 7;

    setDelegationLoading(true);
    try {
      showToast('Granting self-delegation on-chain via MetaMask...', 'info');

      const txHash = await grantSelfDelegation(
        address,
        tradeLimit,
        weekLimit,
        daysLimit
      );

      const publicClient = getPublicClient();
      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

      // Sync custom limits with backend database so it persists across refreshes
      try {
        await api.updateDelegation(address, tradeLimit, weekLimit, daysLimit);
      } catch (err) {
        console.error('Failed to sync delegation settings with backend:', err);
      }

      await api.logAction('Wallet', 'Delegation Granted', `Self-delegation granted on-chain. Max trade: $${tradeLimit}, Weekly: $${weekLimit}`, txHash);
      showToast(`Delegation granted on-chain! Tx: ${txHash.substring(0, 10)}...`, 'success');
      confetti({ particleCount: 120, spread: 80, colors: ['#0062ff', '#00ff66'] });
      await refreshData(address);
    } catch (e: any) {
      showToast(e.message || 'Delegation failed', 'error');
    } finally {
      setDelegationLoading(false);
    }
  };

  // Revoke Permissions
  const handleRevoke = async () => {
    if (!address) return;
    setDelegationLoading(true);
    try {
      await revokeAgentDelegation(address);
      showToast(`Revoked on-chain! Deactivating backend...`, 'info');
      await api.revokePermission(address);
      showToast('Delegation revoked successfully.', 'success');
      await refreshData(address);
    } catch (e: any) {
      showToast(e.message || 'Revocation failed', 'error');
    } finally {
      setDelegationLoading(false);
    }
  };

  // Step 6: Score/Research Token
  const handleScoreToken = async () => {
    if (!searchSymbol) return;
    setResearchLoading(true);
    try {
      const score = await api.scoreToken(searchSymbol);
      setScoreResult(score);
      showToast(`${searchSymbol.toUpperCase()} research evaluation complete!`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Scoring failed', 'error');
    } finally {
      setResearchLoading(false);
    }
  };

  // Step 7: Trigger Autonomous Agent Buy Trade (executed via user wallet)
  const handleAgentSwap = async () => {
    if (!address || !scoreResult) return;
    setTradeLoading(true);
    try {
      showToast('Initiating swap via MetaMask...', 'info');
      // Call direct wallet swap execution (1 USDC = $1.0)
      const txHash = await executeSwapTrade(
        address,
        'USDC',
        scoreResult.symbol,
        parseFloat(tradeAmount),
        1.0
      );

      showToast('Transaction submitted. Waiting for confirmation...', 'info');
      const publicClient = getPublicClient();
      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

      // Record trade on backend
      await api.recordTrade(
        address,
        'USDC',
        scoreResult.symbol,
        parseFloat(tradeAmount),
        txHash,
        tpPct,
        slPct
      );

      showToast(`Agent Swap Executed! Tx: ${txHash.substring(0, 10)}...`, 'success');
      confetti({ particleCount: 150, spread: 80, colors: ['#0062ff', '#00ff66'] });
      await refreshData(address);
    } catch (e: any) {
      showToast(e.message || 'Trade execution failed', 'error');
    } finally {
      setTradeLoading(false);
    }
  };

  // Trigger Autonomous Monitoring Loop check and execute exits via MetaMask
  const handleManualMonitorCheck = async () => {
    if (!address) {
      showToast('Connect wallet to check positions', 'error');
      return;
    }
    setMonitoringLoading(true);
    try {
      const res = await api.monitorPositions();
      const exitSignals = res.results.filter(r => r.action === 'EXIT');

      if (exitSignals.length === 0) {
        showToast('Agent check completed! No positions need exit.', 'success');
      } else {
        showToast(`Exit triggered for ${exitSignals.length} positions. Please confirm on MetaMask...`, 'info');
        const publicClient = getPublicClient();

        for (const pos of exitSignals) {
          try {
            showToast(`Confirming exit for ${pos.symbol}...`, 'info');
            const txHash = await executeSwapTrade(
              address,
              pos.symbol,
              'USDC',
              pos.amount * pos.current_price,
              pos.current_price
            );
            await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
            await api.recordExit(pos.id, pos.current_price, txHash);
            showToast(`Exited position in ${pos.symbol}!`, 'success');
          } catch (err: any) {
            showToast(`Failed to exit ${pos.symbol}: ${err.message}`, 'error');
          }
        }
      }
      await refreshData(address);
    } catch (e: any) {
      showToast('Monitoring check failed', 'error');
    } finally {
      setMonitoringLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mesh bg-grid relative text-gray-100 font-body pb-12 overflow-x-hidden">
      
      {/* Floating Orbs background */}
      <div className="absolute top-12 left-10 w-96 h-96 bg-[var(--accent)]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-[var(--accent-2)]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-black/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="JINNI Logo"
              className="w-16 h-16 rounded-xl border border-accent/40 object-cover hover:scale-105 transition-transform duration-300"
            />
            <div>
              <h1 className="text-xl font-bold font-display text-gradient">JINNI</h1>
              <p className="text-xs text-text-muted">Autonomous DeFi Wallet Agent</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {backendStatus ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-status-success/10 text-status-success border border-status-success/20 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-success animate-ping" />
                Backend Live
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full bg-status-error/10 text-status-error border border-status-error/20 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-error" />
                Backend Offline
              </span>
            )}

            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-xl border border-border-subtle bg-bg-surface text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors flex items-center justify-center"
                title="API Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {showSettings && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border-subtle bg-bg-surface p-4 shadow-2xl z-50 animate-in">
                  <h4 className="text-sm font-semibold text-text-primary mb-1">Backend Connection</h4>
                  <p className="text-xs text-text-muted mb-3">Set the URL of your live FastAPI server.</p>
                  
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={apiUrlInput}
                      onChange={(e) => setApiUrlInput(e.target.value)}
                      placeholder="https://jinni-6wfe.onrender.com/api"
                      className="w-full text-xs bg-bg-base border border-border-subtle focus:border-accent rounded-lg px-3 py-2 text-text-primary outline-none transition-colors"
                    />
                    <div className="flex gap-2 justify-end mt-1">
                      <button
                        onClick={() => {
                          setApiUrlInput('http://localhost:8000/api');
                          setApiBase('http://localhost:8000/api');
                          window.location.reload();
                        }}
                        className="text-[10px] text-text-muted hover:text-text-primary px-2 py-1 rounded border border-border-subtle"
                      >
                        Reset to Local
                      </button>
                      <button
                        onClick={() => {
                          setApiUrlInput('https://jinni-6wfe.onrender.com/api');
                          setApiBase('https://jinni-6wfe.onrender.com/api');
                          window.location.reload();
                        }}
                        className="text-[10px] text-text-muted hover:text-text-primary px-2 py-1 rounded border border-border-subtle"
                      >
                        Reset to Live
                      </button>
                      <button
                        onClick={() => {
                          if (apiUrlInput.trim()) {
                            setApiBase(apiUrlInput.trim());
                            window.location.reload();
                          }
                        }}
                        className="text-[10px] bg-accent hover:bg-accent/80 text-white font-medium px-3 py-1 rounded-lg"
                      >
                        Save & Reload
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {!walletConnected ? (
              <button 
                onClick={handleConnect} 
                disabled={web3Loading}
                className="btn flex items-center gap-2 bg-accent hover:bg-accent/80 text-white font-medium px-5 py-2.5 rounded-xl text-sm"
              >
                <Wallet className="w-4 h-4" />
                {web3Loading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle px-4 py-2 rounded-xl">
                <div className="w-2.5 h-2.5 rounded-full bg-status-success" />
                <span className="text-xs font-mono text-text-primary">
                  {address.substring(0, 6)}...{address.substring(address.length - 4)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in">
        
        {/* Left Column - Wallet & Vault & Faucet (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-8">
          
          {/* Card 1: Faucet Claim */}
          <div className="card rounded-2xl p-6 relative overflow-hidden">
            <h2 className="text-lg font-bold font-display mb-2 flex items-center gap-2 text-text-primary">
              <Coins className="w-5 h-5 text-accent-secondary" />
              Sepolia Test Faucet
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Mint 1,000 test tokens directly to your address to test the vault swapping on Sepolia.
            </p>

            {!mockInitialized && (
              <div className="mb-4 p-3 bg-status-warning/10 border border-status-warning/30 rounded-xl text-[11px] text-status-warning flex flex-col gap-2">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Official Circle Sepolia USDC is read-only and cannot be minted. Initialize custom Mock USDC, LINK, and UNI tokens to enable direct claims.
                  </span>
                </div>
                <button
                  disabled={!walletConnected || faucetLoading !== null}
                  onClick={handleInitializeMocks}
                  className="py-1.5 px-3 rounded-lg bg-status-warning/20 hover:bg-status-warning/30 border border-status-warning/40 text-[10px] font-bold text-text-primary self-start transition-all"
                >
                  {faucetLoading === 'INITIALIZING' ? 'Deploying Contracts...' : 'Initialize Mock Tokens via MetaMask'}
                </button>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-3">
              {['USDC', 'LINK', 'UNI'].map((token) => (
                <button
                  key={token}
                  disabled={!walletConnected || faucetLoading !== null || !mockInitialized}
                  onClick={() => handleFaucetClaim(token)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all
                    ${walletConnected && mockInitialized
                      ? 'bg-bg-elevated hover:bg-bg-elevated/70 text-text-primary border border-border-subtle hover:border-accent/40' 
                      : 'bg-bg-elevated/40 text-text-faint border border-transparent cursor-not-allowed'}
                  `}
                >
                  {faucetLoading === token ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Claim {token}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Vault Controls */}
          <div className="card rounded-2xl p-6 relative">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold font-display flex items-center gap-2 text-text-primary">
                <Database className="w-5 h-5 text-accent" />
                Agent Trading Vault
              </h2>
              <button
                onClick={() => address && refreshData(address)}
                disabled={!walletConnected}
                title="Refresh balances"
                className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all disabled:opacity-30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Deposit testing assets to the vault contract. The agent can only swap funds inside the vault.
            </p>

            {/* Balances Display */}
            <div className="bg-bg-elevated/50 rounded-xl p-4 border border-border-subtle mb-6 flex flex-col gap-2.5">
              <div className="grid grid-cols-3 text-[10px] uppercase font-bold text-text-muted pb-1.5 border-b border-border-subtle">
                <span>Asset</span>
                <span>Wallet Balance</span>
                <span className="text-right text-accent">Vault Balance</span>
              </div>
              {['USDC', 'LINK', 'UNI', 'ETH'].map((token) => (
                <div key={token} className="grid grid-cols-3 text-xs font-mono text-text-primary">
                  <span className="font-semibold text-text-muted">{token}</span>
                  <span>{parseFloat(balances[token]?.wallet || '0').toFixed(3)}</span>
                  <span className="text-right text-accent font-semibold">
                    {parseFloat(balances[token]?.vault || '0').toFixed(3)}
                  </span>
                </div>
              ))}
            </div>

            {/* Deposit/Withdraw Inputs */}
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount"
                  value={vaultAmount}
                  disabled={!walletConnected}
                  onChange={(e) => setVaultAmount(e.target.value)}
                  className="input flex-1 px-4 py-2.5 rounded-xl text-sm font-mono"
                />
                <select
                  value={vaultToken}
                  disabled={!walletConnected}
                  onChange={(e) => setVaultToken(e.target.value)}
                  className="input px-3 py-2.5 rounded-xl text-sm font-mono bg-bg-elevated"
                >
                  <option value="USDC">USDC</option>
                  <option value="LINK">LINK</option>
                  <option value="UNI">UNI</option>
                  <option value="ETH">ETH</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDeposit}
                  disabled={!walletConnected || vaultLoading || !vaultAmount}
                  className="btn bg-accent text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {vaultLoading ? 'Processing...' : 'Deposit to Vault'}
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={!walletConnected || vaultLoading || !vaultAmount}
                  className="btn border border-accent/40 text-accent hover:bg-accent/10 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {vaultLoading ? 'Processing...' : 'Withdraw to Wallet'}
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Permissions Panel */}
          <div className="card rounded-2xl p-6 border-glow">
            <div className="border-glow-inner p-6 rounded-2xl flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold font-display flex items-center gap-2 text-text-primary">
                    <Shield className="w-5 h-5 text-accent-secondary" />
                    Agent Permissions
                  </h2>
                  {delegationState?.active ? (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-status-success/15 text-status-success border border-status-success/30 font-semibold uppercase">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-text-faint text-text-muted border border-border-subtle font-semibold uppercase">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Status description */}
                {delegationState?.active ? (
                  <div className="bg-bg-elevated/40 rounded-xl p-3 border border-border-subtle mb-4 text-xs flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Max Single Trade:</span>
                      <span className="font-mono text-text-primary">${delegationState.max_spend_trade}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Weekly Budget:</span>
                      <span className="font-mono text-text-primary">${delegationState.max_spend_week}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Expires:</span>
                      <span className="font-mono text-text-primary">
                        {new Date(delegationState.expiry * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted mb-4">
                    Before the autonomous agent can research and execute swaps on your behalf, you must grant spending policy limits.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 mt-4">
                {!delegationState?.active ? (
                  <>
                    <button
                      onClick={handleAnalyzeWallet}
                      disabled={!walletConnected || policyLoading}
                      className="btn w-full bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-accent-secondary animate-pulse" />
                      {policyLoading ? 'AI Analysis in progress...' : 'Analyze Wallet Risk (Venice AI)'}
                    </button>

                    {policy && (
                      <div className="bg-bg-elevated/85 border border-accent/20 rounded-xl p-3 text-xs animate-in">
                        <p className="text-[10.5px] leading-relaxed italic text-text-muted bg-black/40 p-2.5 rounded-lg">
                          <span className="font-semibold text-accent not-italic">Venice AI Recommendation: </span>
                          "{policy.reasoning}"
                        </p>
                      </div>
                    )}

                    {/* Editable Spending Limit Fields */}
                    <div className="bg-bg-elevated/40 border border-border-subtle rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-border-subtle/50">
                        <span className="text-[11px] font-bold text-text-primary">Configure Limits</span>
                        <span className="text-[9px] font-mono text-text-faint uppercase">EIP-7710/EIP-7715</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1">
                            Max Per Trade
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-muted">$</span>
                            <input
                              type="number"
                              value={maxSpendTrade}
                              onChange={(e) => setMaxSpendTrade(e.target.value)}
                              className="input w-full pl-6 pr-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-bg-base border border-border-subtle text-text-primary focus:border-accent focus:outline-none"
                              placeholder="5"
                            />
                          </div>
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1">
                            Weekly Budget
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-muted">$</span>
                            <input
                              type="number"
                              value={maxSpendWeek}
                              onChange={(e) => setMaxSpendWeek(e.target.value)}
                              className="input w-full pl-6 pr-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-bg-base border border-border-subtle text-text-primary focus:border-accent focus:outline-none"
                              placeholder="20"
                            />
                          </div>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1">
                            Delegation Expiry (Days)
                          </label>
                          <input
                            type="number"
                            value={durationDays}
                            onChange={(e) => setDurationDays(e.target.value)}
                            className="input w-full px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-bg-base border border-border-subtle text-text-primary focus:border-accent focus:outline-none"
                            placeholder="7"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleGrantDelegation}
                      disabled={delegationLoading || !walletConnected}
                      className="btn w-full bg-status-success text-black font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:shadow-[0_0_20px_rgba(74,222,128,0.25)] transition-shadow"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {delegationLoading ? 'Granting on chain...' : 'Approve Policy & Sign EIP-712'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleRevoke}
                    disabled={delegationLoading}
                    className="btn w-full bg-status-error text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5" />
                    {delegationLoading ? 'Revoking on chain...' : 'Revoke Delegation Instantly'}
                  </button>
                )}
              </div>
            </div>
          </div>

        </section>

        {/* Right Column - Research Console & Positions (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-8">
          
          {/* Card 4: DeFi Research Agent Console */}
          <div className="card rounded-2xl p-6">
            <h2 className="text-lg font-bold font-display mb-1 flex items-center gap-2 text-text-primary">
              <Brain className="w-5 h-5 text-accent" />
              DeFi Research Agent
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Enter a token symbol below. The Research Agent will fetch real-time metrics and query Venice AI to evaluate momentum.
            </p>

            <div className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="Token Symbol (e.g. LINK, UNI, WETH)"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                className="input flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold uppercase"
              />
              <button
                onClick={handleScoreToken}
                disabled={researchLoading || !searchSymbol}
                className="btn bg-accent text-white px-6 py-2.5 rounded-xl text-xs font-bold"
              >
                {researchLoading ? 'Evaluating...' : 'Score Token'}
              </button>
            </div>

            {/* Score Result Panel */}
            {scoreResult && (
              <div className="bg-bg-elevated/40 border border-border-subtle rounded-xl p-5 animate-in">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-base font-bold font-display text-text-primary">
                      {scoreResult.symbol} Evaluation Output
                    </h3>
                    <p className="text-xs text-text-muted">
                      Price: ${scoreResult.metrics.price} | 24h Change: {scoreResult.metrics.change_24h_pct}%
                    </p>
                  </div>
                  
                  {/* Verdict Badge */}
                  <div className="flex flex-col items-end">
                    <span className={`text-xs px-3 py-1 rounded-full font-extrabold uppercase
                      ${scoreResult.decision.verdict === 'BUY' ? 'bg-status-success/15 text-status-success border border-status-success/30' : 
                        scoreResult.decision.verdict === 'SELL' ? 'bg-status-error/15 text-status-error border border-status-error/30' : 
                        'bg-status-warning/15 text-status-warning border border-status-warning/30'}
                    `}>
                      {scoreResult.decision.verdict}
                    </span>
                    <span className="text-[9px] text-text-muted mt-1 uppercase">
                      Confidence: {scoreResult.decision.confidence}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  
                  {/* Score circle */}
                  <div className="md:col-span-3 flex flex-col items-center justify-center bg-black/40 rounded-xl p-3 border border-border-subtle">
                    <span className="text-2xl font-extrabold text-accent">{scoreResult.decision.score}</span>
                    <span className="text-[9px] uppercase font-bold text-text-muted">AI Rating</span>
                  </div>

                  {/* AI Reasoning Text */}
                  <div className="md:col-span-9 bg-black/25 p-3 rounded-lg border border-border-subtle/50">
                    <p className="text-xs leading-relaxed text-text-muted italic">
                      "{scoreResult.decision.reasoning}"
                    </p>
                  </div>
                </div>

                {/* Swap trigger */}
                {scoreResult.decision.verdict === 'BUY' && (
                  <div className="mt-5 pt-4 border-t border-border-subtle flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Swap Size:</span>
                      <div className="flex items-center gap-1 bg-black/50 border border-border-subtle rounded-lg px-2 py-1">
                        <DollarSign className="w-3.5 h-3.5 text-accent" />
                        <input
                          type="number"
                          value={tradeAmount}
                          onChange={(e) => setTradeAmount(e.target.value)}
                          className="bg-transparent text-xs font-mono w-12 text-text-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleAgentSwap}
                      disabled={tradeLoading || !delegationState?.active}
                      className={`btn px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5
                        ${delegationState?.active 
                          ? 'bg-status-success text-black' 
                          : 'bg-bg-elevated text-text-faint border border-transparent cursor-not-allowed'}
                      `}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {tradeLoading ? 'Agent swapping...' : 'Execute Agent Swap (USDC -> Token)'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 5: Autonomous Position Monitor */}
          <div className="card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold font-display flex items-center gap-2 text-text-primary">
                  <TrendingUp className="w-5 h-5 text-accent-secondary" />
                  Active Positions Monitor
                </h2>
                <p className="text-xs text-text-muted">
                  Positions currently monitored by the exit loop agent for take-profit and stop-loss targets.
                </p>
              </div>

              <button
                onClick={handleManualMonitorCheck}
                disabled={monitoringLoading}
                className="btn border border-border-subtle hover:border-accent/40 text-text-muted hover:text-text-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${monitoringLoading ? 'animate-spin' : ''}`} />
                Run Monitor Loop
              </button>
            </div>

            {/* Positions List */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {positions.length === 0 ? (
                <div className="bg-bg-elevated/25 border border-dashed border-border-subtle rounded-xl p-8 text-center">
                  <p className="text-xs text-text-muted">No active trading positions. Run a BUY trade to open a position.</p>
                </div>
              ) : (
                positions.map((pos) => {
                  const isClosed = pos.status === 'CLOSED';
                  return (
                    <div key={pos.id} className="bg-bg-elevated/40 border border-border-subtle rounded-xl p-4 flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-bold text-text-primary">{pos.token_symbol}</span>
                          <span className="text-[10px] text-text-muted font-mono">{pos.amount.toFixed(4)} units</span>
                          {isClosed && (
                            <span className="text-[9px] bg-text-faint text-text-muted px-1.5 py-0.5 rounded-md font-semibold">
                              CLOSED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-text-muted grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
                          <span>Buy Price: ${pos.buy_price.toFixed(2)}</span>
                          <span>Stop Loss: ${pos.stop_loss.toFixed(2)}</span>
                          <span>Take Profit: ${pos.take_profit.toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {isClosed ? (
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-text-muted">Exit: ${pos.exit_price?.toFixed(2)}</span>
                            {pos.exit_tx_hash && (
                              <a 
                                href={`https://sepolia.etherscan.io/tx/${pos.exit_tx_hash}`}
                                target="_blank" 
                                rel="noreferrer"
                                className="text-[9px] text-accent hover:underline flex items-center gap-0.5 mt-1"
                              >
                                Tx <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-status-success font-bold font-mono">
                            Live Monitoring...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Card 6: Live Activity Logs */}
          <div className="card rounded-2xl p-6">
            <h2 className="text-lg font-bold font-display mb-1 flex items-center gap-2 text-text-primary">
              <Activity className="w-5 h-5 text-accent" />
              Agent Core Activity Log
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Real-time audit logs detailing research notes, limits verification, and Sepolia transactions.
            </p>

            <div className="bg-bg-base/75 rounded-xl border border-border-subtle p-4 font-mono text-[11px] leading-relaxed space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <p className="text-text-faint text-center py-4">No audit logs received yet.</p>
              ) : (
                logs.map((log) => {
                  const agentColors: Record<string, string> = {
                    'Wallet': 'text-accent',
                    'Wallet Analysis': 'text-accent',
                    'Research': 'text-status-warning',
                    'Execution': 'text-status-error',
                    'Monitoring': 'text-status-success'
                  };
                  return (
                    <div key={log.id} className="pb-2 border-b border-border-subtle/40 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center text-[10px] text-text-faint mb-0.5">
                        <span className={`font-bold ${agentColors[log.agent] || 'text-text-muted'}`}>
                          [{log.agent.toUpperCase()}]
                        </span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-text-primary">{log.details}</p>
                      {log.tx_hash && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] text-text-muted">Transaction:</span>
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${log.tx_hash}`}
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[10px] text-accent hover:underline flex items-center gap-0.5 font-bold"
                          >
                            {log.tx_hash.substring(0, 16)}... <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </section>

      </main>

      {/* Global Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl border shadow-xl transition-all duration-300 animate-in
          ${toast.type === 'success' ? 'bg-status-success/15 border-status-success/45 text-status-success' : 
            toast.type === 'error' ? 'bg-status-error/15 border-status-error/45 text-status-error' : 
            'bg-accent/15 border-accent/45 text-accent'}
        `}>
          {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5" />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-4">
        <span>© 2026 Jinni autonomous systems. Created for Sepolia EIP-7710/7715 integrations.</span>
        <div className="flex gap-4">
          <span>Verifiable On-Chain Execution</span>
          <span>•</span>
          <span>1Shot Relayer Ready</span>
        </div>
      </footer>
    </div>
  );
}
