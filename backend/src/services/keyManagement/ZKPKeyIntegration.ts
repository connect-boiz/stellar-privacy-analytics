import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHandler';
import type { KeyManagementService } from './KeyManagementService';

export interface ZKPKeyPair {
  provingKeyId: string;
  verificationKeyId: string;
  circuitId: string;
}

/**
 * Zero-Knowledge Proof Key Integration
 * Provides specialized key management for ZK proof systems
 */
export class ZKPKeyIntegration extends EventEmitter {
  private keyManagementService: KeyManagementService;
  private zkpKeyPairs: Map<string, ZKPKeyPair> = new Map(); // circuitId -> keyPair

  constructor(keyManagementService: KeyManagementService) {
    super();
    this.keyManagementService = keyManagementService;
  }

  /**
   * Generate proving and verification keys for a circuit
   */
  async generateCircuitKeys(
    circuitId: string,
    proofSystem: 'groth16' | 'plonk' | 'bulletproofs'
  ): Promise<ZKPKeyPair> {
    try {
      // Generate proving key
      const provingKeyResult = await this.keyManagementService.generateKey({
        keyType: 'zkp',
        purpose: `zkp-proving-${circuitId}`,
        owner: 'system',
        tags: ['zkp', 'proving', circuitId, proofSystem],
        algorithm: this.getAlgorithmForProofSystem(proofSystem),
        keySize: this.getKeySizeForProofSystem(proofSystem),
        enableBackup: true
      });

      // Generate verification key
      const verificationKeyResult = await this.keyManagementService.generateKey({
        keyType: 'zkp',
        purpose: `zkp-verification-${circuitId}`,
        owner: 'system',
        tags: ['zkp', 'verification', circuitId, proofSystem],
        algorithm: this.getAlgorithmForProofSystem(proofSystem),
        keySize: this.getKeySizeForProofSystem(proofSystem),
        enableBackup: true
      });

      const keyPair: ZKPKeyPair = {
        provingKeyId: provingKeyResult.keyId,
        verificationKeyId: verificationKeyResult.keyId,
        circuitId
      };

      this.zkpKeyPairs.set(circuitId, keyPair);

      logger.info('ZKP circuit keys generated', {
        circuitId,
        proofSystem,
        provingKeyId: keyPair.provingKeyId,
        verificationKeyId: keyPair.verificationKeyId
      });

      this.emit('circuitKeysGenerated', {
        circuitId,
        proofSystem,
        keyPair
      });

      return keyPair;
    } catch (error: unknown) {
      logger.error(`Failed to generate ZKP circuit keys for ${circuitId}:`, error);
      throw new Error(`ZKP key generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get key pair for a circuit
   */
  getCircuitKeys(circuitId: string): ZKPKeyPair | null {
    return this.zkpKeyPairs.get(circuitId) || null;
  }

  /**
   * Rotate circuit keys
   */
  async rotateCircuitKeys(circuitId: string): Promise<ZKPKeyPair> {
    const existingKeyPair = this.zkpKeyPairs.get(circuitId);
    if (!existingKeyPair) {
      throw new Error(`No key pair found for circuit ${circuitId}`);
    }

    try {
      // Rotate proving key
      const provingKeyResult = await this.keyManagementService.rotateKey(
        existingKeyPair.provingKeyId,
        'ZKP proving key rotation'
      );

      // Rotate verification key
      const verificationKeyResult = await this.keyManagementService.rotateKey(
        existingKeyPair.verificationKeyId,
        'ZKP verification key rotation'
      );

      const newKeyPair: ZKPKeyPair = {
        provingKeyId: provingKeyResult.newKeyId,
        verificationKeyId: verificationKeyResult.newKeyId,
        circuitId
      };

      this.zkpKeyPairs.set(circuitId, newKeyPair);

      logger.info('ZKP circuit keys rotated', {
        circuitId,
        oldProvingKeyId: provingKeyResult.oldKeyId,
        newProvingKeyId: provingKeyResult.newKeyId,
        oldVerificationKeyId: verificationKeyResult.oldKeyId,
        newVerificationKeyId: verificationKeyResult.newKeyId
      });

      this.emit('circuitKeysRotated', {
        circuitId,
        oldKeyPair: existingKeyPair,
        newKeyPair
      });

      return newKeyPair;
    } catch (error: unknown) {
      logger.error(`Failed to rotate ZKP circuit keys for ${circuitId}:`, error);
      throw error;
    }
  }

  /**
   * Revoke circuit keys
   */
  async revokeCircuitKeys(circuitId: string, reason: string): Promise<void> {
    const keyPair = this.zkpKeyPairs.get(circuitId);
    if (!keyPair) {
      throw new Error(`No key pair found for circuit ${circuitId}`);
    }

    try {
      // Revoke both keys
      await this.keyManagementService.revokeKey(
        keyPair.provingKeyId,
        reason,
        'system'
      );

      await this.keyManagementService.revokeKey(
        keyPair.verificationKeyId,
        reason,
        'system'
      );

      this.zkpKeyPairs.delete(circuitId);

      logger.warn('ZKP circuit keys revoked', {
        circuitId,
        reason
      });

      this.emit('circuitKeysRevoked', { circuitId, reason });
    } catch (error: unknown) {
      logger.error(`Failed to revoke ZKP circuit keys for ${circuitId}:`, error);
      throw error;
    }
  }

  /**
   * Generate ephemeral proof key
   * Used for one-time proofs that don't need long-term storage
   */
  async generateEphemeralProofKey(
    proofId: string,
    proofSystem: 'groth16' | 'plonk' | 'bulletproofs'
  ): Promise<string> {
    try {
      const keyResult = await this.keyManagementService.generateKey({
        keyType: 'zkp',
        purpose: `zkp-ephemeral-${proofId}`,
        owner: 'system',
        tags: ['zkp', 'ephemeral', proofId, proofSystem],
        algorithm: this.getAlgorithmForProofSystem(proofSystem),
        keySize: this.getKeySizeForProofSystem(proofSystem),
        ttl: 3600, // 1 hour
        enableBackup: false
      });

      logger.info('Ephemeral ZKP proof key generated', {
        proofId,
        proofSystem,
        keyId: keyResult.keyId
      });

      this.emit('ephemeralKeyGenerated', {
        proofId,
        keyId: keyResult.keyId
      });

      return keyResult.keyId;
    } catch (error: unknown) {
      logger.error(`Failed to generate ephemeral ZKP proof key for ${proofId}:`, error);
      throw error;
    }
  }

  /**
   * Batch generate keys for multiple circuits
   */
  async batchGenerateCircuitKeys(
    circuits: { circuitId: string; proofSystem: 'groth16' | 'plonk' | 'bulletproofs' }[]
  ): Promise<Map<string, ZKPKeyPair>> {
    const results = new Map<string, ZKPKeyPair>();

    try {
      // Generate keys in parallel for better performance
      const keyPairs = await Promise.all(
        circuits.map(circuit => 
          this.generateCircuitKeys(circuit.circuitId, circuit.proofSystem)
        )
      );

      circuits.forEach((circuit, index) => {
        results.set(circuit.circuitId, keyPairs[index]);
      });

      logger.info('Batch ZKP circuit keys generated', {
        count: circuits.length
      });

      this.emit('batchCircuitKeysGenerated', {
        count: circuits.length
      });

      return results;
    } catch (error: unknown) {
      logger.error('Failed to batch generate ZKP circuit keys:', error);
      throw error;
    }
  }

  /**
   * List all circuit IDs with keys
   */
  listCircuits(): string[] {
    return Array.from(this.zkpKeyPairs.keys());
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalCircuits: number;
    totalKeysGenerated: number;
    ephemeralKeysGenerated: number;
  } {
    return {
      totalCircuits: this.zkpKeyPairs.size,
      totalKeysGenerated: this.listenerCount('circuitKeysGenerated'),
      ephemeralKeysGenerated: this.listenerCount('ephemeralKeyGenerated')
    };
  }

  // Private helper methods

  private getAlgorithmForProofSystem(
    proofSystem: 'groth16' | 'plonk' | 'bulletproofs'
  ): string {
    switch (proofSystem) {
      case 'groth16':
        return 'bn254-groth16';
      case 'plonk':
        return 'bn254-plonk';
      case 'bulletproofs':
        return 'curve25519-bulletproofs';
      default:
        return 'aes-256-gcm';
    }
  }

  private getKeySizeForProofSystem(
    proofSystem: 'groth16' | 'plonk' | 'bulletproofs'
  ): number {
    switch (proofSystem) {
      case 'groth16':
        return 48; // 384 bits for BN254
      case 'plonk':
        return 48;
      case 'bulletproofs':
        return 32; // 256 bits for Curve25519
      default:
        return 32;
    }
  }
}

export default ZKPKeyIntegration;
