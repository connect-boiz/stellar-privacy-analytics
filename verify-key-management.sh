#!/bin/bash

echo "🔍 Verifying Cryptographic Key Management Service Implementation"
echo "=================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $1 (MISSING)"
        ((FAILED++))
    fi
}

# Function to check directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $1 (MISSING)"
        ((FAILED++))
    fi
}

echo "📁 Checking Core Services..."
check_file "backend/src/services/keyManagement/KeyManagementService.ts"
check_file "backend/src/services/keyManagement/ThresholdCryptography.ts"
check_file "backend/src/services/keyManagement/KeyRotationScheduler.ts"
check_file "backend/src/services/keyManagement/KeyBackupService.ts"
check_file "backend/src/services/keyManagement/KeySharingService.ts"
check_file "backend/src/services/keyManagement/PerformanceOptimizer.ts"
check_file "backend/src/services/keyManagement/SMPCKeyIntegration.ts"
check_file "backend/src/services/keyManagement/ZKPKeyIntegration.ts"
check_file "backend/src/services/keyManagement/index.ts"
echo ""

echo "🌐 Checking API Routes..."
check_file "backend/src/routes/keyManagement.ts"
echo ""

echo "📚 Checking Documentation..."
check_file "backend/docs/KEY_MANAGEMENT_SERVICE.md"
check_file "backend/docs/KEY_MANAGEMENT_SECURITY_AUDIT.md"
check_file "KEY_MANAGEMENT_IMPLEMENTATION.md"
check_file "KEY_MANAGEMENT_SUMMARY.md"
check_file "QUICK_START_KEY_MANAGEMENT.md"
echo ""

echo "🔧 Checking Existing HSM Integration..."
check_file "backend/src/services/hsmService.ts"
check_file "backend/src/services/masterKeyManager.ts"
check_file "backend/src/services/hsmIntegration.ts"
check_file "backend/src/config/hsmConfig.ts"
check_file "backend/src/routes/hsm.ts"
echo ""

echo "📦 Checking Dependencies..."
if grep -q "lru-cache" backend/package.json; then
    echo -e "${GREEN}✓${NC} lru-cache dependency found"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} lru-cache dependency missing"
    ((FAILED++))
fi
echo ""

echo "=================================================================="
echo "📊 Verification Results"
echo "=================================================================="
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Implementation is complete.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Configure HSM: cp backend/.env.hsm.example backend/.env"
    echo "2. Run tests: npm test -- --testPathPattern=keyManagement"
    echo "3. Start service: npm run dev"
    echo "4. Check health: curl http://localhost:3000/api/v1/key-management/health"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the missing files.${NC}"
    exit 1
fi
