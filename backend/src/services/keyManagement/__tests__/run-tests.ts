/**
 * Simple test runner for Key Management Service
 * Run with: ts-node src/services/keyManagement/__tests__/run-tests.ts
 */

import { ThresholdCryptography } from '../ThresholdCryptography';
import { randomBytes } from 'crypto';

// Simple test framework
class TestRunner {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Running Key Management Service Tests\n');
    console.log('='.repeat(60));

    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        console.log(`✅ PASS: ${test.name}`);
      } catch (error) {
        this.failed++;
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log('='.repeat(60));
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

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertBufferEqual(actual: Buffer, expected: Buffer, message?: string) {
  if (!actual.equals(expected)) {
    throw new Error(message || 'Buffers are not equal');
  }
}

async function assertRejects(fn: () => Promise<any>, message?: string) {
  try {
    await fn();
    throw new Error(message || 'Expected function to reject');
  } catch (error) {
    // Expected to throw
  }
}

// Tests
const runner = new TestRunner();

// Threshold Cryptography Tests
runner.test('ThresholdCryptography: Create shares successfully', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);
  const threshold = 3;
  const totalShares = 5;
  const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

  const shares = await crypto.createShares(secret, threshold, totalShares, shareHolders);

  assertEqual(shares.length, 5, 'Should create 5 shares');
  assert(shares[0].shareId !== undefined, 'Share should have shareId');
  assert(shares[0].holder !== undefined, 'Share should have holder');
  assert(shares[0].share !== undefined, 'Share should have share data');
  assertEqual(shares[0].holder, 'holder1', 'First share should belong to holder1');
});

runner.test('ThresholdCryptography: Reject threshold > totalShares', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);

  await assertRejects(
    () => crypto.createShares(secret, 6, 5, ['h1', 'h2', 'h3', 'h4', 'h5']),
    'Should reject threshold > totalShares'
  );
});

runner.test('ThresholdCryptography: Reject threshold < 2', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);

  await assertRejects(
    () => crypto.createShares(secret, 1, 5, ['h1', 'h2', 'h3', 'h4', 'h5']),
    'Should reject threshold < 2'
  );
});

runner.test('ThresholdCryptography: Reconstruct secret from threshold shares', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);
  const threshold = 3;
  const totalShares = 5;
  const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

  const shares = await crypto.createShares(secret, threshold, totalShares, shareHolders);
  const reconstructed = await crypto.reconstructSecret(shares.slice(0, 3), threshold);

  assertBufferEqual(reconstructed, secret, 'Reconstructed secret should match original');
});

runner.test('ThresholdCryptography: Reconstruct from any threshold combination', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);
  const threshold = 3;
  const totalShares = 5;
  const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

  const shares = await crypto.createShares(secret, threshold, totalShares, shareHolders);

  // Try different combinations
  const combo1 = await crypto.reconstructSecret([shares[0], shares[2], shares[4]], threshold);
  assertBufferEqual(combo1, secret, 'Combo 1 should reconstruct secret');

  const combo2 = await crypto.reconstructSecret([shares[1], shares[3], shares[4]], threshold);
  assertBufferEqual(combo2, secret, 'Combo 2 should reconstruct secret');
});

runner.test('ThresholdCryptography: Reject insufficient shares', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);
  const threshold = 3;
  const totalShares = 5;
  const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

  const shares = await crypto.createShares(secret, threshold, totalShares, shareHolders);

  await assertRejects(
    () => crypto.reconstructSecret(shares.slice(0, 2), threshold),
    'Should reject insufficient shares'
  );
});

runner.test('ThresholdCryptography: Verify valid share', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);
  const shares = await crypto.createShares(secret, 3, 5, ['h1', 'h2', 'h3', 'h4', 'h5']);

  const isValid = await crypto.verifyShare(shares[0]);
  assert(isValid, 'Valid share should verify');
});

runner.test('ThresholdCryptography: Reject invalid share format', async () => {
  const crypto = new ThresholdCryptography();
  const invalidShare = {
    shareId: 'test',
    holder: 'holder1',
    share: 'invalid-base64'
  };

  const isValid = await crypto.verifyShare(invalidShare);
  assert(!isValid, 'Invalid share should not verify');
});

runner.test('ThresholdCryptography: Refresh shares without changing secret', async () => {
  const crypto = new ThresholdCryptography();
  const secret = randomBytes(32);
  const threshold = 3;
  const totalShares = 5;
  const shareHolders = ['holder1', 'holder2', 'holder3', 'holder4', 'holder5'];

  const originalShares = await crypto.createShares(secret, threshold, totalShares, shareHolders);
  const refreshedShares = await crypto.refreshShares(originalShares, threshold);

  const reconstructed = await crypto.reconstructSecret(refreshedShares.slice(0, threshold), threshold);
  assertBufferEqual(reconstructed, secret, 'Refreshed shares should reconstruct to same secret');

  assert(refreshedShares[0].share !== originalShares[0].share, 'Shares should be different after refresh');
});

// Run all tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
