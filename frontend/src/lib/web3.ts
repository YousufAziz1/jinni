import { createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits, getAddress } from 'viem'
import { sepolia } from 'viem/chains'
import JinniDelegatorABI from '../contracts/JinniDelegator.json'
import TestTokenABI from '../contracts/TestToken.json'

// Safe address normalizer: lowercases first so ANY hex input checksums correctly
const toAddr = (addr: string): `0x${string}` =>
  getAddress(`0x${addr.replace(/^0x/i, '').toLowerCase()}`)

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any
  }
}

export const DELEGATOR_CONTRACT = toAddr('0x5462D420CEf200c8704Db6b48BE9Db3A000A231C')

const DEFAULT_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const STORAGE_KEY = 'jinni_mock_token_addresses'

export let TOKEN_INFO: Record<string, { address: `0x${string}`; decimals: number }> = {
  WETH: { address: toAddr('0xfff9976782d46CC05630D1f6eBAb18b2324d6B14'), decimals: 18 },
  USDC: { address: toAddr(DEFAULT_USDC), decimals: 6 },
  LINK: { address: toAddr('0x779877A7B0D9E8603169DdbD7836e478b4624789'), decimals: 18 },
  UNI:  { address: toAddr('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'), decimals: 18 }
}

export function updateTokenAddresses(addresses: Record<string, string>) {
  try {
    if (addresses.USDC) TOKEN_INFO.USDC.address = toAddr(addresses.USDC)
    if (addresses.LINK) TOKEN_INFO.LINK.address = toAddr(addresses.LINK)
    if (addresses.UNI)  TOKEN_INFO.UNI.address  = toAddr(addresses.UNI)
  } catch (e) {
    console.error('Invalid token address during update:', e)
  }
}

/** Save addresses to localStorage so they survive page refresh */
export function persistTokenAddresses(addresses: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses))
  } catch {}
  updateTokenAddresses(addresses)
}

/** Check if mock tokens have been deployed (not default Circle address) */
export function areMockTokensInitialized(): boolean {
  return TOKEN_INFO.USDC.address.toLowerCase() !== DEFAULT_USDC.toLowerCase()
}

// ── Auto-restore from localStorage on module load (synchronous, before first render) ──
;(function restorePersistedTokens() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, string>
      updateTokenAddresses(parsed)
      console.log('[Jinni] Restored mock token addresses from localStorage:', parsed)
    }
  } catch {}
})()

export async function deployTestToken(
  name: string,
  symbol: string,
  decimals: number
): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask is not installed')

  // Force MetaMask to switch to Sepolia (chainId 11155111 = 0xaa36a7)
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xaa36a7' }]
    })
  } catch (_) {
    // ignore if already on Sepolia
  }

  const publicClient = getPublicClient()
  const [address] = await getWalletClient().getAddresses()

  // ABI-encode constructor args: (string name, string symbol, uint8 decimals)
  // We use viem's encodeFunctionData trick - but for constructor we concat bytecode + encoded args
  const { encodeAbiParameters, parseAbiParameters } = await import('viem')
  const encodedArgs = encodeAbiParameters(
    parseAbiParameters('string, string, uint8'),
    [name, symbol, decimals]
  )

  const bytecode = TestTokenABI.bytecode.startsWith('0x')
    ? TestTokenABI.bytecode
    : `0x${TestTokenABI.bytecode}`

  const deployData = (bytecode + encodedArgs.slice(2)) as `0x${string}`

  // Send deploy transaction directly via MetaMask
  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: address,
      data: deployData,
      gas: '0x493E0' // 300000 gas limit
    }]
  }) as `0x${string}`

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  if (!receipt.contractAddress) {
    throw new Error('Contract deployment failed - no contract address in receipt')
  }
  return receipt.contractAddress
}

export function getPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http('https://rpc.ankr.com/eth_sepolia/3dd47c69a2032becad5e2671e24b165b34c58d25829db2bd514d86a8f6967d6e')
  })
}

export function getWalletClient() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask is not installed')
  }
  return createWalletClient({
    chain: sepolia,
    transport: custom(window.ethereum)
  })
}

export async function connectWallet(): Promise<string> {
  const client = getWalletClient()
  const [address] = await client.requestAddresses()
  return address
}

export async function getBalances(userAddress: string) {
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`
  console.log('[getBalances] Querying balances for address:', userAddress, 'with TOKEN_INFO:', JSON.stringify(TOKEN_INFO))

  // ETH Balance
  const ethWei = await publicClient.getBalance({ address: addr })
  const eth = formatUnits(ethWei, 18)

  const balances: Record<string, { wallet: string; vault: string }> = {
    ETH: { wallet: eth, vault: '0' }
  }

  // ERC20 balances
  for (const [symbol, info] of Object.entries(TOKEN_INFO)) {
    let walletBal = '0'
    let vaultBal = '0'
    const tokenAddr = toAddr(info.address)

    // 1. Fetch wallet balance from ERC20 contract
    try {
      const walletBalanceWei = await publicClient.readContract({
        address: tokenAddr,
        abi: TestTokenABI.abi,
        functionName: 'balanceOf',
        args: [addr]
      }) as bigint
      walletBal = formatUnits(walletBalanceWei, info.decimals)
    } catch (err) {
      console.error(`[getBalances] Failed to read wallet balance for ${symbol} (${info.address}):`, err)
    }

    // 2. Fetch vault balance from Delegator contract
    try {
      const vaultBalanceWei = await publicClient.readContract({
        address: DELEGATOR_CONTRACT as `0x${string}`,
        abi: JinniDelegatorABI,
        functionName: 'vaultBalances',
        args: [addr, tokenAddr]
      }) as bigint
      vaultBal = formatUnits(vaultBalanceWei, info.decimals)
    } catch (err) {
      console.debug(`[getBalances] Failed to read vault balance for ${symbol} (expected if Delegator not deployed):`, err)
    }

    balances[symbol] = {
      wallet: walletBal,
      vault: vaultBal
    }
  }

  // Load ETH vault balance
  try {
    const ethVaultWei = await publicClient.readContract({
      address: DELEGATOR_CONTRACT as `0x${string}`,
      abi: JinniDelegatorABI,
      functionName: 'vaultBalances',
      args: [addr, '0x0000000000000000000000000000000000000000']
    }) as bigint
    balances['ETH'].vault = formatUnits(ethVaultWei, 18)
  } catch {
    // ETH vault read failed, keep default
  }

  console.log('[getBalances] Returning balances:', JSON.stringify(balances))
  return balances
}

// ─── FAUCET: Mint test tokens directly from user wallet ───
export async function mintTestTokens(
  userAddress: string,
  tokenSymbol: string
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  const info = TOKEN_INFO[tokenSymbol.toUpperCase()]
  if (!info) throw new Error(`Unsupported token: ${tokenSymbol}`)

  const mintAmount = parseUnits('1000', info.decimals)

  const { request } = await publicClient.simulateContract({
    account: addr,
    address: toAddr(info.address),
    abi: TestTokenABI.abi,
    functionName: 'mint',
    args: [addr, mintAmount]
  })
  return await walletClient.writeContract(request)
}

// ─── DEPOSIT to Vault ───
export async function depositToken(
  userAddress: string,
  tokenSymbol: string,
  amount: string
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  if (tokenSymbol.toUpperCase() === 'ETH') {
    const amountWei = parseUnits(amount, 18)
    const { request } = await publicClient.simulateContract({
      account: addr,
      address: DELEGATOR_CONTRACT as `0x${string}`,
      abi: JinniDelegatorABI,
      functionName: 'deposit',
      args: ['0x0000000000000000000000000000000000000000', 0n],
      value: amountWei
    })
    return await walletClient.writeContract(request)
  } else {
    const info = TOKEN_INFO[tokenSymbol.toUpperCase()]
    if (!info) throw new Error(`Unsupported token: ${tokenSymbol}`)
    const amountRaw = parseUnits(amount, info.decimals)

    // 1. Approve contract to spend tokens
    const approveHash = await walletClient.writeContract({
      account: addr,
      address: toAddr(info.address),
      abi: TestTokenABI.abi,
      functionName: 'approve',
      args: [DELEGATOR_CONTRACT as `0x${string}`, amountRaw]
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })

    // 2. Deposit tokens
    const { request } = await publicClient.simulateContract({
      account: addr,
      address: DELEGATOR_CONTRACT as `0x${string}`,
      abi: JinniDelegatorABI,
      functionName: 'deposit',
      args: [toAddr(info.address), amountRaw]
    })
    return await walletClient.writeContract(request)
  }
}

// ─── WITHDRAW from Vault ───
export async function withdrawToken(
  userAddress: string,
  tokenSymbol: string,
  amount: string
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  const tokenAddr = tokenSymbol === 'ETH'
    ? '0x0000000000000000000000000000000000000000' as `0x${string}`
    : toAddr(TOKEN_INFO[tokenSymbol.toUpperCase()].address)

  const decimals = tokenSymbol === 'ETH'
    ? 18
    : TOKEN_INFO[tokenSymbol.toUpperCase()].decimals

  const amountRaw = parseUnits(amount, decimals)

  const { request } = await publicClient.simulateContract({
    account: addr,
    address: DELEGATOR_CONTRACT as `0x${string}`,
    abi: JinniDelegatorABI,
    functionName: 'withdraw',
    args: [tokenAddr, amountRaw]
  })
  return await walletClient.writeContract(request)
}

// ─── GRANT DELEGATION (self-delegation: user IS the agent) ───
export async function grantSelfDelegation(
  userAddress: string,
  maxSpendTrade: number,
  maxSpendWeek: number,
  durationDays: number
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  const maxSpendTradeRaw = parseUnits(maxSpendTrade.toString(), 6)
  const maxSpendWeekRaw = parseUnits(maxSpendWeek.toString(), 6)
  const expiry = BigInt(Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60))

  // User grants delegation to themselves — demonstrates the full permission system
  // while allowing the user to also execute trades from their own wallet
  const { request } = await publicClient.simulateContract({
    account: addr,
    address: DELEGATOR_CONTRACT as `0x${string}`,
    abi: JinniDelegatorABI,
    functionName: 'grantDelegationDirect',
    args: [addr, maxSpendTradeRaw, maxSpendWeekRaw, expiry]
  })

  return await walletClient.writeContract(request)
}

// ─── SIGN EIP-712 DELEGATION (for demo / ERC-7715 showcase) ───
export async function signDelegationPermissions(
  userAddress: string,
  maxSpendTrade: number,
  maxSpendWeek: number,
  expiryTimestamp: number
): Promise<{ signature: string; nonce: number }> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  const nonce = await publicClient.readContract({
    address: DELEGATOR_CONTRACT as `0x${string}`,
    abi: JinniDelegatorABI,
    functionName: 'nonces',
    args: [addr]
  }) as bigint

  const maxSpendTradeRaw = parseUnits(maxSpendTrade.toString(), 6)
  const maxSpendWeekRaw = parseUnits(maxSpendWeek.toString(), 6)

  const domain = {
    name: 'JinniDelegator',
    version: '1',
    chainId: 11155111,
    verifyingContract: DELEGATOR_CONTRACT as `0x${string}`
  } as const

  const types = {
    Delegation: [
      { name: 'delegator', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'maxSpendPerTrade', type: 'uint256' },
      { name: 'maxSpendPerWeek', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'nonce', type: 'uint256' }
    ]
  } as const

  // Self-delegation: agent = user address
  const message = {
    delegator: addr,
    agent: addr,
    maxSpendPerTrade: maxSpendTradeRaw,
    maxSpendPerWeek: maxSpendWeekRaw,
    expiry: BigInt(expiryTimestamp),
    nonce: nonce
  } as const

  const signature = await walletClient.signTypedData({
    account: addr,
    domain,
    types,
    primaryType: 'Delegation',
    message
  })

  return { signature, nonce: Number(nonce) }
}

// ─── SUBMIT DELEGATION ON-CHAIN (EIP-712 sig path) ───
export async function submitDelegationOnChain(
  userAddress: string,
  maxSpendTrade: number,
  maxSpendWeek: number,
  expiryTimestamp: number,
  signature: string
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  const maxSpendTradeRaw = parseUnits(maxSpendTrade.toString(), 6)
  const maxSpendWeekRaw = parseUnits(maxSpendWeek.toString(), 6)

  // Self-delegation: delegator = agent = user
  const { request } = await publicClient.simulateContract({
    account: addr,
    address: DELEGATOR_CONTRACT as `0x${string}`,
    abi: JinniDelegatorABI,
    functionName: 'grantDelegationWithSignature',
    args: [
      addr,
      addr, // agent = self
      maxSpendTradeRaw,
      maxSpendWeekRaw,
      BigInt(expiryTimestamp),
      signature as `0x${string}`
    ]
  })

  return await walletClient.writeContract(request)
}

// ─── EXECUTE SWAP TRADE from user wallet ───
export async function executeSwapTrade(
  userAddress: string,
  tokenInSymbol: string,
  tokenOutSymbol: string,
  amountInUsd: number,
  tokenInPrice: number
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  const tokenIn = TOKEN_INFO[tokenInSymbol.toUpperCase()]
  const tokenOut = TOKEN_INFO[tokenOutSymbol.toUpperCase()]
  if (!tokenIn || !tokenOut) throw new Error(`Unsupported token pair: ${tokenInSymbol} → ${tokenOutSymbol}`)

  // Calculate raw amount based on USD value
  const amountInTokens = amountInUsd / tokenInPrice
  const amountInRaw = parseUnits(amountInTokens.toFixed(tokenIn.decimals), tokenIn.decimals)

  // Minimum output with 5% slippage tolerance
  const minOutRaw = 0n // Accept any output for Sepolia testing

  // User calls executeTrade as both delegator AND agent (self-delegation)
  const { request } = await publicClient.simulateContract({
    account: addr,
    address: DELEGATOR_CONTRACT as `0x${string}`,
    abi: JinniDelegatorABI,
    functionName: 'executeTrade',
    args: [addr, tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`, amountInRaw, minOutRaw]
  })

  return await walletClient.writeContract(request)
}

// ─── REVOKE DELEGATION ───
export async function revokeAgentDelegation(
  userAddress: string
): Promise<string> {
  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  const addr = userAddress as `0x${string}`

  // Revoke self-delegation
  const { request } = await publicClient.simulateContract({
    account: addr,
    address: DELEGATOR_CONTRACT as `0x${string}`,
    abi: JinniDelegatorABI,
    functionName: 'revokeDelegation',
    args: [addr] // agent = self
  })

  return await walletClient.writeContract(request)
}
