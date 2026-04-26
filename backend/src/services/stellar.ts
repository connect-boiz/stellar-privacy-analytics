import { Server, TransactionBuilder, Networks, xdr, rpc, Keypair, Address, Contract } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

export interface ContractCallOptions {
  fee?: string;
  timeout?: number;
  waitForConfirmation?: boolean;
}

export class StellarService {
  private server: rpc.Server;
  private networkPassphrase: string;

  constructor() {
    this.server = new rpc.Server(process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org');
    this.networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
  }

  /**
   * Invoke a Soroban contract function with robust error handling
   */
  async invokeContract(
    contractId: string,
    functionName: string,
    args: xdr.ScVal[] = [],
    secretKey?: string,
    options: ContractCallOptions = {}
  ) {
    const { fee = '100000', timeout = 30000, waitForConfirmation = true } = options;

    try {
      if (!secretKey) {
        throw new Error('Secret key is required for contract invocation');
      }

      const sourceKeypair = Keypair.fromSecret(secretKey);
      const sourceAddress = sourceKeypair.publicKey();
      const contract = new Contract(contractId);

      // 1. Prepare the invocation
      const tx = new TransactionBuilder(
        await this.server.getAccount(sourceAddress),
        {
          fee: fee,
          networkPassphrase: this.networkPassphrase,
        }
      )
        .addOperation(contract.call(functionName, ...args))
        .setTimeout(timeout / 1000)
        .build();

      // 2. Simulate transaction to get footprint and resource usage
      const simulation = await this.server.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationError(simulation)) {
        logger.error(`Simulation failed for ${functionName}:`, simulation.error);
        throw new Error(`Contract simulation failed: ${simulation.error}`);
      }

      if (rpc.Api.isSimulationSuccess(simulation)) {
        // Update transaction with simulation results
        tx.assemble(simulation);
      }

      // 3. Sign and submit
      tx.sign(sourceKeypair);
      
      const submission = await this.server.sendTransaction(tx);
      
      if (submission.status !== 'PENDING') {
        logger.error(`Transaction submission failed for ${functionName}:`, submission);
        throw new Error(`Transaction submission failed with status: ${submission.status}`);
      }

      if (!waitForConfirmation) {
        return submission;
      }

      // 4. Wait for transaction result
      let response = await this.server.getTransaction(submission.hash);
      const pollInterval = 2000;
      const maxRetries = timeout / pollInterval;
      let retries = 0;

      while (response.status === 'NOT_FOUND' || response.status === 'PENDING') {
        if (retries >= maxRetries) {
          throw new Error('Transaction confirmation timed out');
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        response = await this.server.getTransaction(submission.hash);
        retries++;
      }

      if (response.status === 'SUCCESS') {
        logger.info(`Contract call ${functionName} successful`, { txHash: submission.hash });
        // Handle return value if needed
        return response;
      } else {
        logger.error(`Contract call ${functionName} failed on-chain:`, response);
        throw new Error(`Transaction failed: ${JSON.stringify(response.resultXdr)}`);
      }

    } catch (error: any) {
      logger.error(`Stellar Service Error in ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Read-only contract call (simulation)
   */
  async readContract(
    contractId: string,
    functionName: string,
    args: xdr.ScVal[] = [],
    sourceAddress?: string
  ) {
    try {
      const contract = new Contract(contractId);
      const address = sourceAddress || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; // Placeholder

      const tx = new TransactionBuilder(
        new rpc.Account(address, '0'),
        {
          fee: '0',
          networkPassphrase: this.networkPassphrase,
        }
      )
        .addOperation(contract.call(functionName, ...args))
        .setTimeout(0)
        .build();

      const simulation = await this.server.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationError(simulation)) {
        logger.error(`Read-only simulation failed for ${functionName}:`, simulation.error);
        throw new Error(`Read simulation failed: ${simulation.error}`);
      }

      return simulation;
    } catch (error: any) {
      logger.error(`Stellar Service Read Error in ${functionName}:`, error);
      throw error;
    }
  }
}

export const stellarService = new StellarService();
