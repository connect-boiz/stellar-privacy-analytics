# No-Code Query Constructor

A comprehensive drag-and-drop interface for building complex privacy-preserved queries without writing code.

## Overview

The No-Code Query Constructor enables non-technical users to build sophisticated privacy-preserving analytics queries through an intuitive visual interface. Built with React and integrated with Stellar blockchain for transaction signing, it provides a seamless experience for data analysis while maintaining complete privacy protection.

## Features

### 🎯 Core Functionality

- **Drag-and-Drop Interface**: Intuitive query building with visual components
- **Real-time Validation**: Instant feedback on query logic and structure
- **Privacy Cost Estimation**: Live calculation of privacy budget consumption
- **Aggregate Functions**: Support for Count, Sum, Average, Median, Min, Max, Standard Deviation
- **Filter Operations**: Equals, Not Equals, Greater/Less Than, Contains, In List
- **Group By**: Data segmentation and categorization
- **Favorite Queries**: Save and reload commonly used queries

### 🔐 Privacy Features

- **Differential Privacy**: Automatic noise injection for individual privacy
- **Privacy Budget Tracking**: Real-time monitoring of privacy cost
- **Risk Assessment**: Visual indicators for privacy risk levels
- **Audit Trail**: Complete logging for compliance requirements

### 💳 Wallet Integration

- **Freight Wallet**: Desktop wallet support
- **Albedo**: Browser extension integration
- **Transaction Signing**: Secure query execution authorization
- **Balance Checking**: Ensure sufficient funds for operations

## User Interface

### Main Components

1. **Data Fields Panel**: Available data fields with types and descriptions
2. **Query Builder**: Visual construction area with drag-and-drop steps
3. **Wallet Connect**: Integration panel for Stellar wallets
4. **Preview Modal**: Privacy analysis and execution plan
5. **Favorites Section**: Saved query templates

### Query Steps

Users can build queries using four types of steps:

#### Select Steps
- Choose data fields to include in results
- Support for all field types (string, number, date, boolean)

#### Filter Steps
- Apply conditions to filter data
- Multiple operators: equals, not equals, greater than, less than, contains, in list
- Type-aware operator selection

#### Aggregate Steps
- Perform calculations on numeric fields
- Functions: Count, Sum, Average, Median, Min, Max, Standard Deviation
- Can be combined with Group By for segmented analysis

#### Group By Steps
- Categorize data by field values
- Essential for segmented analytics
- Works seamlessly with aggregate functions

## Privacy Cost Model

### Cost Calculation

Each query step contributes to the total privacy cost:

- **Select**: 0.1 privacy units
- **Filter**: 0.2 privacy units
- **Aggregate**: 0.5 privacy units
- **Group By**: 0.3 privacy units

### Risk Levels

- **Low** (0-2 units): Minimal privacy impact
- **Medium** (2-5 units): Moderate privacy considerations
- **High** (5-10 units): Significant privacy impact, requires careful review

### Differential Privacy

- **ε (epsilon)**: Privacy parameter calculated as cost × 0.1
- **Noise Mechanism**: Laplace or Gaussian noise injection
- **Sample Size**: Minimum thresholds for statistical validity

## API Integration

### Backend Endpoints

#### Schema Information
```
GET /api/v1/query/schema
```
Returns available data fields, types, and descriptions.

#### Query Validation
```
POST /api/v1/query/validate
```
Validates query structure and logic.
- Request: `{ query: { steps: [...] } }`
- Response: `{ valid: boolean, errors: string[] }`

#### Privacy Cost Calculation
```
POST /api/v1/query/privacy-cost
```
Calculates privacy cost and risk assessment.
- Request: `{ query: { steps: [...] } }`
- Response: `{ cost: number, riskLevel: string, epsilon: string }`

#### Query Execution
```
POST /api/v1/query/execute
```
Executes privacy-preserved query.
- Request: `{ query: {...}, walletSignature: string }`
- Response: `{ success: boolean, results: {...}, privacyMetrics: {...} }`

#### Favorite Queries
```
GET /api/v1/query/favorites
POST /api/v1/query/favorites
```
Manage saved query templates.

## Technical Implementation

### Frontend Components

#### QueryConstructor.tsx
Main component implementing:
- Drag-and-drop functionality
- Real-time validation
- Privacy cost calculation
- Query step management
- Preview modal

#### WalletConnect.tsx
Wallet integration component:
- Freight wallet detection and connection
- Albedo browser extension support
- Transaction signing
- Balance verification

### Backend Services

#### Query Routes
Express.js endpoints for:
- Schema management
- Query validation
- Privacy cost calculation
- Query execution with differential privacy
- Favorite query persistence

### Data Flow

1. **User Interaction**: Drag-and-drop query building
2. **Real-time Validation**: Client-side validation with server confirmation
3. **Privacy Analysis**: Cost calculation and risk assessment
4. **Wallet Authorization**: Transaction signing for query execution
5. **Query Execution**: Server-side processing with differential privacy
6. **Results Delivery**: Privacy-preserved results with metadata

## Security Considerations

### Privacy Protection

- **Data Minimization**: Only necessary data is processed
- **Noise Injection**: Differential privacy ensures individual protection
- **Aggregation**: Results are always aggregated, never individual records
- **Audit Logging**: Complete traceability for compliance

### Wallet Security

- **Secure Signing**: Transactions signed locally, never transmitted
- **Network Isolation**: Testnet separation from mainnet
- **Balance Protection**: Minimum balance requirements enforced
- **Transaction Limits**: Cost caps prevent excessive spending

## Usage Examples

### Example 1: High Value Transactions

1. **Select**: transaction_amount
2. **Filter**: transaction_amount > 500
3. **Aggregate**: SUM of transaction_amount
4. **Execute**: Requires wallet signature

**Privacy Cost**: 0.8 units (Low Risk)

### Example 2: User Type Analysis

1. **Select**: user_type, transaction_amount
2. **Group By**: user_type
3. **Aggregate**: AVERAGE of transaction_amount
4. **Execute**: Requires wallet signature

**Privacy Cost**: 0.9 units (Low Risk)

### Example 3: Complex Segmentation

1. **Select**: user_type, is_active, transaction_amount
2. **Filter**: is_active = true
3. **Group By**: user_type
4. **Aggregate**: COUNT, SUM of transaction_amount
5. **Execute**: Requires wallet signature

**Privacy Cost**: 1.1 units (Low Risk)

## Development Setup

### Prerequisites

- Node.js 18+
- React 18+
- Express.js
- Stellar SDK
- TypeScript

### Installation

```bash
# Frontend dependencies
cd frontend
npm install

# Backend dependencies
cd backend
npm install
```

### Configuration

Environment variables:
```env
# Stellar Network
STELLAR_NETWORK=testnet
FREIGHT_APP_NAME=Stellar Privacy Analytics

# Privacy Settings
DEFAULT_PRIVACY_BUDGET=10
MAX_PRIVACY_COST=10

# API Configuration
API_PORT=3001
FRONTEND_URL=http://localhost:3000
```

### Testing

```bash
# Run frontend tests
cd frontend
npm test

# Run backend tests
cd backend
npm test

# Integration tests
npm run test:integration
```

## Future Enhancements

### Planned Features

1. **Advanced Visualizations**: Built-in chart generation
2. **Query Templates**: Pre-built query patterns
3. **Collaboration**: Shared queries and results
4. **Export Options**: Multiple format support (CSV, JSON, PDF)
5. **Mobile Support**: Responsive design optimization
6. **Voice Commands**: Natural language query building

### Technical Improvements

1. **Performance**: Query optimization and caching
2. **Scalability**: Distributed query processing
3. **Security**: Enhanced wallet integration
4. **Analytics**: Usage metrics and insights
5. **Monitoring**: Real-time system health

## Contributing

### Development Guidelines

1. Follow TypeScript best practices
2. Maintain privacy-first design principles
3. Include comprehensive tests
4. Document all public APIs
5. Ensure accessibility compliance

### Pull Request Process

1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Update documentation
5. Submit pull request with description

## Support

### Documentation

- [API Reference](./api.md)
- [Privacy Guide](./privacy.md)
- [Wallet Integration](./wallets.md)
- [Troubleshooting](./troubleshooting.md)

### Community

- GitHub Issues: Report bugs and request features
- Discord: Real-time discussion and support
- Documentation: Comprehensive guides and tutorials

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

**Built with ❤️ for privacy-conscious organizations**
