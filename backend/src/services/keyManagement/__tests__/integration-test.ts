/**
 * Integration Test for Key Management Service
 * Tests full workflows end-to-end
 * 
 * Run with: ts-node src/services/keyManagement/__tests__/integration-test.ts
 */

import { KeyManagementService } from '../KeyManagementService';
import { ThresholdCryptography } from '../ThresholdCryptography';
import { KeyBackupService } from '../KeyBackupService';
import { KeySharingService } from '../KeySharingService';
import { KeyRotationScheduler } from '../KeyRotationScheduler';
import { PerformanceOptimizer } from '../PerformanceOptimizer';
import { SMPCKeyIntegration } from '../SMPCKeyIntegration';
import { ZKPKeyIntegration } from '../ZKPKeyIntegration';
import { HSMService } from '../../hsmService';

// Simple test framework
class IntegrationTestRunner {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Running Key Management Integration Tests\n');
    console.log('='.repeat(70));

    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        console.log(`✅ PASS: ${test.name}`);
      } catch (error) {
        this.failed++;
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) {
          console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      }
    }

    console.log('='.repeat(70));
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);

    return this.failed === 0;
  }
}

// Helper functions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Initialize services
async function setupServices() {
  // Note: HSM service will fail to connect without real endpoint
  // For testing, we'll catch the error and continue
  const hsmConfig = {
    endpoint: process.env.HSM_ENDPOINT || 'https://mock-hsm.example.com',
    apiKey: process.env.HSM_API_KEY || 'mock-api-key',
    apiSecret: process.env.HSM_API_SECRET || 'mock-api-secret',
    clientId: process.env.HSM_CLIENT_ID || 'mock-client-id'
  };

  const hsmService = new HSMService(hsmConfig);
  const thresholdCrypto = new ThresholdCryptography();
  const backupService = new KeyBackupService(hsmService);
  const sharingService = new KeySharingService(thresholdCrypto);
  const performanceOptimizer = new PerformanceOptimizer();
  
  const keyManagementService = new KeyManagementService(
    hsmService,
    thresholdCrypto,
    backupService,
    sharingService,
    performanceOptimizer
  );

  const rotationScheduler = new KeyRotationScheduler(keyManagementService);
  const smpcIntegration = new SMPCKeyIntegration(keyManagementService);
  const zkpIntegration = new ZKPKeyIntegration(keyManagementService);

  // Initialize services
  await backupService.initialize();
  await performanceOptimizer.initialize();

  return {
    keyManagementService,
    thresholdCrypto,
    backupService,
    sharingService,
    rotationScheduler,
    performanceOptimizer,
    smpcIntegration,
    zkpIntegration,
    hsmService
  };
}

// Tests
const runner = new IntegrationTestRunner();

runner.test('Service Initialization', async () => {
  const services = await setupServices();
  
  assert(services.keyManagementService !== null, 'KeyManagementService should initialize');
  assert(services.thresholdCrypto !== null, 'ThresholdCryptography should initialize');
  assert(services.backupService !== null, 'BackupService should initialize');
  assert(services.sharingService !== null, 'SharingService should initialize');
  
  console.log('   ℹ️  All services initialized successfully');
});

runner.test('Threshold Cryptography: Full Workflow', async () => {
  const services = await setupServices();
  const crypto = services.thresholdCrypto;
  
  // Create secret
  const secret = Buffer.from('my-secret-key-material-12345678901234567890');
  const threshold = 3;
  const totalShares = 5;
  const holders = ['alice', 'bob', 'charlie', 'dave', 'eve'];
  
  // Create shares
  const shares = await crypto.createShares(secret, threshold, totalShares, holders);
  assert(shares.length === 5, 'Should create 5 shares');
  
  // Reconstruct from threshold
  const reconstructed = await crypto.reconstructSecret(shares.slice(0, 3), threshold);
  assert(reconstructed.equals(secret), 'Reconstructed secret should match original');
  
  // Verify shares
  for (const share of shares) {
    const isValid = await crypto.verifyShare(share);
    assert(isValid, `Share ${share.shareId} should be valid`);
  }
  
  // Refresh shares
  const refreshed = await crypto.refreshShares(shares, threshold);
  assert(refreshed.length === 5, 'Should create 5 refreshed shares');
  
  // Verify refreshed shares reconstruct to same secret
  const reconstructedRefreshed = await crypto.reconstructSecret(refreshed.slice(0, 3), threshold);
  assert(reconstructedRefreshed.equals(secret), 'Refreshed shares should reconstruct to same secret');
  
  console.log('   ℹ️  Full threshold cryptography workflow completed');
});

runner.test('Key Sharing: Access Request Workflow', async () => {
  const services = await setupServices();
  const sharingService = services.sharingService;
  
  // Create a mock key
  const keyId = 'test-key-123';
  const keyMaterial = Buffer.from('test-key-material-1234567890123456');
  const threshold = 2;
  const holders = ['alice', 'bob', 'charlie'];
  
  // Share the key
  const shares = await sharingService.shareKey(keyId, keyMaterial, threshold, holders);
  assert(shares.length === 3, 'Should create 3 shares');
  
  // Request access
  const requestId = await sharingService.requestKeyAccess(keyId, 'dave', 2);
  assert(requestId !== null, 'Should create access request');
  
  // Approve request
  const approved1 = await sharingService.approveRequest(requestId, 'alice');
  assert(!approved1, 'Should not be approved with 1 approval');
  
  const approved2 = await sharingService.approveRequest(requestId, 'bob');
  assert(approved2, 'Should be approved with 2 approvals');
  
  // Get request status
  const request = sharingService.getRequest(requestId);
  assert(request?.status === 'approved', 'Request should be approved');
  
  console.log('   ℹ️  Key sharing access request workflow completed');
});

runner.test('Performance Optimizer: Caching Workflow', async () => {
  const services = await setupServices();
  const optimizer = services.performanceOptimizer;
  
  // Cache some data
  optimizer.cacheOperationResult('encrypt', 'key1', { encrypted: 'data1' });
  optimizer.cacheOperationResult('encrypt', 'key2', { encrypted: 'data2' });
  
  // Retrieve cached data
  const cached1 = optimizer.getCachedOperationResult('encrypt', 'key1');
  assert(cached1 !== null, 'Should retrieve cached data');
  assert(cached1.encrypted === 'data1', 'Cached data should match');
  
  const cached2 = optimizer.getCachedOperationResult('encrypt', 'key2');
  assert(cached2 !== null, 'Should retrieve second cached data');
  
  // Check cache miss
  const cached3 = optimizer.getCachedOperationResult('encrypt', 'key3');
  assert(cached3 === null, 'Should return null for cache miss');
  
  // Get metrics
  const metrics = optimizer.getMetrics();
  assert(metrics.cacheHits === 2, 'Should have 2 cache hits');
  assert(metrics.cacheMisses === 1, 'Should have 1 cache miss');
  assert(metrics.cacheHitRate === 2/3, 'Cache hit rate should be 66.67%');
  
  console.log('   ℹ️  Performance optimizer caching workflow completed');
});

runner.test('Performance Optimizer: Parallel Execution', async () => {
  const services = await setupServices();
  const optimizer = services.performanceOptimizer;
  
  // Create mock operations
  const operations = [
    async () => { await new Promise(resolve => setTimeout(resolve, 10)); return 1; },
    async () => { await new Promise(resolve => setTimeout(resolve, 10)); return 2; },
    async () => { await new Promise(resolve => setTimeout(resolve, 10)); return 3; },
    async () => { await new Promise(resolve => setTimeout(resolve, 10)); return 4; },
    async () => { await new Promise(resolve => setTimeout(resolve, 10)); return 5; }
  ];
  
  const startTime = Date.now();
  const results = await optimizer.executeParallel(operations);
  const duration = Date.now() - startTime;
  
  assert(results.length === 5, 'Should execute all operations');
  assert(results[0] === 1 && results[4] === 5, 'Results should be correct');
  assert(duration < 100, 'Parallel execution should be faster than sequential');
  
  console.log(`   ℹ️  Parallel execution completed in ${duration}ms`);
});

runner.test('Backup Service: Statistics', async () => {
  const services = await setupServices();
  const backupService = services.backupService;
  
  // Get statistics
  const stats = backupService.getStatistics();
  assert(stats !== null, 'Should return statistics');
  assert(typeof stats.totalBackups === 'number', 'Should have totalBackups');
  assert(typeof stats.completedBackups === 'number', 'Should have completedBackups');
  assert(typeof stats.failedBackups === 'number', 'Should have failedBackups');
  
  console.log('   ℹ️  Backup service statistics retrieved');
});

runner.test('Sharing Service: Statistics', async () => {
  const services = await setupServices();
  const sharingService = services.sharingService;
  
  // Get statistics
  const stats = sharingService.getStatistics();
  assert(stats !== null, 'Should return statistics');
  assert(typeof stats.totalShares === 'number', 'Should have totalShares');
  assert(typeof stats.activeShares === 'number', 'Should have activeShares');
  assert(typeof stats.totalRequests === 'number', 'Should have totalRequests');
  
  console.log('   ℹ️  Sharing service statistics retrieved');
});

runner.test('Rotation Scheduler: Statistics', async () => {
  const services = await setupServices();
  const rotationScheduler = services.rotationScheduler;
  
  // Get statistics
  const stats = rotationScheduler.getStatistics();
  assert(stats !== null, 'Should return statistics');
  assert(typeof stats.totalScheduled === 'number', 'Should have totalScheduled');
  assert(typeof stats.dueRotations === 'number', 'Should have dueRotations');
  assert(typeof stats.totalRotations === 'number', 'Should have totalRotations');
  
  console.log('   ℹ️  Rotation scheduler statistics retrieved');
});

runner.test('HSM Service: System Status', async () => {
  const services = await setupServices();
  const hsmService = services.hsmService;
  
  // Get system status
  const status = hsmService.getSystemStatus();
  assert(status !== null, 'Should return system status');
  assert(typeof status.killSwitchActive === 'boolean', 'Should have killSwitchActive');
  assert(typeof status.activeKeysCount === 'number', 'Should have activeKeysCount');
  assert(status.rotationPolicy !== null, 'Should have rotation policy');
  
  console.log('   ℹ️  HSM service system status retrieved');
});

runner.test('Cleanup: Shutdown Services', async () => {
  const services = await setupServices();
  
  // Shutdown services
  await services.backupService.shutdown();
  await services.performanceOptimizer.shutdown();
  await services.rotationScheduler.stop();
  
  console.log('   ℹ️  All services shut down successfully');
});

// Run all tests
runner.run().then(success => {
  if (success) {
    console.log('✅ All integration tests passed!\n');
    console.log('📝 Note: Some tests use mock data since HSM is not configured.');
    console.log('   To test with real HSM, configure HSM_ENDPOINT in .env\n');
  } else {
    console.log('❌ Some integration tests failed\n');
  }
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
