const API_BASE = 'http://localhost:8000/api'

export interface WalletPolicy {
  max_spend_trade: number
  max_spend_week: number
  duration_days: number
  reasoning: string
}

export interface TokenScore {
  symbol: string
  metrics: {
    price: number
    volume_24h: number
    change_24h_pct: number
    high_24h: number
    low_24h: number
  }
  decision: {
    score: number
    verdict: 'BUY' | 'SELL' | 'HOLD'
    confidence: 'LOW' | 'MEDIUM' | 'HIGH'
    reasoning: string
  }
}

export interface TradeResult {
  status: string
  tx_hash: string
  bought_amount: number
  buy_price: number
  take_profit: number
  stop_loss: number
}

export interface ActivityLog {
  id: number
  timestamp: string
  agent: string
  action: string
  details: string
  tx_hash?: string
}

export interface Position {
  id: number
  user_address: string
  token_symbol: string
  token_address: string
  amount: number
  buy_price: number
  take_profit: number
  stop_loss: number
  timestamp: string
  status: 'ACTIVE' | 'CLOSED'
  exit_price?: number
  exit_tx_hash?: string
}

export interface BackendStatus {
  status: string
  sepolia_connected: boolean
  delegator_contract: string
  supported_tokens: string[]
  token_addresses: Record<string, string>
  token_decimals: Record<string, number>
}

export interface MonitorResult {
  id: number
  symbol: string
  token_address: string
  amount: number
  action: 'HOLD' | 'EXIT'
  current_price: number
  buy_price: number
  pnl_pct: number
  details: string
}

export const api = {
  async getStatus(): Promise<BackendStatus> {
    const res = await fetch(`${API_BASE}/status`)
    if (!res.ok) throw new Error('Backend offline')
    return res.json()
  },

  async analyzeWallet(userAddress: string): Promise<WalletPolicy> {
    const res = await fetch(`${API_BASE}/analyze-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_address: userAddress })
    })
    if (!res.ok) throw new Error('Analysis failed')
    return res.json()
  },

  async updateDelegation(
    userAddress: string,
    maxSpendTrade: number,
    maxSpendWeek: number,
    durationDays: number
  ): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/update-delegation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_address: userAddress,
        max_spend_trade: maxSpendTrade,
        max_spend_week: maxSpendWeek,
        duration_days: durationDays
      })
    })
    if (!res.ok) throw new Error('Failed to update delegation settings')
    return res.json()
  },

  async scoreToken(symbol: string): Promise<TokenScore> {
    const res = await fetch(`${API_BASE}/score-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol })
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Token scoring failed')
    }
    return res.json()
  },

  async recordTrade(
    userAddress: string,
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountInUsd: number,
    txHash: string,
    takeProfitPct: number = 10,
    stopLossPct: number = 5
  ): Promise<TradeResult> {
    const res = await fetch(`${API_BASE}/record-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_address: userAddress,
        token_in_symbol: tokenInSymbol,
        token_out_symbol: tokenOutSymbol,
        amount_in_usd: amountInUsd,
        tx_hash: txHash,
        take_profit_pct: takeProfitPct,
        stop_loss_pct: stopLossPct
      })
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Trade recording failed')
    }
    return res.json()
  },

  async monitorPositions(): Promise<{ status: string; results: MonitorResult[] }> {
    const res = await fetch(`${API_BASE}/monitor-positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!res.ok) throw new Error('Monitoring failed')
    return res.json()
  },

  async recordExit(positionId: number, exitPrice: number, txHash: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/record-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_id: positionId, exit_price: exitPrice, tx_hash: txHash })
    })
    if (!res.ok) throw new Error('Exit recording failed')
    return res.json()
  },

  async logAction(agent: string, action: string, details: string, txHash: string = ''): Promise<void> {
    await fetch(`${API_BASE}/log-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, action, details, tx_hash: txHash })
    })
  },

  async revokePermission(userAddress: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/revoke-permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_address: userAddress })
    })
    if (!res.ok) throw new Error('Revocation failed')
    return res.json()
  },

  async getActivityLogs(): Promise<ActivityLog[]> {
    const res = await fetch(`${API_BASE}/activity-logs`)
    if (!res.ok) throw new Error('Failed to load logs')
    return res.json()
  },

  async getPositions(userAddress: string): Promise<Position[]> {
    const res = await fetch(`${API_BASE}/positions?user_address=${userAddress}`)
    if (!res.ok) throw new Error('Failed to load positions')
    return res.json()
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getDelegation(userAddress: string): Promise<any> {
    const res = await fetch(`${API_BASE}/delegation?user_address=${userAddress}`)
    if (!res.ok) throw new Error('Failed to load delegation')
    return res.json()
  },

  async updateTokens(
    usdcAddress: string,
    linkAddress: string,
    uniAddress: string
  ): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/update-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usdc_address: usdcAddress,
        link_address: linkAddress,
        uni_address: uniAddress
      })
    })
    if (!res.ok) throw new Error('Failed to update token configurations')
    return res.json()
  }
}
