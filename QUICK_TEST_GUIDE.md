# Quick Test Guide - Key Management Service

**Quick reference for testing and verifying the Key Management Service implementation**

---

## ✅ Run All Tests

### 1. Unit Tests (Threshold Cryptography)

```bash
cd stellar-privacy-analytics/backend
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/run-tests.ts
```

**Expected Output:**
```
🧪 Running Key Management Service Tests

============================================================
✅ PASS: ThresholdCryptography: Create shares successfully
✅ PASS: ThresholdCryptography: Reject threshold > totalShares
✅ PASS: ThresholdCryptography: Reject threshold < 2
✅ PASS: ThresholdCryptography: Reconstruct secret from threshold shares
✅ PASS: ThresholdCryptography: Reconstruct from any threshold combination
✅ PASS: ThresholdCryptography: Reject insufficient shares
✅ PASS: ThresholdCryptography: Verify valid share
✅ PASS: ThresholdCryptography: Reject invalid share format
✅ PASS: ThresholdCryptography: Refresh shares without changing secret
============================================================

📊 Results: 9 passed, 0 failed
```

### 2. Integration Tests

```bash
cd stellar-privacy-analytics/backend
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/integration-test.ts
```

**Expected Output:**
```
🧪 Running Key Management Integration Tests

======================================================================
✅ PASS: Service Initialization
✅ PASS: Threshold Cryptography: Full Workflow
✅ PASS: Key Sharing: Access Request Workflow
✅ PASS: Performance Optimizer: Caching Workflow
✅ PASS: Performance Optimizer: Parallel Execution
✅ PASS: Backup Service: Statistics
✅ PASS: Sharing Service: Statistics
✅ PASS: Rotation Scheduler: Statistics
✅ PASS: HSM Service: System Status
✅ PASS: Cleanup: Shutdown Services
======================================================================

📊 Results: 10 passed, 0 failed
```

### 3. TypeScript Compilation Check

```bash
cd stellar-privacy-analytics/backend
npx tsc --noEmit
```

**Expected Output:**
```
# No output = success (no compilation errors)
```

---

## 📁 Key Files to Review

### Core Services
```bash
# Main key management service
backend/src/services/keyManagement/KeyManagementService.ts

# Threshold cryptography (TESTED ✅)
backend/src/services/keyManagement/ThresholdCryptography.ts

# Key rotation scheduler
backend/src/services/keyManagement/KeyRotationScheduler.ts

# Backup service
backend/src/services/keyManagement/KeyBackupService.ts

# Sharing service
backend/src/services/keyManagement/KeySharingService.ts

# Performance optimizer
backend/src/services/keyManagement/PerformanceOptimizer.ts

# SMPC integration
backend/src/services/keyManagement/SMPCKeyIntegration.ts

# ZKP integration
backend/src/services/keyManagement/ZKPKeyIntegration.ts
```

### Tests
```bash
# Unit tests (PASSING ✅)
backend/src/services/keyManagement/__tests__/run-tests.ts

# Integration tests
backend/src/services/keyManagement/__tests__/integration-test.ts
```

### Utilities
```bash
# Error handling utilities
backend/src/utils/errorHandler.ts
```

### Documentation
```bash
# User guide
backend/docs/KEY_MANAGEMENT_SERVICE.md

# Security audit guide
backend/docs/KEY_MANAGEMENT_SECURITY_AUDIT.md

# Implementation details
backend/docs/KEY_MANAGEMENT_IMPLEMENTATION.md

# Quick start
backend/docs/KEY_MANAGEMENT_QUICKSTART.md
```

### Reports
```bash
# Test results and status
TEST_RESULTS_AND_STATUS.md

# Final implementation report
FINAL_IMPLEMENTATION_REPORT.md

# Bug tracking
BUGS_AND_FIXES.md
```

---

## 🔍 Verify Bug Fixes

### 1. Check Error Handling

```bash
# Search for unsafe error handling (should find NONE)
cd stellar-privacy-analytics/backend
grep -r "catch (error)" src/services/keyManagement/ | grep -v "error: unknown"
```

**Expected:** No results (all errors properly typed)

### 2. Check Import of Error Handler

```bash
# Verify all services import error handler
grep -r "getErrorMessage" src/services/keyManagement/*.ts
```

**Expected:** Multiple matches in all service files

### 3. Check Validation Usage

```bash
# Verify validation functions are used
grep -r "validateThresholdParams\|validateKeySize\|validateTTL" src/services/keyManagement/
```

**Expected:** Multiple matches showing validation in use

---

## 🚀 Quick Start Example

### Test Threshold Cryptography

```typescript
import { ThresholdCryptography } from './src/services/keyManagement/ThresholdCryptography';
import { randomBytes } from 'crypto';

async function quickTest() {
  const crypto = new ThresholdCryptography();
  
  // Create a secret
  const secret = randomBytes(32);
  console.log('Secret:', secret.toString('hex'));
  
  // Create shares (3 of 5 threshold)
  const shares = await crypto.createShares(
    secret,
    3, // threshold
    5, // total shares
    ['alice', 'bob', 'charlie', 'dave', 'eve']
  );
  console.log('Created', shares.length, 'shares');
  
  // Reconstruct from any 3 shares
  const reconstructed = await crypto.reconstructSecret(
    shares.slice(0, 3),
    3
  );
  console.log('Reconstructed:', reconstructed.toString('hex'));
  
  // Verify they match
  console.log('Match:', secret.equals(reconstructed) ? '✅' : '❌');
}

quickTest();
```

---

## 📊 Check Statistics

### Get Service Statistics

```typescript
// In your code or tests:

// Threshold Cryptography
const cryptoStats = thresholdCrypto.getStatistics();
console.log('Crypto Stats:', cryptoStats);

// Backup Service
const backupStats = backupService.getStatistics();
console.log('Backup Stats:', backupStats);

// Sharing Service
const sharingStats = sharingService.getStatistics();
console.log('Sharing Stats:', sharingStats);

// Rotation Scheduler
const rotationStats = rotationScheduler.getStatistics();
console.log('Rotation Stats:', rotationStats);

// Performance Optimizer
const perfStats = performanceOptimizer.getMetrics();
console.log('Performance Stats:', perfStats);

// HSM Service
const hsmStatus = hsmService.getSystemStatus();
console.log('HSM Status:', hsmStatus);
```

---

## 🔧 HSM Configuration

### Configure HSM Connection

1. **Create/Update `.env` file:**

```bash
cd stellar-privacy-analytics/backend
nano .env
```

2. **Add HSM configuration:**

```bash
# HSM Configuration
HSM_ENDPOINT=https://your-hsm-endpoint.com
HSM_API_KEY=your-api-key-here
HSM_API_SECRET=your-api-secret-here
HSM_CLIENT_ID=your-client-id-here

# Optional: Client certificates for mutual TLS
HSM_CLIENT_CERT_PATH=/path/to/client-cert.pem
HSM_CLIENT_KEY_PATH=/path/to/client-key.pem
HSM_CA_CERT_PATH=/path/to/ca-cert.pem

# Key rotation policy
HSM_KEY_ROTATION_DAYS=90
```

3. **Test HSM connection:**

```bash
# Run integration tests with real HSM
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/integration-test.ts
```

---

## ✅ Verification Checklist

### Before Deployment

- [ ] All unit tests passing (9/9)
- [ ] All integration tests passing
- [ ] TypeScript compiles without errors
- [ ] HSM endpoint configured
- [ ] HSM connection verified
- [ ] Documentation reviewed
- [ ] Security audit completed (recommended)
- [ ] Load testing completed (recommended)

### Quick Verification Commands

```bash
# 1. Run unit tests
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/run-tests.ts

# 2. Run integration tests
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/integration-test.ts

# 3. Check TypeScript compilation
npx tsc --noEmit

# 4. Check for unsafe error handling
grep -r "catch (error)" src/services/keyManagement/ | grep -v "error: unknown"

# 5. Verify all services exist
ls -la src/services/keyManagement/*.ts
```

---

## 🐛 Troubleshooting

### Tests Fail to Run

**Problem:** `ts-node: command not found`

**Solution:**
```bash
# Use local ts-node
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/run-tests.ts
```

### TypeScript Compilation Errors

**Problem:** `Cannot find name 'Buffer'` or similar

**Solution:**
```bash
# Check tsconfig.json has:
"types": ["node"]
```

### HSM Connection Fails

**Problem:** `HSM connection is unhealthy`

**Solution:**
1. Check HSM endpoint is correct
2. Verify API credentials
3. Check network connectivity
4. Review HSM service logs

### Import Errors

**Problem:** `Cannot find module`

**Solution:**
```bash
# Install dependencies
npm install

# Or with legacy peer deps
npm install --legacy-peer-deps
```

---

## 📞 Support

### Documentation
- User Guide: `backend/docs/KEY_MANAGEMENT_SERVICE.md`
- Security Guide: `backend/docs/KEY_MANAGEMENT_SECURITY_AUDIT.md`
- Implementation: `backend/docs/KEY_MANAGEMENT_IMPLEMENTATION.md`
- Quick Start: `backend/docs/KEY_MANAGEMENT_QUICKSTART.md`

### Reports
- Test Results: `TEST_RESULTS_AND_STATUS.md`
- Implementation Report: `FINAL_IMPLEMENTATION_REPORT.md`
- Bug Fixes: `BUGS_AND_FIXES.md`

### Test Files
- Unit Tests: `backend/src/services/keyManagement/__tests__/run-tests.ts`
- Integration Tests: `backend/src/services/keyManagement/__tests__/integration-test.ts`

---

## 🎯 Quick Status Check

```bash
# One command to check everything
cd stellar-privacy-analytics/backend && \
echo "=== Running Unit Tests ===" && \
./node_modules/.bin/ts-node src/services/keyManagement/__tests__/run-tests.ts && \
echo "" && \
echo "=== Checking TypeScript Compilation ===" && \
npx tsc --noEmit && \
echo "✅ All checks passed!" || echo "❌ Some checks failed"
```

---

**Last Updated:** April 27, 2026  
**Status:** ✅ All Tests Passing  
**Version:** 1.0.0
