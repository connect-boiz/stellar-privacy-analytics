import { StellarAnalytics } from '../src/stellar_analytics';
import { PrivacyOracle } from '../src/privacy_oracle';
import { Server, Networks, TransactionBuilder, Account, Keypair, Contract } from '@stellar/stellar-sdk';
import { Contract as SorobanContract, xdr, Operation, Asset } from '@stellar/stellar-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

// Configuration
const config = {
  testnet: {
    network: Networks.TESTNET,
    server: new Server('https://horizon-testnet.stellar.org'),
    friendbot: 'https://friendbot.stellar.org',
  },
  futurenet: {
    network: Networks.FUTURENET,
    server: new Server('https://horizon-futurenet.stellar.org'),
    friendbot: 'https://friendbot-futurenet.stellar.org',
  },
  standalone: {
    network: Networks.STANDALONE,
    server: new Server('http://localhost:8000'),
  },
};

async function deployContract(
  network: keyof typeof config,
  contractName: string,
  wasmPath: string,
  adminSecret: string
) {
  console.log(`Deploying ${contractName} to ${network}...`);

  const { server, network: networkPassphrase } = config[network];
  
  // Load admin account
  const adminKeypair = Keypair.fromSecret(adminSecret);
  const adminPublicKey = adminKeypair.publicKey();

  // Fund account if needed (for test networks)
  if (network === 'testnet' || network === 'futurenet') {
    try {
      const friendbotUrl = config[network].friendbot;
      const response = await fetch(`${friendbotUrl}?addr=${adminPublicKey}`);
      if (!response.ok) {
        console.log('Account may already be funded or friendbot unavailable');
      } else {
        const result = await response.json();
        console.log('Account funded:', result);
      }
    } catch (error) {
      console.log('Friendbot request failed, assuming account already funded');
    }
  }

  // Get account details
  const account = await server.loadAccount(adminPublicKey);

  // Read WASM file
  const wasmBuffer = readFileSync(join(__dirname, '..', wasmPath));
  const wasmHash = xdr.Hash.fromXDR(Buffer.from(wasmBuffer.slice(0, 32)).toString('hex'));

  // Create deploy transaction
  const contract = new SorobanContract({
    wasmHash: wasmHash,
    networkPassphrase,
  });

  const deployOp = Operation.createCustomContract({
    wasmHash: wasmHash,
    address: adminPublicKey,
  });

  const transaction = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase,
  })
    .addOperation(deployOp)
    .setTimeout(30)
    .build();

  // Sign transaction
  transaction.sign(adminKeypair);

  // Submit transaction
  try {
    const result = await server.submitTransaction(transaction);
    console.log(`${contractName} deployed successfully!`);
    console.log('Transaction hash:', result.hash);
    
    // Extract contract address from result
    const contractAddress = result.result?.value?.address?.toString();
    console.log('Contract address:', contractAddress);
    
    return contractAddress;
  } catch (error) {
    console.error(`Failed to deploy ${contractName}:`, error);
    throw error;
  }
}

async function initializeContract(
  network: keyof typeof config,
  contractAddress: string,
  adminSecret: string,
  contractType: 'analytics' | 'oracle'
) {
  console.log(`Initializing ${contractType} contract...`);

  const { server, network: networkPassphrase } = config[network];
  const adminKeypair = Keypair.fromSecret(adminSecret);
  const adminPublicKey = adminKeypair.publicKey();

  const account = await server.loadAccount(adminPublicKey);
  const contract = new Contract(contractAddress);

  let initOp;
  if (contractType === 'analytics') {
    initOp = contract.call('initialize', adminPublicKey);
  } else {
    initOp = contract.call('initialize', adminPublicKey);
  }

  const transaction = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase,
  })
    .addOperation(initOp)
    .setTimeout(30)
    .build();

  transaction.sign(adminKeypair);

  try {
    const result = await server.submitTransaction(transaction);
    console.log(`${contractType} contract initialized successfully!`);
    console.log('Transaction hash:', result.hash);
    return result.hash;
  } catch (error) {
    console.error(`Failed to initialize ${contractType} contract:`, error);
    throw error;
  }
}

async function main() {
  const network = process.argv[2] as keyof typeof config || 'testnet';
  const adminSecret = process.argv[3] || process.env.STELLAR_ADMIN_SECRET;

  if (!adminSecret) {
    console.error('Admin secret key is required. Set STELLAR_ADMIN_SECRET environment variable or pass as argument.');
    process.exit(1);
  }

  console.log(`Starting deployment to ${network} network...`);

  try {
    // Deploy Stellar Analytics contract
    const analyticsWasmPath = 'target/wasm32-unknown-unknown/release/stellar_analytics.wasm';
    const analyticsAddress = await deployContract(network, 'StellarAnalytics', analyticsWasmPath, adminSecret);
    
    // Initialize Stellar Analytics contract
    await initializeContract(network, analyticsAddress, adminSecret, 'analytics');

    // Deploy Privacy Oracle contract
    const oracleWasmPath = 'target/wasm32-unknown-unknown/release/privacy_oracle.wasm';
    const oracleAddress = await deployContract(network, 'PrivacyOracle', oracleWasmPath, adminSecret);
    
    // Initialize Privacy Oracle contract
    await initializeContract(network, oracleAddress, adminSecret, 'oracle');

    console.log('\n🎉 Deployment completed successfully!');
    console.log('\nContract Addresses:');
    console.log(`Stellar Analytics: ${analyticsAddress}`);
    console.log(`Privacy Oracle: ${oracleAddress}`);
    
    console.log('\nSave these addresses for your application configuration:');
    console.log(`STELLAR_ANALYTICS_CONTRACT=${analyticsAddress}`);
    console.log(`PRIVACY_ORACLE_CONTRACT=${oracleAddress}`);

  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
