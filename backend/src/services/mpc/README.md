# Secure Multi-Party Computation (MPC) Implementation

This directory contains the implementation of a Secure Multi-Party Computation (MPC) node for the Stellar Privacy Analytics ecosystem. The implementation allows collaborative analytics between two or more organizations without sharing raw data.

## Architecture Overview

The MPC system consists of several key components:

### Core Components

1. **Shamir's Secret Sharing** (`shamir-secret-sharing.ts`)
   - Implements Shamir's Secret Sharing protocol for splitting secrets into shares
   - Supports threshold-based reconstruction
   - Includes basic arithmetic operations on secret shares

2. **Secure Transport** (`secure-transport.ts`)
   - Provides secure communication between MPC nodes
   - Simulates TLS 1.3 tunnel with encryption
   - Handles message routing and connection management

3. **MPC Node** (`mpc-node.ts`)
   - Main MPC node implementation for secure computations.
   - `Orchestrator.ts`: SMPC Orchestrator for coordinating multi-party sessions and protocol selection.
   - `secure-transport.ts`: E2EE communication channels between participants.
   - Handles share distribution and reconstruction

4. **Synchronization Worker** (`sync-worker.ts`)
   - Coordinates multi-party computation across nodes
   - Manages compute and reveal phases
   - Handles message routing and event coordination

5. **Heartbeat Monitor** (`heartbeat-monitor.ts`)
   - Ensures all parties stay online during computation
   - Monitors participant health and connectivity
   - Provides timeout detection and warnings

6. **Timeout Policy** (`timeout-policy.ts`)
   - Implements timeout policies for non-responsive participants
   - Supports retry mechanisms and failure handling
   - Configurable timeout thresholds per operation

7. **Stellar Logger** (`stellar-logger.ts`)
   - Logs session metadata to Stellar blockchain
   - Ensures auditability without exposing raw data
   - Provides transaction verification capabilities

## Features

### ✅ Implemented Features

- **Shamir's Secret Sharing Protocol**: Threshold-based secret splitting and reconstruction
- **Secure Communication**: Encrypted message transport between nodes
- **Session Management**: Complete lifecycle management of MPC sessions
- **Arithmetic Operations**: SUM and AVG operations on secret shares
- **Heartbeat Monitoring**: Real-time participant health monitoring
- **Timeout Policies**: Configurable timeout handling with retry mechanisms
- **Blockchain Logging**: Session metadata logging to Stellar blockchain
- **REST API**: Complete API for MPC operations

### 🔐 Security Features

- **Zero-Knowledge Processing**: Raw data never exposed to other parties
- **Threshold Security**: Requires minimum participants for reconstruction
- **Secure Transport**: Encrypted communication channels
- **Audit Trail**: Immutable blockchain records of session metadata
- **Timeout Protection**: Automatic handling of non-responsive participants

## API Endpoints

### Session Management

- `POST /api/v1/mpc/session/init` - Initialize new MPC session
- `POST /api/v1/mpc/session/:sessionId/join` - Join existing session
- `GET /api/v1/mpc/session/:sessionId` - Get session information
- `GET /api/v1/mpc/sessions` - Get all sessions
- `DELETE /api/v1/mpc/session/:sessionId` - Cancel session

### Data Processing

- `POST /api/v1/mpc/session/:sessionId/data` - Submit data for computation

### Node Management

- `POST /api/v1/mpc/connect` - Connect to another MPC node
- `GET /api/v1/mpc/nodes` - Get connected nodes
- `POST /api/v1/mpc/heartbeat` - Send heartbeat

### Monitoring

- `GET /api/v1/mpc/status` - Get system status

### Blockchain

- `GET /api/v1/mpc/transaction/:transactionId` - Get Stellar transaction details

### Operations

- `POST /api/v1/mpc/cleanup` - Cleanup resources

## Usage Examples

### Initialize an MPC Session

```bash
curl -X POST http://localhost:3001/api/v1/mpc/session/init \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "participants": ["node-1", "node-2", "node-3"],
    "operation": "SUM",
    "threshold": 2
  }'
```

### Join a Session

```bash
curl -X POST http://localhost:3001/api/v1/mpc/session/session-123/join \
  -H "Content-Type: application/json" \
  -d '{
    "initiatorId": "node-1"
  }'
```

### Submit Data for Computation

```bash
curl -X POST http://localhost:3001/api/v1/mpc/session/session-123/data \
  -H "Content-Type: application/json" \
  -d '{
    "data": "42"
  }'
```

### Connect to Another Node

```bash
curl -X POST http://localhost:3001/api/v1/mpc/connect \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "node-2",
    "address": "192.168.1.100",
    "port": 8080
  }'
```

## Configuration

Environment variables for MPC configuration:

```env
# MPC Node Configuration
MPC_NODE_ID=node-1
MPC_THRESHOLD=2
MPC_TOTAL_SHARES=3

# Stellar Configuration
STELLAR_SERVER=https://horizon-testnet.stellar.org
STELLAR_NETWORK=Test SDF Network ; September 2015
STELLAR_LOGGING=true
```

## Security Considerations

### Data Privacy

- Raw data is never transmitted between nodes
- Only secret shares are distributed
- Computations performed on encrypted shares
- Results reconstructed only when threshold is met

### Network Security

- All inter-node communication is encrypted
- TLS 1.3 simulation for secure transport
- Certificate-based node authentication (in production)

### Audit Trail

- All session metadata logged to Stellar blockchain
- Immutable audit trail of all operations
- No sensitive data stored on blockchain

### Fault Tolerance

- Configurable timeout policies
- Automatic retry mechanisms
- Graceful handling of node failures
- Session recovery capabilities

## Implementation Details

### Shamir's Secret Sharing

The implementation uses a large prime number (2^255 - 19) for polynomial operations over a finite field. The secret is encoded as the constant term of a random polynomial, and shares are generated by evaluating the polynomial at different points.

### Arithmetic Operations

Basic arithmetic operations are performed on secret shares using homomorphic properties:

- **Addition**: Shares can be added component-wise
- **Multiplication by Constants**: Each share can be multiplied by a known constant
- **Average**: Combination of addition and multiplication operations

### Session Lifecycle

1. **Initialization**: Session created with participants and operation
2. **Join Phase**: Participants join and acknowledge session
3. **Sharing Phase**: Data is split into secret shares and distributed
4. **Computation Phase**: Secure computation performed on shares
5. **Reveal Phase**: Results reconstructed and revealed to participants
6. **Completion**: Session finalized and metadata logged

## Testing

The implementation includes comprehensive error handling and logging for debugging. All components emit events for monitoring and testing purposes.

## Future Enhancements

### Planned Features

- **SPDZ Protocol Implementation**: More advanced MPC protocol
- **Complex Operations**: Support for more sophisticated computations
- **Dynamic Thresholds**: Adaptive threshold adjustment
- **Performance Optimization**: Parallel computation and caching
- **Production TLS**: Real TLS 1.3 implementation with certificates

### Scaling Considerations

- **Horizontal Scaling**: Support for many concurrent sessions
- **Load Balancing**: Distributed computation across nodes
- **Resource Management**: Memory and computation optimization
- **Network Optimization**: Efficient message batching

## Dependencies

The implementation uses minimal external dependencies:

- `jsbn`: Big integer arithmetic for cryptographic operations
- Node.js built-in modules for networking and cryptography

All other functionality is implemented from scratch to ensure security and transparency.

## License

This MPC implementation is part of the Stellar Privacy Analytics ecosystem and is licensed under the MIT License.
