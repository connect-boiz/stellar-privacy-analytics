import {
  Networks,
  TransactionBuilder,
  Account,
  Keypair,
  Contract,
  SorobanRpc,
  xdr,
  Address,
  Operation,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

// Configuration
const config = {
  testnet: {
    network: Networks.TESTNET,
    server: new SorobanRpc.Server("https://soroban-testnet.stellar.org"),
    friendbot: "https://friendbot.stellar.org",
  },
  futurenet: {
    network: Networks.FUTURENET,
    server: new SorobanRpc.Server("https://rpc-futurenet.stellar.org"),
    friendbot: "https://friendbot-futurenet.stellar.org",
  },
  standalone: {
    network: Networks.STANDALONE,
    server: new SorobanRpc.Server("http://localhost:8000/soroban/rpc"),
  },
};

async function deployContract(
  network: keyof typeof config,
  contractName: string,
  wasmPath: string,
  adminSecret: string,
) {
  console.log(`Deploying ${contractName} to ${network}...`);

  const { server, network: networkPassphrase } = config[network];

  // Load admin account
  const adminKeypair = Keypair.fromSecret(adminSecret);
  const adminPublicKey = adminKeypair.publicKey();

  // Fund account if needed (for test networks)
  if (network === "testnet" || network === "futurenet") {
    try {
      const friendbotUrl = config[network].friendbot;
      const response = await fetch(`${friendbotUrl}?addr=${adminPublicKey}`);
      if (!response.ok) {
        console.log("Account may already be funded or friendbot unavailable");
      } else {
        const result = await response.json();
        console.log("Account funded:", result);
      }
    } catch (error) {
      console.log("Friendbot request failed, assuming account already funded");
    }
  }

  // Get account details
  const account = await server.getAccount(adminPublicKey);

  // Read WASM file
  const wasmBuffer = readFileSync(join(__dirname, "..", wasmPath));

  // Create deploy transaction
  // TODO: Replace with proper Soroban contract deployment using invokeHostFunction
  const deployOp = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeCreateContract(
      new xdr.CreateContractArgs({
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(adminPublicKey).toScAddress(),
            salt: randomBytes(32),
          }),
        ),
        executable: xdr.ContractExecutable.contractExecutableWasm(
          wasmBuffer,
        ),
      }),
    ),
    auth: [],
  });

  const transaction = new TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase,
  })
    .addOperation(deployOp)
    .setTimeout(30)
    .build();

  // Sign transaction
  transaction.sign(adminKeypair);

  // Submit transaction
  try {
    const result = await server.sendTransaction(transaction);
    console.log(`${contractName} deployed successfully!`);
    console.log("Transaction hash:", result.hash);

    // TODO: Extract contract address from sendTransaction response
    // SorobanRpc sendTransaction returns hash + status; address extraction
    // requires polling getTransaction and parsing the result XDR.
    const contractAddress = (result as any).result?.value?.address?.toString()
      ?? result.hash;
    console.log("Contract address:", contractAddress);

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
  contractType: "analytics" | "oracle",
) {
  console.log(`Initializing ${contractType} contract...`);

  const { server, network: networkPassphrase } = config[network];
  const adminKeypair = Keypair.fromSecret(adminSecret);
  const adminPublicKey = adminKeypair.publicKey();

  const account = await server.getAccount(adminPublicKey);
  const contract = new Contract(contractAddress);

  const initOp = contract.call(
    "initialize",
    new Address(adminPublicKey).toScVal(),
  );

  const transaction = new TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase,
  })
    .addOperation(initOp)
    .setTimeout(30)
    .build();

  transaction.sign(adminKeypair);

  try {
    const result = await server.sendTransaction(transaction);
    console.log(`${contractType} contract initialized successfully!`);
    console.log("Transaction hash:", result.hash);
    return result.hash;
  } catch (error) {
    console.error(`Failed to initialize ${contractType} contract:`, error);
    throw error;
  }
}

async function main() {
  const network = (process.argv[2] as keyof typeof config) || "testnet";
  const adminSecret = process.argv[3] || process.env.STELLAR_ADMIN_SECRET;

  if (!adminSecret) {
    console.error(
      "Admin secret key is required. Set STELLAR_ADMIN_SECRET environment variable or pass as argument.",
    );
    process.exit(1);
  }

  console.log(`Starting deployment to ${network} network...`);

  try {
    // Deploy Stellar Analytics contract
    const analyticsWasmPath =
      "target/wasm32-unknown-unknown/release/stellar_analytics.wasm";
    const analyticsAddress = await deployContract(
      network,
      "StellarAnalytics",
      analyticsWasmPath,
      adminSecret,
    );

    // Initialize Stellar Analytics contract
    await initializeContract(
      network,
      analyticsAddress,
      adminSecret,
      "analytics",
    );

    // Deploy Privacy Oracle contract
    const oracleWasmPath =
      "target/wasm32-unknown-unknown/release/privacy_oracle.wasm";
    const oracleAddress = await deployContract(
      network,
      "PrivacyOracle",
      oracleWasmPath,
      adminSecret,
    );

    // Initialize Privacy Oracle contract
    await initializeContract(network, oracleAddress, adminSecret, "oracle");

    console.log("\n🎉 Deployment completed successfully!");
    console.log("\nContract Addresses:");
    console.log(`Stellar Analytics: ${analyticsAddress}`);
    console.log(`Privacy Oracle: ${oracleAddress}`);

    console.log("\nSave these addresses for your application configuration:");
    console.log(`STELLAR_ANALYTICS_CONTRACT=${analyticsAddress}`);
    console.log(`PRIVACY_ORACLE_CONTRACT=${oracleAddress}`);
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
