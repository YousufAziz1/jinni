# 🧞 JINNI — Autonomous DeFi Wallet Agent

> 🎯 Built for the MetaMask Smart Accounts x Venice AI Hackathon

<div align="center">
  <img src="frontend/public/logo.jpg" alt="JINNI Logo" width="120" style="border-radius: 20px; border: 2px solid #6c63ff;" />
  <h3>Autonomous Agentic DeFi Wallet Layer</h3>
  <p>Delegated execution powered by Venice AI, MetaMask EIP-712 permissions, and ERC-7710/7715 architectures.</p>

  [![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-success?style=for-the-badge&logo=vercel&color=000000)](https://jinni-omega.vercel.app/)
  [![Network Sepolia](https://img.shields.io/badge/Sepolia-Connected-blue?style=for-the-badge&logo=ethereum&color=454a75)](https://sepolia.etherscan.io/)
  [![Powered by Venice AI](https://img.shields.io/badge/Venice%20AI-Llama3.3--70b-orange?style=for-the-badge&logo=openai&color=e6643c)](https://venice.ai/)
  [![License MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge&color=2e8c58)](./LICENSE)
</div>

---

## 🔗 Live Resources

* **Live Frontend**: [https://jinni-omega.vercel.app/](https://jinni-omega.vercel.app/)
* **Live Backend API**: [https://jinni-6wfe.onrender.com/api/status](https://jinni-6wfe.onrender.com/api/status)
* **Demo Video**: [https://youtu.be/skp-PdfZ4Ko](https://youtu.be/skp-PdfZ4Ko)
* **X (Twitter) Profile**: [https://x.com/JinniAgent](https://x.com/JinniAgent)
* **Launch Post**: [https://x.com/JinniAgent/status/2066420765499801732](https://x.com/JinniAgent/status/2066420765499801732)

---

## 🎨 Platform Dashboard

![JINNI Dashboard](./screenshot.png)

---

## 🏆 Hackathon Track Mapping

| Track / Integration | Technology Used | Implementation Details & Code Files |
| :--- | :--- | :--- |
| **MetaMask & EIP-712 Delegations** | MetaMask EIP-712 Signatures | Users sign typed spending limits securely via MetaMask, simulating non-custodial session authorization and EIP-7715 keys. <br> 📄 See [`frontend/src/lib/web3.ts`](./frontend/src/lib/web3.ts) |
| **Venice AI Reasoning Core** | Llama-3.3-70b Inference | Evaluates user wallet history, recommends safe daily risk limits, and scores tokens to execute swaps autonomously. <br> 📄 See [`backend/agents.py`](./backend/agents.py) |
| **ERC-7715 / Permissioning** | On-Chain Delegated Permissions | Restricts agent actions to specific assets, trade sizes, and expiration limits verified directly inside smart contracts. <br> 📄 See [`contracts/JinniDelegator.sol`](./contracts/JinniDelegator.sol) |
| **ERC-7710 / Delegations** | Non-Custodial Vault Swapping | Ensures the agent EOA can only interact within user-deposited vault parameters and has zero rights to withdraw funds. <br> 📄 See [`contracts/JinniDelegator.sol`](./contracts/JinniDelegator.sol) |

---

## 🚀 Key Features

* **AI-Generated Risk Policy**: Venice AI checks your wallet holdings and recommends trade sizes, weekly limits, and duration bounds.
* **On-Chain Session Signatures**: EIP-712 session approvals register agent spending limits on-chain, keeping you in full control.
* **Non-Custodial Escrow Vault**: Users deposit Sepolia ETH, USDC, LINK, or UNI. The agent swaps inside the Uniswap V3 Pool but can never extract funds.
* **Position Monitoring Agent**: Evaluates active vault swaps with automated exit logic (Stop Loss & Take Profit thresholds).
* **Built-in Sepolia Faucet**: Mint Mock USDC, LINK, or UNI directly on-chain through the dashboard.

---

## 📐 System Architecture & Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Jinni React Dashboard
    participant Backend as FastAPI Backend Agent
    participant Contract as JinniDelegator Vault
    participant Venice as Venice AI Core
    
    User->>Frontend: Connect MetaMask Smart Account
    Frontend->>Backend: Request Wallet Analysis
    Backend->>Venice: Fetch balance/tx history & evaluate risk
    Venice-->>Backend: Recommend maximum limits policy
    Backend-->>Frontend: Return policy recommendations
    User->>Frontend: Approve Policy limits
    Frontend->>User: Request EIP-712 signature (ERC-7715 simulation)
    User-->>Frontend: Sign with MetaMask
    Frontend->>Contract: Submit signature to register delegation on-chain
    Contract-->>Frontend: Delegation granted on-chain
    Frontend->>Backend: Activate autonomous trading agent
    
    loop Research & Trading Loop
        Backend->>Venice: Analyze token pricing & technical indicators
        Venice-->>Backend: Decision (Score, Verdict: BUY/HOLD/SELL, Reasoning)
        Alt Verdict is BUY and delegation is active
            Backend->>Contract: Call executeTrade(USDC -> LINK) using Agent key
            Contract->>Contract: Validate trade size & weekly budget
            Contract->>Uniswap: Execute swap on SwapRouter02 (Sepolia)
            Uniswap-->>Contract: Credit LINK vault balance
            Contract-->>Backend: Emit TradeExecuted event
        end
    end
    
    loop Position Monitoring Loop
        Backend->>Backend: Fetch live prices & check active positions
        Alt Stop Loss or Take Profit crossed
            Backend->>Contract: Call executeTrade(LINK -> USDC) using Agent key
            Contract->>Uniswap: Swap target asset back to USDC
            Uniswap-->>Contract: Credit USDC vault balance
            Contract->>Backend: Mark Position as CLOSED
        end
    end
```

---

## ⛓️ Deployed Contracts (Sepolia Network)

* **JinniDelegator Vault**: [`0x5462D420CEf200c8704Db6b48BE9Db3A000A231C`](https://sepolia.etherscan.io/address/0x5462D420CEf200c8704Db6b48BE9Db3A000A231C)
* **Test USDC Token**: [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
* **Test LINK Token**: [`0x779877A7B0D9E8603169DdbD7836e478b4624789`](https://sepolia.etherscan.io/address/0x779877A7B0D9E8603169DdbD7836e478b4624789)
* **Test UNI Token**: [`0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984`](https://sepolia.etherscan.io/address/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984)
* **Uniswap V3 Router02**: `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`

---

## 🛠️ Installation & Setup

### Prerequisites
* **Python 3.10+** (Backend)
* **Node.js v18+** & `pnpm` (Frontend)
* **MetaMask browser extension** (Sepolia network)

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create environment variables:
   ```bash
   cp .env.example .env
   ```
4. Configure your `.env` values (Venice API Key, RPC URL, and Agent private key).
5. Run the server:
   ```bash
   python main.py
   ```
   Backend runs at `http://localhost:8000`.

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install packages:
   ```bash
   pnpm install
   ```
3. Start the Vite server:
   ```bash
   pnpm dev
   ```
   Frontend runs at `http://localhost:5173`.

---

## 💡 Step-by-Step Test Guide

1. **Connect MetaMask**: Click **Connect Wallet** (top-right) and switch your network to **Sepolia**.
2. **Mock Token setup**: Click **Setup Local Test Environment** in the faucet card to register/deploy the testing tokens inside MetaMask.
3. **Mint USDC**: Click **Claim USDC** to mint 1,000 mock USDC for testing.
4. **Deposit to Vault**: Select `USDC` in the **Agent Trading Vault** panel, input `25`, and click **Deposit to Vault**.
5. **Analyze Wallet**: Click **Analyze Wallet Risk (Venice AI)**. The agent will read your Sepolia balances and generate a custom trading limit policy.
6. **Grant Permissions**: Click **Approve Policy & Sign EIP-712**. Sign the signature request inside MetaMask.
7. **DeFi Research**: Type a token symbol (e.g. `LINK` or `UNI`) in the **DeFi Research Agent** box and click **Score Token** to get AI evaluation.
8. **Trade**: If the AI returns a `BUY` verdict, click **Execute Agent Swap** to execute the trade autonomously using the agent.
9. **Exit Monitoring**: The position will load under **Active Positions Monitor**. The background exit loops will automatically execute a sell swap if Take Profit or Stop Loss thresholds are hit.

---

## ✉️ Outreach / DM Template

If you want to reach out to builders, mentors, or judges, use this template:

```markdown
Hi 👋

I just completed my hackathon project JINNI — Autonomous DeFi Wallet Agent.

JINNI combines:
* MetaMask Smart Accounts
* ERC-7715 Permissions
* ERC-7710 Delegations
* Venice AI

Users can connect their wallet, set spending limits, grant permissions, and allow an AI agent to research and execute actions within those limits while remaining fully in control.

### Demo Video
https://youtu.be/skp-PdfZ4Ko

### GitHub
https://github.com/YousufAziz1/jinni

### X Profile
https://x.com/JinniAgent

### Launch Post
https://x.com/JinniAgent/status/2066420765499801732

Current features:
✅ Wallet Connection
✅ Agent Permissions
✅ Venice AI Research Agent
✅ Trading Vault
✅ Activity Logs
✅ Position Monitoring UI
✅ Sepolia Test Environment

I'm currently polishing the final submission.

I'd really appreciate any feedback on:
* Missing features
* UX improvements
* Hackathon judging perspective
* Documentation gaps

Thanks for taking a look! 🙏
```

---

*Built with ❤️ for the Hackathon by Yousuf.*
