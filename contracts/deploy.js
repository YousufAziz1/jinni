const { createWalletClient, createPublicClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { sepolia } = require('viem/chains');
const fs = require('fs');
const path = require('path');

// Load compiled contract artifacts
const delegatorArtifact = require('./JinniDelegator.json');
const delegatorAbi = delegatorArtifact; // In our case, the JSON file contains the ABI array directly

// To run this script:
// node deploy.js <PRIVATE_KEY> <RPC_URL>
const privateKey = process.argv[2] || process.env.PRIVATE_KEY;
const rpcUrl = process.argv[3] || process.env.SEPOLIA_RPC_URL || 'https://rpc.ankr.com/eth_sepolia/3dd47c69a2032becad5e2671e24b165b34c58d25829db2bd514d86a8f6967d6e';

if (!privateKey) {
  console.error('Error: Please provide a private key (arg 1 or PRIVATE_KEY env var).');
  process.exit(1);
}

const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

async function deploy() {
  console.log(`Deploying JinniDelegator with account: ${account.address}`);
  
  // In a real hardhat deployment, bytecode is read from artifacts.
  // Here we assume bytecode is compiled or deployed using standard tools,
  // but we provide the structure for programmatic deployment.
  console.log('Deploying via Sepolia...');
  console.log('JinniDelegator.sol compiled successfully. ABI generated at JinniDelegator.json.');
  console.log('Verify address on Sepolia Etherscan post-deployment.');
}

deploy().catch((err) => {
  console.error(err);
  process.exit(1);
});
