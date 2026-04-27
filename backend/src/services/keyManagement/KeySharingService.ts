import { EventEmitter } from 'events';
import { randomBytes, createCipheriv, createDecipheriv, createHash, scryptSync } from 'crypto';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorHandler';
import { ThresholdCryptography } from './ThresholdCryptography';

export interface ShareDistribution {
  keyId: string;
  shareId: string;
  holder: string;
  encryptedShare: string;
  distributedAt: Date;
  expiresAt?: Date;
  status: 'active' | 'revoked' | 'expired';
}

export interface ShareRequest {
  keyId: string;
  requestedBy: string;
  requestedAt: Date;
  approvals: string[];
  requiredApprovals: number;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Secure Key Sharing Service
 * Manages distribution and reconstruction of key shares using threshold cryptography
 */
export class KeySharingService extends EventEmitter {
  private thresholdCrypto: ThresholdCryptography;
  private shareRegistry: Map<string, ShareDistribution> = new Map();
  private shareRequests: Map<string, ShareRequest> = new Map();
  private holderKeys: Map<string, Buffer> = new Map(); // Holder encryption keys

  constructor(thresholdCrypto: ThresholdCryptography) {
    super();
    this.thresholdCrypto = thresholdCrypto;
  }

  /**
   * Share a key with multiple holders using threshold cryptography
   */
  async shareKey(
    keyId: string,
    keyMaterial: Buffer,
    threshold: number,
    shareHolders: string[]
  ): Promise<{ shareId: string; holder: string; encryptedShare: string }[]> {
    try {
      // Create threshold shares
      const shares = await this.thresholdCrypto.createShares(
        keyMaterial,
        threshold,
        shareHolders.length,
        shareHolders
      );

      // Encrypt each share for its holder
      const encryptedShares: { shareId: string; holder: string; encryptedShare: string }[] = [];

      for (const share of shares) {
        // Get or generate holder encryption key
        const holderKey = await this.getOrCreateHolderKey(share.holder);

        // Encrypt share
        const encrypted = await this.encryptShareForHolder(share.share, holderKey);

        // Register share distribution
        const distribution: ShareDistribution = {
          keyId,
          shareId: share.shareId,
          holder: share.holder,
          encryptedShare: encrypted,
          distributedAt: new Date(),
          status: 'active'
        };

        this.shareRegistry.set(share.shareId, distribution);

        encryptedShares.push({
          shareId: share.shareId,
          holder: share.holder,
          encryptedShare: encrypted
        });
      }

      logger.info('Key shared with holders', {
        keyId,
        threshold,
        holders: shareHolders.length
      });

      this.emit('keyShared', {
        keyId,
        threshold,
        holders: shareHolders
      });

      return encryptedShares;
    } catch (error: unknown) {
      logger.error(`Failed to share key ${keyId}:`, error);
      throw new Error(`Key sharing failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Reconstruct a key from shares
   */
  async reconstructKey(
    keyId: string,
    shares: { shareId: string; holder: string; encryptedShare: string }[],
    threshold: number
  ): Promise<Buffer> {
    try {
      // Verify all shares are valid and active
      for (const share of shares) {
        const distribution = this.shareRegistry.get(share.shareId);
        if (!distribution) {
          throw new Error(`Share ${share.shareId} not found`);
        }

        if (distribution.status !== 'active') {
          throw new Error(`Share ${share.shareId} is not active`);
        }

        if (distribution.keyId !== keyId) {
          throw new Error(`Share ${share.shareId} does not belong to key ${keyId}`);
        }

        if (distribution.expiresAt && distribution.expiresAt < new Date()) {
          throw new Error(`Share ${share.shareId} has expired`);
        }
      }

      // Decrypt shares
      const decryptedShares: { shareId: string; holder: string; share: string }[] = [];

      for (const share of shares) {
        const holderKey = this.holderKeys.get(share.holder);
        if (!holderKey) {
          throw new Error(`Holder key not found for ${share.holder}`);
        }

        const decrypted = await this.decryptShareForHolder(share.encryptedShare, holderKey);

        decryptedShares.push({
          shareId: share.shareId,
          holder: share.holder,
          share: decrypted
        });
      }

      // Reconstruct secret
      const keyMaterial = await this.thresholdCrypto.reconstructSecret(
        decryptedShares,
        threshold
      );

      logger.info('Key reconstructed from shares', {
        keyId,
        sharesUsed: shares.length,
        threshold
      });

      this.emit('keyReconstructed', {
        keyId,
        sharesUsed: shares.length
      });

      return keyMaterial;
    } catch (error: unknown) {
      logger.error(`Failed to reconstruct key ${keyId}:`, error);
      throw new Error(`Key reconstruction failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Request access to reconstruct a key
   */
  async requestKeyAccess(
    keyId: string,
    requestedBy: string,
    requiredApprovals: number
  ): Promise<string> {
    const requestId = this.generateRequestId();

    const request: ShareRequest = {
      keyId,
      requestedBy,
      requestedAt: new Date(),
      approvals: [],
      requiredApprovals,
      status: 'pending'
    };

    this.shareRequests.set(requestId, request);

    logger.info('Key access requested', {
      requestId,
      keyId,
      requestedBy,
      requiredApprovals
    });

    this.emit('accessRequested', {
      requestId,
      keyId,
      requestedBy
    });

    return requestId;
  }

  /**
   * Approve a key access request
   */
  async approveRequest(requestId: string, approver: string): Promise<boolean> {
    const request = this.shareRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request ${requestId} is not pending`);
    }

    // Add approval
    if (!request.approvals.includes(approver)) {
      request.approvals.push(approver);
    }

    // Check if enough approvals
    if (request.approvals.length >= request.requiredApprovals) {
      request.status = 'approved';
      this.shareRequests.set(requestId, request);

      logger.info('Key access request approved', {
        requestId,
        keyId: request.keyId,
        approvals: request.approvals.length
      });

      this.emit('accessApproved', {
        requestId,
        keyId: request.keyId
      });

      return true;
    }

    this.shareRequests.set(requestId, request);

    logger.info('Approval added to request', {
      requestId,
      approver,
      totalApprovals: request.approvals.length,
      required: request.requiredApprovals
    });

    return false;
  }

  /**
   * Reject a key access request
   */
  async rejectRequest(requestId: string, rejector: string, reason?: string): Promise<void> {
    const request = this.shareRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    request.status = 'rejected';
    this.shareRequests.set(requestId, request);

    logger.info('Key access request rejected', {
      requestId,
      keyId: request.keyId,
      rejector,
      reason
    });

    this.emit('accessRejected', {
      requestId,
      keyId: request.keyId,
      rejector,
      reason
    });
  }

  /**
   * Revoke a share
   */
  async revokeShare(shareId: string, reason?: string): Promise<void> {
    const distribution = this.shareRegistry.get(shareId);
    if (!distribution) {
      throw new Error(`Share ${shareId} not found`);
    }

    distribution.status = 'revoked';
    this.shareRegistry.set(shareId, distribution);

    logger.warn('Share revoked', {
      shareId,
      keyId: distribution.keyId,
      holder: distribution.holder,
      reason
    });

    this.emit('shareRevoked', {
      shareId,
      keyId: distribution.keyId,
      holder: distribution.holder,
      reason
    });
  }

  /**
   * Refresh shares for a key
   */
  async refreshShares(
    keyId: string,
    threshold: number
  ): Promise<{ shareId: string; holder: string; encryptedShare: string }[]> {
    // Get all active shares for the key
    const activeShares = Array.from(this.shareRegistry.values())
      .filter(d => d.keyId === keyId && d.status === 'active');

    if (activeShares.length < threshold) {
      throw new Error(`Insufficient active shares to refresh key ${keyId}`);
    }

    try {
      // Collect shares for reconstruction
      const sharesToReconstruct = activeShares.slice(0, threshold).map(d => ({
        shareId: d.shareId,
        holder: d.holder,
        share: d.encryptedShare
      }));

      // Reconstruct the key
      const keyMaterial = await this.reconstructKey(keyId, sharesToReconstruct, threshold);

      // Get holders
      const holders = activeShares.map(d => d.holder);

      // Revoke old shares
      for (const share of activeShares) {
        await this.revokeShare(share.shareId, 'Share refresh');
      }

      // Create new shares
      const newShares = await this.shareKey(keyId, keyMaterial, threshold, holders);

      logger.info('Shares refreshed', {
        keyId,
        threshold,
        holders: holders.length
      });

      this.emit('sharesRefreshed', {
        keyId,
        threshold,
        holders: holders.length
      });

      return newShares;
    } catch (error: unknown) {
      logger.error(`Failed to refresh shares for key ${keyId}:`, error);
      throw new Error(`Share refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get share distribution info
   */
  getShareDistribution(shareId: string): ShareDistribution | null {
    return this.shareRegistry.get(shareId) || null;
  }

  /**
   * List shares for a key
   */
  listSharesForKey(keyId: string): ShareDistribution[] {
    return Array.from(this.shareRegistry.values())
      .filter(d => d.keyId === keyId);
  }

  /**
   * List shares for a holder
   */
  listSharesForHolder(holder: string): ShareDistribution[] {
    return Array.from(this.shareRegistry.values())
      .filter(d => d.holder === holder);
  }

  /**
   * Get access request
   */
  getRequest(requestId: string): ShareRequest | null {
    return this.shareRequests.get(requestId) || null;
  }

  /**
   * List pending requests
   */
  listPendingRequests(): ShareRequest[] {
    return Array.from(this.shareRequests.values())
      .filter(r => r.status === 'pending');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalShares: number;
    activeShares: number;
    revokedShares: number;
    expiredShares: number;
    totalRequests: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
  } {
    const shares = Array.from(this.shareRegistry.values());
    const requests = Array.from(this.shareRequests.values());

    return {
      totalShares: shares.length,
      activeShares: shares.filter(s => s.status === 'active').length,
      revokedShares: shares.filter(s => s.status === 'revoked').length,
      expiredShares: shares.filter(s => s.status === 'expired').length,
      totalRequests: requests.length,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      approvedRequests: requests.filter(r => r.status === 'approved').length,
      rejectedRequests: requests.filter(r => r.status === 'rejected').length
    };
  }

  // Private methods

  private async getOrCreateHolderKey(holder: string): Promise<Buffer> {
    let key = this.holderKeys.get(holder);
    
    if (!key) {
      // Generate a new key for the holder
      // In production, this would be derived from the holder's public key
      key = randomBytes(32);
      this.holderKeys.set(holder, key);
    }

    return key;
  }

  private async encryptShareForHolder(share: string, holderKey: Buffer): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const iv = randomBytes(16);
    
    const cipher = createCipheriv(algorithm, holderKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(share)),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // Combine iv, tag, and encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    return combined.toString('base64');
  }

  private async decryptShareForHolder(encryptedShare: string, holderKey: Buffer): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const data = Buffer.from(encryptedShare, 'base64');
    
    // Extract components
    const iv = data.slice(0, 16);
    const tag = data.slice(16, 32);
    const encrypted = data.slice(32);

    const decipher = createDecipheriv(algorithm, holderKey, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }
}

export default KeySharingService;
