const { createWalletClient, createPublicClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { sepolia } = require('viem/chains');
const fs = require('fs');
const path = require('path');

const artifact = require('./TestToken.json');
const abi = artifact.abi;
const bytecode = artifact.bytecode;

const privateKey = process.argv[2];
if (!privateKey) {
  console.error('Error: Please provide a private key as an argument (e.g. node deploy_mocks.js <PRIVATE_KEY>)');
  process.exit(1);
}

const rpcUrl = 'https://rpc.ankr.com/eth_sepolia/3dd47c69a2032becad5e2671e24b165b34c58d25829db2bd514d86a8f6967d6e';

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

async function deployToken(name, symbol, decimals) {
  console.log(`\nDeploying ${name} (${symbol}) with ${decimals} decimals...`);
  
  const hash = await walletClient.deployContract({
    abi,
    bytecode: `0x${bytecode}`,
    args: [name, symbol, decimals],
  });
  
  console.log(`Transaction hash: ${hash}`);
  console.log('Waiting for transaction to be mined...');
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${symbol} deployed successfully at address: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

function updateFrontendAndBackend(usdc, link, uni) {
  // Update frontend web3.ts
  const web3Path = path.join(__dirname, '../frontend/src/lib/web3.ts');
  if (fs.existsSync(web3Path)) {
    let content = fs.readFileSync(web3Path, 'utf8');
    
    // Replace USDC
    content = content.replace(
      /'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'/g,
      `'${usdc}'`
    );
    // Replace LINK
    content = content.replace(
      /'0x779877A7B0D9E8603169DdbD7836e478b4624789'/g,
      `'${link}'`
    );
    // Replace UNI
    content = content.replace(
      /'0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'/g,
      `'${uni}'`
    );
    
    fs.writeFileSync(web3Path, content, 'utf8');
    console.log('Updated token addresses in frontend web3.ts!');
  }

  // Update backend agents.py
  const agentsPath = path.join(__dirname, '../backend/agents.py');
  if (fs.existsSync(agentsPath)) {
    let content = fs.readFileSync(agentsPath, 'utf8');
    
    // Replace USDC
    content = content.replace(
      /"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"/g,
      `"${usdc}"`
    );
    // Replace LINK
    content = content.replace(
      /"0x779877A7B0D9E8603169DdbD7836e478b4624789"/g,
      `"${link}"`
    );
    // Replace UNI
    content = content.replace(
      /"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"/g,
      `"${uni}"`
    );
    
    fs.writeFileSync(agentsPath, content, 'utf8');
    console.log('Updated token addresses in backend agents.py!');
  }
}

async function main() {
  console.log(`Starting deployment using account: ${account.address}`);
  
  const usdcAddress = await deployToken('Mock USDC', 'USDC', 6);
  const linkAddress = await deployToken('Mock LINK', 'LINK', 18);
  const uniAddress = await deployToken('Mock UNI', 'UNI', 18);
  
  console.log('\n======================================');
  console.log('DEPLOYMENT COMPLETE:');
  console.log(`Mock USDC: ${usdcAddress}`);
  console.log(`Mock LINK: ${linkAddress}`);
  console.log(`Mock UNI:  ${uniAddress}`);
  console.log('======================================');

  console.log('\nRewriting configurations with newly deployed addresses...');
  updateFrontendAndBackend(usdcAddress, linkAddress, uniAddress);
  console.log('All files updated successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
