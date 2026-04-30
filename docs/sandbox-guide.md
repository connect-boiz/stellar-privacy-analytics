# Stellar Sandbox Environment Guide

## Overview

The Stellar Sandbox Environment provides developers with a comprehensive testing platform to integrate and test protocol features without using real money or affecting production data. The sandbox offers high-fidelity simulations of all Stellar protocol features including payments, subscriptions, grace periods, and dunning processes.

## Features

### 🏗️ Environment Isolation
- **Database Schema Isolation**: Sandbox data is completely isolated from production using prefixed database schemas
- **Network Separation**: Toggle between Mainnet, Testnet, and Sandbox environments
- **Redis Isolation**: Separate Redis keyspace for sandbox operations
- **Configuration Management**: Independent configuration for sandbox-specific features

### 💳 Mock Payment System
- **Zero-Value Tokens**: Test payment flows without real money
- **Failure Simulation**: Simulate various payment failure scenarios
- **Transaction Hash Generation**: Realistic mock transaction hashes
- **Event Emission**: Full webhook and indexer event simulation

### 🔄 Event Simulation
- **Subscription Billed Events**: Complete subscription lifecycle simulation
- **Grace Period Management**: Test grace period workflows
- **Dunning Process Simulation**: Multi-level dunning process testing
- **Webhook Delays**: Realistic notification timing simulation

### 🛠️ Developer Tools
- **Sandbox CLI**: Command-line interface for sandbox operations
- **Postman Collections**: Pre-configured API testing collections
- **Dashboard UI**: Web interface for sandbox management
- **Enhanced Logging**: Detailed logging for debugging

## Quick Start

### 1. Enable Sandbox Mode

```bash
# Using the CLI
npx ts-node scripts/sandbox-cli.ts enable

# Or via API
curl -X POST http://localhost:3001/api/v1/sandbox/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 2. Switch to Testnet Environment

```bash
# Using the CLI
npx ts-node scripts/sandbox-cli.ts env testnet

# Or via API
curl -X POST http://localhost:3001/api/v1/sandbox/environment \
  -H "Content-Type: application/json" \
  -d '{"environment": "testnet"}'
```

### 3. Create Your First Mock Payment

```bash
# Using the CLI
npx ts-node scripts/sandbox-cli.ts payment \
  --subscription 123e4567-e89b-12d3-a456-426614174000 \
  --amount 10.00 \
  --currency USD

# Or via API
curl -X POST http://localhost:3001/api/v1/sandbox/mock-payment \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 10.00,
    "currency": "USD",
    "shouldFail": false
  }'
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Sandbox Environment Configuration
SANDBOX_ENABLED=true
STELLAR_ENVIRONMENT=testnet

# Stellar Network URLs
STELLAR_MAINNET_RPC_URL=https://soroban-mainnet.stellar.org
STELLAR_MAINNET_PASSPHRASE=Public Global Stellar Network ; September 2015
STELLAR_MAINNET_HORIZON_URL=https://horizon.stellar.org

STELLAR_TESTNET_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_TESTNET_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_TESTNET_HORIZON_URL=https://horizon-testnet.stellar.org

STELLAR_SANDBOX_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_SANDBOX_PASSPHRASE=Test SDF Network ; September 2015
STELLAR_SANDBOX_HORIZON_URL=https://horizon-testnet.stellar.org
```

### Database Setup

The sandbox automatically creates isolated database schemas:

```bash
# Initialize sandbox database (automatic when sandbox is enabled)
npm run sandbox:init

# Or manually
npm run migrate:sandbox
npm run seed:sandbox
```

## API Reference

### Sandbox Management

#### Get Sandbox Status
```http
GET /api/v1/sandbox/status
```

#### Get Sandbox Configuration
```http
GET /api/v1/sandbox/config
```

#### Toggle Sandbox Mode
```http
POST /api/v1/sandbox/toggle
Content-Type: application/json

{
  "enabled": true
}
```

#### Switch Environment
```http
POST /api/v1/sandbox/environment
Content-Type: application/json

{
  "environment": "testnet"  // mainnet | testnet | sandbox
}
```

### Mock Payments

#### Create Mock Payment
```http
POST /api/v1/sandbox/mock-payment
Content-Type: application/json

{
  "subscriptionId": "uuid",
  "amount": 10.00,
  "currency": "USD",
  "customerId": "uuid",
  "shouldFail": false,
  "failureType": "insufficient_funds"  // optional
}
```

#### Get Mock Payment History
```http
GET /api/v1/sandbox/mock-payments?limit=10&offset=0&subscriptionId=uuid
```

### Event Simulation

#### Simulate Subscription Billed
```http
POST /api/v1/sandbox/mock-subscription-billed
Content-Type: application/json

{
  "subscriptionId": "uuid",
  "amount": 10.00,
  "currency": "USD",
  "billingPeriodStart": "2024-01-01T00:00:00.000Z",
  "billingPeriodEnd": "2024-01-31T23:59:59.999Z",
  "paymentStatus": "success"  // success | failed | pending
}
```

#### Simulate Grace Period
```http
POST /api/v1/sandbox/mock-grace-period
Content-Type: application/json

{
  "subscriptionId": "uuid",
  "gracePeriodDays": 7,
  "reason": "Payment failure"
}
```

#### Simulate Dunning Process
```http
POST /api/v1/sandbox/mock-dunning
Content-Type: application/json

{
  "subscriptionId": "uuid",
  "dunningLevel": 1,  // 1-5
  "contactMethod": "email",  // email | sms | push | webhook
  "message": "Payment reminder"
}
```

## CLI Commands

### Basic Commands

```bash
# Check sandbox status
npx ts-node scripts/sandbox-cli.ts status

# Enable/disable sandbox
npx ts-node scripts/sandbox-cli.ts enable
npx ts-node scripts/sandbox-cli.ts disable

# Switch environments
npx ts-node scripts/sandbox-cli.ts env testnet
npx ts-node scripts/sandbox-cli.ts env mainnet
npx ts-node scripts/sandbox-cli.ts env sandbox
```

### Payment Operations

```bash
# Create mock payment
npx ts-node scripts/sandbox-cli.ts payment \
  --subscription 123e4567-e89b-12d3-a456-426614174000 \
  --amount 10.00 \
  --currency USD

# Create failed payment
npx ts-node scripts/sandbox-cli.ts payment \
  --subscription 123e4567-e89b-12d3-a456-426614174000 \
  --amount 10.00 \
  --fail \
  --failure-type insufficient_funds

# List mock payments
npx ts-node scripts/sandbox-cli.ts payments --limit 10
npx ts-node scripts/sandbox-cli.ts payments --subscription 123e4567-e89b-12d3-a456-426614174000
```

### Event Simulation

```bash
# Simulate subscription billed event
npx ts-node scripts/sandbox-cli.ts event billed \
  --subscription 123e4567-e89b-12d3-a456-426614174000

# Simulate grace period
npx ts-node scripts/sandbox-cli.ts event grace-period \
  --subscription 123e4567-e89b-12d3-a456-426614174000

# Simulate dunning process
npx ts-node scripts/sandbox-cli.ts event dunning \
  --subscription 123e4567-e89b-12d3-a456-426614174000
```

### Utility Commands

```bash
# Initialize sandbox environment
npx ts-node scripts/sandbox-cli.ts init

# Show configuration
npx ts-node scripts/sandbox-cli.ts config

# Clean sandbox data
npx ts-node scripts/sandbox-cli.ts clean
npx ts-node scripts/sandbox-cli.ts clean --subscription 123e4567-e89b-12d3-a456-426614174000
```

## Testing Workflows

### Complete Payment Success Workflow

1. **Enable Sandbox**
   ```bash
   npx ts-node scripts/sandbox-cli.ts enable
   ```

2. **Switch to Testnet**
   ```bash
   npx ts-node scripts/sandbox-cli.ts env testnet
   ```

3. **Create Mock Payment**
   ```bash
   npx ts-node scripts/sandbox-cli.ts payment \
     --subscription 123e4567-e89b-12d3-a456-426614174000 \
     --amount 10.00
   ```

4. **Verify Payment**
   ```bash
   npx ts-node scripts/sandbox-cli.ts payments \
     --subscription 123e4567-e89b-12d3-a456-426614174000
   ```

### Payment Failure and Recovery Workflow

1. **Create Failed Payment**
   ```bash
   npx ts-node scripts/sandbox-cli.ts payment \
     --subscription 123e4567-e89b-12d3-a456-426614174000 \
     --amount 10.00 \
     --fail \
     --failure-type insufficient_funds
   ```

2. **Simulate Grace Period**
   ```bash
   npx ts-node scripts/sandbox-cli.ts event grace-period \
     --subscription 123e4567-e89b-12d3-a456-426614174000
   ```

3. **Start Dunning Process**
   ```bash
   npx ts-node scripts/sandbox-cli.ts event dunning \
     --subscription 123e4567-e89b-12d3-a456-426614174000
   ```

4. **Create Recovery Payment**
   ```bash
   npx ts-node scripts/sandbox-cli.ts payment \
     --subscription 123e4567-e89b-12d3-a456-426614174000 \
     --amount 10.00
   ```

## Failure Simulation Types

The sandbox supports various failure scenarios:

### Payment Failures
- **insufficient_funds**: Account lacks sufficient balance
- **network_error**: Stellar network connectivity issues
- **timeout**: Transaction processing timeout
- **invalid_signature**: Invalid transaction signature

### Dunning Levels
- **Level 1**: Friendly reminder
- **Level 2**: Payment overdue notice
- **Level 3**: Urgent suspension warning
- **Level 4**: Final notice (24 hours)
- **Level 5**: Account terminated

## Webhook Integration

The sandbox emits realistic webhook events:

### Subscription Billed Events
```json
{
  "eventType": "SubscriptionBilled",
  "data": {
    "eventId": "uuid",
    "subscriptionId": "uuid",
    "amount": 10.00,
    "currency": "USD",
    "paymentStatus": "success",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "metadata": {
      "environment": "sandbox",
      "mockData": true
    }
  }
}
```

### Grace Period Events
```json
{
  "eventType": "GracePeriodStarted",
  "data": {
    "gracePeriodId": "uuid",
    "subscriptionId": "uuid",
    "gracePeriodDays": 7,
    "startDate": "2024-01-15T10:30:00.000Z",
    "endDate": "2024-01-22T10:30:00.000Z"
  }
}
```

## Best Practices

### Development Workflow
1. Always start with `sandbox-cli init` to set up the environment
2. Use testnet for realistic blockchain interactions
3. Test both success and failure scenarios
4. Verify webhook integrations with mock events
5. Clean up test data between test runs

### Data Management
- Use unique subscription IDs for each test
- Clean sandbox data regularly to avoid conflicts
- Monitor Redis memory usage during extensive testing
- Use database transactions for complex test scenarios

### Security Considerations
- Never enable sandbox mode in production
- Use environment-specific configuration files
- Validate all webhook payloads in your integration
- Implement proper authentication for sandbox endpoints

## Troubleshooting

### Common Issues

**Sandbox mode not working**
- Check that `SANDBOX_ENABLED=true` is set
- Verify Redis connection
- Check database schema creation

**Mock payments not appearing**
- Ensure sandbox mode is enabled
- Check Redis key expiration
- Verify webhook endpoint configuration

**Environment switching fails**
- Check network connectivity to Stellar RPC
- Verify environment variables are set
- Restart the application after changes

### Debug Mode

Enable enhanced logging:

```env
LOG_LEVEL=debug
SANDBOX_ENABLED=true
```

This provides detailed logs for:
- Database queries
- API requests/responses
- Stellar network interactions
- Webhook emissions

## Integration Examples

### Node.js Integration

```javascript
const axios = require('axios');

class StellarSandboxClient {
  constructor(baseUrl = 'http://localhost:3001/api/v1') {
    this.baseUrl = baseUrl;
  }

  async enableSandbox() {
    const response = await axios.post(`${this.baseUrl}/sandbox/toggle`, {
      enabled: true
    });
    return response.data;
  }

  async createMockPayment(subscriptionId, amount, currency = 'USD') {
    const response = await axios.post(`${this.baseUrl}/sandbox/mock-payment`, {
      subscriptionId,
      amount,
      currency,
      shouldFail: false
    });
    return response.data;
  }

  async simulateFailure(subscriptionId, amount, failureType) {
    const response = await axios.post(`${this.baseUrl}/sandbox/mock-payment`, {
      subscriptionId,
      amount,
      currency: 'USD',
      shouldFail: true,
      failureType
    });
    return response.data;
  }
}

// Usage
const client = new StellarSandboxClient();
await client.enableSandbox();
await client.createMockPayment('123e4567-e89b-12d3-a456-426614174000', 10.00);
```

### Python Integration

```python
import requests

class StellarSandboxClient:
    def __init__(self, base_url='http://localhost:3001/api/v1'):
        self.base_url = base_url

    def enable_sandbox(self):
        response = requests.post(
            f'{self.base_url}/sandbox/toggle',
            json={'enabled': True}
        )
        return response.json()

    def create_mock_payment(self, subscription_id, amount, currency='USD'):
        response = requests.post(
            f'{self.base_url}/sandbox/mock-payment',
            json={
                'subscriptionId': subscription_id,
                'amount': amount,
                'currency': currency,
                'shouldFail': False
            }
        )
        return response.json()

# Usage
client = StellarSandboxClient()
client.enable_sandbox()
client.create_mock_payment('123e4567-e89b-12d3-a456-426614174000', 10.00)
```

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the API documentation
- Examine the server logs with debug mode enabled
- Contact the development team with detailed error information

---

**Note**: The sandbox environment is designed for development and testing only. Never use sandbox credentials or configurations in production deployments.
