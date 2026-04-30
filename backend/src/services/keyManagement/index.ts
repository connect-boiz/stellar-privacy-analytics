/**
 * Cryptographic Key Management Service
 * 
 * Comprehensive key lifecycle management with HSM integration,
 * automated rotation, threshold cryptography, and disaster recovery.
 */

export { KeyManagementService } from './KeyManagementService';
export type {
  KeyMetadata,
  KeyGenerationRequest,
  KeyUsagePolicy,
  KeyLifecycleEvent
} from './KeyManagementService';

export { ThresholdCryptography } from './ThresholdCryptography';

export { KeyRotationScheduler } from './KeyRotationScheduler';
export type {
  RotationPolicy,
  RotationSchedule
} from './KeyRotationScheduler';

export { KeyBackupService } from './KeyBackupService';
export type {
  BackupConfig,
  BackupRecord
} from './KeyBackupService';

export { KeySharingService } from './KeySharingService';
export type {
  ShareDistribution,
  ShareRequest
} from './KeySharingService';

export { PerformanceOptimizer } from './PerformanceOptimizer';
export type {
  CacheConfig,
  PerformanceMetrics,
  OptimizationStrategy
} from './PerformanceOptimizer';

export { SMPCKeyIntegration } from './SMPCKeyIntegration';

export { ZKPKeyIntegration } from './ZKPKeyIntegration';
export type {
  ZKPKeyPair
} from './ZKPKeyIntegration';

/**
 * Initialize and get Key Management Service instance
 */
import { KeyManagementService } from './KeyManagementService';
import { getHSMIntegration } from '../hsmIntegration';

let keyManagementServiceInstance: KeyManagementService | null = null;

export async function getKeyManagementService(): Promise<KeyManagementService> {
  if (!keyManagementServiceInstance) {
    const hsmIntegration = getHSMIntegration();
    const hsmService = hsmIntegration.getHSMService();
    const masterKeyManager = hsmIntegration.getMasterKeyManager();

    keyManagementServiceInstance = new KeyManagementService(hsmService, masterKeyManager);
    await keyManagementServiceInstance.initialize();
  }

  return keyManagementServiceInstance;
}

export function resetKeyManagementService(): void {
  keyManagementServiceInstance = null;
}
