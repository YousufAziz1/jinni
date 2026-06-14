const fs = require('fs');
const path = require('path');
const solc = require('solc');

const sourcePath = path.join(__dirname, 'TestToken.sol');
const source = fs.readFileSync(sourcePath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'TestToken.sol': {
      content: source,
    },
  },
  settings: {
    evmVersion: 'paris',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

console.log('Compiling TestToken.sol...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  output.errors.forEach((err) => {
    console.error(err.formattedMessage);
  });
}

const contract = output.contracts['TestToken.sol']['TestToken'];
const artifact = {
  abi: contract.abi,
  bytecode: contract.evm.bytecode.object,
};

fs.writeFileSync(
  path.join(__dirname, 'TestToken.json'),
  JSON.stringify(artifact, null, 2)
);
console.log('TestToken.json updated with ABI and bytecode successfully!');
