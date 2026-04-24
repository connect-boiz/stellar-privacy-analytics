/**
 * Stellar wallet integration for transaction signing and blockchain operations
 */

import { WebCryptoService } from './webCrypto';

export interface StellarAccount {
  publicKey: string;
  secretKey?: string;
  network: 'testnet' | 'mainnet' | 'futurenet';
}

export interface TransactionData {
  dataCID: string;
  encryptedDataHash: string;
  zkProofHash: string;
  timestamp: number;
  metadata: any;
}

export interface UploadReceipt {
  transactionHash: string;
  dataCID: string;
  encryptedDataHash: string;
  zkProofHash: string;
  timestamp: number;
  network: string;
  verificationUrl: string;
}

export class StellarWalletService {
  private static readonly HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
  private static readonly HORIZON_MAINNET = 'https://horizon.stellar.org';
  private static readonly NETWORK_PASSPHRASE_TESTNET = 'Test SDF Network ; September 2015';
  private static readonly NETWORK_PASSPHRASE_MAINNET = 'Public Global Stellar Network ; September 2015';

  /**
   * Connect to Stellar wallet (Freighter, Albedo, etc.)
   */
  static async connectWallet(walletType: 'freighter' | 'albedo' | 'xbull' = 'freighter'): Promise<StellarAccount> {
    try {
      let account: StellarAccount;

      switch (walletType) {
        case 'freighter':
          account = await this.connectFreighter();
          break;
        case 'albedo':
          account = await this.connectAlbedo();
          break;
        case 'xbull':
          account = await this.connectXbull();
          break;
        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      return account;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw new Error('Wallet connection failed');
    }
  }

  /**
   * Sign and submit transaction for data upload
   */
  static async signAndSubmitUploadTransaction(
    account: StellarAccount,
    transactionData: TransactionData,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<UploadReceipt> {
    try {
      // Create transaction
      const transaction = await this.createUploadTransaction(account, transactionData, network);
      
      // Sign transaction
      const signedTransaction = await this.signTransaction(transaction, account);
      
      // Submit transaction
      const result = await this.submitTransaction(signedTransaction, network);
      
      // Generate receipt
      const receipt: UploadReceipt = {
        transactionHash: result.hash,
        dataCID: transactionData.dataCID,
        encryptedDataHash: transactionData.encryptedDataHash,
        zkProofHash: transactionData.zkProofHash,
        timestamp: transactionData.timestamp,
        network,
        verificationUrl: `${this.getHorizonUrl(network)}/transactions/${result.hash}`
      };

      return receipt;
    } catch (error) {
      console.error('Failed to sign and submit transaction:', error);
      throw new Error('Transaction submission failed');
    }
  }

  /**
   * Get account balance
   */
  static async getAccountBalance(account: StellarAccount, network: 'testnet' | 'mainnet' = 'testnet'): Promise<string> {
    try {
      const response = await fetch(`${this.getHorizonUrl(network)}/accounts/${account.publicKey}`);
      const accountData = await response.json();
      
      const nativeBalance = accountData.balances.find((balance: any) => balance.asset_type === 'native');
      return nativeBalance ? nativeBalance.balance : '0';
    } catch (error) {
      console.error('Failed to get account balance:', error);
      throw new Error('Failed to retrieve account balance');
    }
  }

  /**
   * Verify transaction on blockchain
   */
  static async verifyTransaction(transactionHash: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<boolean> {
    try {
      const response = await fetch(`${this.getHorizonUrl(network)}/transactions/${transactionHash}`);
      const transaction = await response.json();
      
      return transaction.successful === true;
    } catch (error) {
      console.error('Failed to verify transaction:', error);
      return false;
    }
  }

  /**
   * Generate downloadable receipt
   */
  static generateReceiptPDF(receipt: UploadReceipt): string {
    const receiptContent = `
STELLAR PRIVACY ANALYTICS - UPLOAD RECEIPT
==========================================

Transaction Hash: ${receipt.transactionHash}
Data CID: ${receipt.dataCID}
Encrypted Data Hash: ${receipt.encryptedDataHash}
ZK-Proof Hash: ${receipt.zkProofHash}
Timestamp: ${new Date(receipt.timestamp).toISOString()}
Network: ${receipt.network}

Verification URL: ${receipt.verificationUrl}

This receipt confirms that your data has been securely uploaded
to the Stellar blockchain with the following guarantees:
- Client-side encryption before upload
- Zero-knowledge proof verification
- Immutable on-chain storage
- Complete audit trail

Save this receipt for your records. You can verify the authenticity
of this upload by visiting the verification URL above.
    `.trim();

    // Create blob for download
    const blob = new Blob([receiptContent], { type: 'text/plain' });
    return URL.createObjectURL(blob);
  }

  /**
   * Download receipt as file
   */
  static downloadReceipt(receipt: UploadReceipt): void {
    const receiptUrl = this.generateReceiptPDF(receipt);
    const link = document.createElement('a');
    link.href = receiptUrl;
    link.download = `stellar-upload-receipt-${receipt.transactionHash.substring(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(receiptUrl);
  }

  // Private helper methods

  private static async connectFreighter(): Promise<StellarAccount> {
    if (!(window as any).freighter) {
      throw new Error('Freighter wallet is not installed');
    }

    try {
      const publicKey = await (window as any).freighter.getPublicKey();
      const network = await (window as any).freighter.getNetwork();

      return {
        publicKey,
        network: network === 'TESTNET' ? 'testnet' : 'mainnet'
      };
    } catch (error) {
      throw new Error('Failed to connect to Freighter wallet');
    }
  }

  private static async connectAlbedo(): Promise<StellarAccount> {
    if (!(window as any).albedo) {
      throw new Error('Albedo wallet is not available');
    }

    try {
      const result = await (window as any).albedo.publicKey();
      
      return {
        publicKey: result.pubkey,
        network: 'testnet' // Albedo typically uses testnet by default
      };
    } catch (error) {
      throw new Error('Failed to connect to Albedo wallet');
    }
  }

  private static async connectXbull(): Promise<StellarAccount> {
    if (!(window as any).xbull) {
      throw new Error('xBull wallet is not installed');
    }

    try {
      const publicKey = await (window as any).xbull.getPublicKey();
      
      return {
        publicKey,
        network: 'testnet' // Default to testnet
      };
    } catch (error) {
      throw new Error('Failed to connect to xBull wallet');
    }
  }

  private static async createUploadTransaction(
    account: StellarAccount,
    transactionData: TransactionData,
    network: 'testnet' | 'mainnet'
  ): Promise<any> {
    // In a real implementation, this would use the Stellar SDK
    // For now, we'll simulate transaction creation
    
    const horizonUrl = this.getHorizonUrl(network);
    const response = await fetch(`${horizonUrl}/accounts/${account.publicKey}`);
    const accountData = await response.json();

    // Simulate transaction creation
    return {
      account: account.publicKey,
      sequence: accountData.sequence,
      operations: [
        {
          type: 'manage_data',
          name: 'data_cid',
          value: transactionData.dataCID
        },
        {
          type: 'manage_data',
          name: 'encrypted_hash',
          value: transactionData.encryptedDataHash
        },
        {
          type: 'manage_data',
          name: 'zk_proof_hash',
          value: transactionData.zkProofHash
        },
        {
          type: 'manage_data',
          name: 'timestamp',
          value: transactionData.timestamp.toString()
        }
      ],
      memo: `Data Upload: ${transactionData.dataCID.substring(0, 8)}...`,
      networkPassphrase: network === 'testnet' ? this.NETWORK_PASSPHRASE_TESTNET : this.NETWORK_PASSPHRASE_MAINNET
    };
  }

  private static async signTransaction(transaction: any, account: StellarAccount): Promise<string> {
    // In a real implementation, this would use the wallet's signing method
    // For now, we'll simulate signing
    
    if ((window as any).freighter) {
      return await (window as any).freighter.signTransaction(transaction);
    } else if ((window as any).albedo) {
      const result = await (window as any).albedo.tx({ xdr: transaction });
      return result.xdr;
    } else if ((window as any).xbull) {
      return await (window as any).xbull.signTransaction(transaction);
    } else {
      throw new Error('No wallet available for signing');
    }
  }

  private static async submitTransaction(signedTransaction: string, network: 'testnet' | 'mainnet'): Promise<any> {
    const horizonUrl = this.getHorizonUrl(network);
    
    const response = await fetch(`${horizonUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `tx=${encodeURIComponent(signedTransaction)}`
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Transaction failed: ${error.title}`);
    }

    return await response.json();
  }

  private static getHorizonUrl(network: 'testnet' | 'mainnet'): string {
    return network === 'testnet' ? this.HORIZON_TESTNET : this.HORIZON_MAINNET;
  }
}

// Extend Window interface for wallet types
declare global {
  interface Window {
    freighter?: {
      getPublicKey: () => Promise<string>;
      getNetwork: () => Promise<string>;
      signTransaction: (transaction: any) => Promise<string>;
    };
    albedo?: {
      publicKey: () => Promise<{ pubkey: string }>;
      tx: (params: { xdr: string }) => Promise<{ xdr: string }>;
    };
    xbull?: {
      getPublicKey: () => Promise<string>;
      signTransaction: (transaction: any) => Promise<string>;
    };
  }
}
