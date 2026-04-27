import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHandler';
import type { KeyManagementService } from './KeyManagementService';

/**
 * SMPC Key Integration
 * Provides specialized key management for Secure Multi-Party Computation
 */
export class SMPCKeyIntegration extends EventEmitter {
  private keyManagementService: KeyManagementService;
  private sessionKeys: Map<string, string> = new Map(); // sessionId -> keyId

  constructor(keyManagementService: KeyManagementService) {
    super();
    this.keyManagementService = keyManagementService;
  }

  /**
   * Generate keys for SMPC session
   */
  async generateSessionKeys(
    sessionId: string,
    participants: string[],
    threshold: number
  ): Promise<{
    sessionKeyId: string;
    participantKeys: Map<string, string>;
    shares: { shareId: string; holder: string; encryptedShare: string }[];
  }> {
    try {
      // Generate master session key
      const sessionKeyResult = await this.keyManagementService.generateKey({
        keyType: 'smpc',
        purpose: `smpc-session-${sessionId}`,
        owner: 'system',
        tags: ['smpc', 'session', sessionId],
        enableThreshold: true,
        thresholdConfig: {
          threshold,
          totalShares: participants.length,
          shareHolders: participants
        },
        enableBackup: true,
        ttl: 24 * 60 * 60 // 24 hours
      });

      // Generate individual participant keys
      const participantKeys = new Map<string, string>();
      
      for (const participant of participants) {
        const participantKeyResult = await this.keyManagementService.generateKey({
          keyType: 'smpc',
          purpose: `smpc-participant-${sessionId}-${participant}`,
          owner: participant,
          tags: ['smpc', 'participant', sessionId, participant],
          ttl: 24 * 60 * 60
        });

        participantKeys.set(participant, participantKeyResult.keyId);
      }

      // Store session mapping
      this.sessionKeys.set(sessionId, sessionKeyResult.keyId);

      logger.info('SMPC session keys generated', {
        sessionId,
        sessionKeyId: sessionKeyResult.keyId,
        participants: participants.length,
        threshold
      });

      this.emit('sessionKeysGenerated', {
        sessionId,
        sessionKeyId: sessionKeyResult.keyId,
        participants: participants.length
      });

      return {
        sessionKeyId: sessionKeyResult.keyId,
        participantKeys,
        shares: sessionKeyResult.shares || []
      };
    } catch (error: unknown) {
      logger.error(`Failed to generate SMPC session keys for ${sessionId}:`, error);
      throw new Error(`SMPC key generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Reconstruct session key from participant shares
   */
  async reconstructSessionKey(
    sessionId: string,
    shares: { shareId: string; holder: string; encryptedShare: string }[]
  ): Promise<Buffer> {
    const sessionKeyId = this.sessionKeys.get(sessionId);
    if (!sessionKeyId) {
      throw new Error(`No session key found for session ${sessionId}`);
    }

    try {
      const metadata = this.keyManagementService.getKeyMetadata(sessionKeyId);
      if (!metadata || !metadata.thresholdConfig) {
        throw new Error(`Session key ${sessionKeyId} not configured for threshold cryptography`);
      }

      const keyMaterial = await this.keyManagementService.reconstructKey(
        sessionKeyId,
        shares
      );

      logger.info('SMPC session key reconstructed', {
        sessionId,
        sessionKeyId,
        sharesUsed: shares.length
      });

      this.emit('sessionKeyReconstructed', {
        sessionId,
        sessionKeyId
      });

      return keyMaterial;
    } catch (error: unknown) {
      logger.error(`Failed to reconstruct SMPC session key for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Rotate session keys
   */
  async rotateSessionKeys(sessionId: string): Promise<void> {
    const sessionKeyId = this.sessionKeys.get(sessionId);
    if (!sessionKeyId) {
      throw new Error(`No session key found for session ${sessionId}`);
    }

    try {
      const result = await this.keyManagementService.rotateKey(
        sessionKeyId,
        'SMPC session key rotation'
      );

      // Update session mapping
      this.sessionKeys.set(sessionId, result.newKeyId);

      logger.info('SMPC session keys rotated', {
        sessionId,
        oldKeyId: result.oldKeyId,
        newKeyId: result.newKeyId
      });

      this.emit('sessionKeysRotated', {
        sessionId,
        oldKeyId: result.oldKeyId,
        newKeyId: result.newKeyId
      });
    } catch (error: unknown) {
      logger.error(`Failed to rotate SMPC session keys for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup session keys
   */
  async cleanupSessionKeys(sessionId: string): Promise<void> {
    const sessionKeyId = this.sessionKeys.get(sessionId);
    if (!sessionKeyId) {
      return;
    }

    try {
      await this.keyManagementService.revokeKey(
        sessionKeyId,
        'SMPC session ended',
        'system'
      );

      this.sessionKeys.delete(sessionId);

      logger.info('SMPC session keys cleaned up', {
        sessionId,
        sessionKeyId
      });

      this.emit('sessionKeysCleanedUp', { sessionId });
    } catch (error: unknown) {
      logger.error(`Failed to cleanup SMPC session keys for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session key ID
   */
  getSessionKeyId(sessionId: string): string | null {
    return this.sessionKeys.get(sessionId) || null;
  }

  /**
   * List active sessions
   */
  listActiveSessions(): string[] {
    return Array.from(this.sessionKeys.keys());
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeSessions: number;
    totalKeysGenerated: number;
  } {
    return {
      activeSessions: this.sessionKeys.size,
      totalKeysGenerated: this.listenerCount('sessionKeysGenerated')
    };
  }
}

export default SMPCKeyIntegration;
