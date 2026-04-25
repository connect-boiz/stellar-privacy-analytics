/**
 * Tests for Secure Data Upload functionality
 */

import { WebCryptoService } from '../webCrypto';
import { ZKProofService } from '../zkProof';
import { StellarWalletService } from '../stellarWallet';

describe('Secure Data Upload', () => {
  describe('WebCryptoService', () => {
    test('should generate secure password', () => {
      const password = WebCryptoService.generateSecurePassword(32);
      expect(password).toHaveLength(32);
      expect(typeof password).toBe('string');
    });

    test('should generate checksum', async () => {
      const testData = 'test data';
      const checksum = await WebCryptoService.generateChecksum(new TextEncoder().encode(testData));
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should verify file integrity', async () => {
      const testData = 'test data for integrity';
      const buffer = new TextEncoder().encode(testData);
      const checksum = await WebCryptoService.generateChecksum(buffer);
      
      const mockFile = new File([buffer], 'test.txt', { type: 'text/plain' });
      const isValid = await WebCryptoService.verifyFileIntegrity(mockFile, checksum);
      
      expect(isValid).toBe(true);
    });
  });

  describe('ZKProofService', () => {
    test('should initialize WASM module', async () => {
      await expect(ZKProofService.initialize()).resolves.not.toThrow();
    });

    test('should serialize and deserialize proof', async () => {
      const mockProof = {
        proof: new Uint8Array([1, 2, 3, 4]),
        publicInputs: new Uint8Array([5, 6, 7, 8]),
        verificationKey: 'test-key'
      };

      const serialized = await ZKProofService.serializeProof(mockProof);
      expect(typeof serialized).toBe('string');

      const deserialized = await ZKProofService.deserializeProof(serialized);
      expect(deserialized).toBeDefined();
    });
  });

  describe('StellarWalletService', () => {
    test('should generate receipt PDF', () => {
      const mockReceipt = {
        transactionHash: 'test-tx-hash',
        dataCID: 'test-cid',
        encryptedDataHash: 'test-encrypted-hash',
        zkProofHash: 'test-zk-hash',
        timestamp: Date.now(),
        network: 'testnet',
        verificationUrl: 'https://test.stellar.org/tx/test-tx-hash'
      };

      const receiptUrl = StellarWalletService.generateReceiptPDF(mockReceipt);
      expect(receiptUrl).toMatch(/^blob:/);
    });

    test('should format verification URL correctly', () => {
      const testnetUrl = StellarWalletService['getHorizonUrl']('testnet');
      const mainnetUrl = StellarWalletService['getHorizonUrl']('mainnet');

      expect(testnetUrl).toBe('https://horizon-testnet.stellar.org');
      expect(mainnetUrl).toBe('https://horizon.stellar.org');
    });
  });
});
