# Privacy Risk Assessment Tool

A comprehensive privacy risk assessment system that evaluates potential privacy risks in data processing workflows and suggests mitigation strategies. This tool provides automated risk scoring, compliance monitoring, and actionable insights for privacy professionals.

## 🌟 Features

### Core Functionality
- **Automated Risk Scoring**: Advanced algorithms calculate privacy risk scores based on multiple factors
- **Risk Category Classification**: Categorizes risks as Low, Medium, High, or Critical
- **Mitigation Strategy Recommendations**: AI-powered suggestions for risk reduction
- **Historical Risk Tracking**: Monitor risk trends over time
- **Compliance Framework Integration**: Built-in support for GDPR, CCPA, HIPAA, and more

### Visualization & Analytics
- **Risk Heat Maps**: Visual representation of privacy risks across workflows
- **Trend Analysis**: Interactive charts showing risk evolution
- **Compliance Dashboards**: Real-time compliance status monitoring
- **Executive Reports**: Comprehensive compliance and risk reports

### Advanced Features
- **Custom Risk Assessment Criteria**: Configurable scoring parameters
- **Batch Assessment**: Evaluate multiple workflows simultaneously
- **Real-time Alerts**: Immediate notification of critical risks
- **Audit Trail**: Complete audit logging for compliance

## 🏗️ Architecture

### Backend Components

#### Core Service: `PrivacyRiskAssessmentService`
Located at `backend/src/services/privacyRiskAssessment.ts`

**Key Features:**
- Multi-factor risk analysis
- Compliance framework evaluation
- Historical trend analysis
- Custom criteria support

**Risk Assessment Factors:**
1. **Data Sensitivity** (30% weight)
   - Personal Identifiable Information: 0.9
   - Special Category Data: 1.0
   - Financial Data: 0.8
   - Health Data: 0.95
   - Biometric Data: 1.0
   - Location Data: 0.7
   - Communication Data: 0.6
   - Behavioral Data: 0.5
   - Technical Data: 0.3
   - Anonymous Data: 0.1

2. **Processing Scope** (25% weight)
   - Collection: 0.6
   - Storage: 0.4
   - Processing: 0.8
   - Sharing: 0.9
   - Cross-border Transfer: 1.0
   - Automated Decision Making: 0.85
   - Profiling: 0.8

3. **Security Measures** (20% weight)
   - Encryption: -0.3
   - Pseudonymization: -0.2
   - Access Controls: -0.25
   - Audit Logging: -0.15
   - Data Minimization: -0.2
   - Privacy by Design: -0.3

4. **Compliance** (15% weight)
   - GDPR: 0.8
   - CCPA: 0.7
   - HIPAA: 0.9
   - PCI DSS: 0.6
   - SOX: 0.5

5. **Third-Party Risk** (10% weight)
   - Based on number and type of third parties

#### API Endpoints
Base URL: `/api/v1/risk-assessment`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/assess` | POST | Assess privacy risk for a workflow |
| `/workflow/:id/history` | GET | Get assessment history for a workflow |
| `/heatmap` | GET | Generate risk heat map data |
| `/criteria` | GET/PUT | Manage assessment criteria |
| `/dashboard` | GET | Get dashboard overview data |
| `/trends` | GET | Get risk trends analysis |
| `/batch` | POST | Batch assess multiple workflows |
| `/compliance-report` | GET | Generate compliance reports |

### Database Schema
The system uses PostgreSQL with the following key tables:

- **workflows**: Data workflow definitions
- **risk_assessments**: Assessment results and metadata
- **assessment_criteria**: Configurable scoring parameters
- **risk_mitigations**: Mitigation strategy tracking
- **compliance_frameworks**: Regulatory framework definitions
- **workflow_compliance**: Compliance status mapping
- **risk_trends**: Historical trend data
- **custom_risk_factors**: User-defined risk factors

### Frontend Components

#### Main Dashboard: `RiskAssessmentDashboard`
Located at `frontend/src/pages/RiskAssessmentDashboard.tsx`

**Features:**
- Overview with key metrics
- Risk heat map visualization
- Recent assessments list
- Mitigation strategies tracking

#### Assessment Form: `WorkflowAssessmentForm`
Located at `frontend/src/components/WorkflowAssessmentForm.tsx`

**Features:**
- Comprehensive workflow definition
- Data type selection
- Processing step configuration
- Security measures specification

#### Visualization Components
- **RiskHeatMap**: Interactive risk visualization
- **RiskTrendsChart**: Historical trend analysis
- **ComplianceReport**: Compliance status and reporting

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker & Docker Compose (optional)

### Installation

1. **Clone the Repository**
```bash
git clone https://github.com/frankosakwe/stellar-privacy-analytics.git
cd stellar-privacy-analytics
```

2. **Install Dependencies**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. **Database Setup**
```bash
# Run database migrations
cd backend
npm run migrate

# Seed initial data
npm run seed
```

4. **Environment Configuration**
```bash
# Copy environment template
cp .env.example .env

# Configure database and other settings
```

5. **Start the Application**
```bash
# Development mode
npm run dev

# Or using Docker Compose
docker-compose up -d
```

### Configuration

#### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/stellar_privacy
REDIS_URL=redis://localhost:6379

# API Configuration
API_PORT=3001
FRONTEND_URL=http://localhost:3000

# Risk Assessment
DEFAULT_RISK_THRESHOLD=0.7
ENABLE_CUSTOM_FACTORS=true
COMPLIANCE_FRAMEWORKS=gdpr,ccpa,hipaa

# Notifications
ENABLE_RISK_ALERTS=true
ALERT_EMAIL=admin@company.com
```

## 📊 Usage Examples

### Basic Risk Assessment

```typescript
// Define a workflow
const workflow = {
  id: 'customer-analytics',
  name: 'Customer Analytics Pipeline',
  description: 'Processing customer data for analytics',
  dataTypes: ['personal_identifiable_info', 'behavioral_data'],
  processingSteps: [
    {
      id: 'step1',
      name: 'Data Collection',
      type: 'collection',
      description: 'Collect customer data from various sources',
      dataAccess: ['customer_service', 'sales'],
      thirdParties: [],
      securityMeasures: ['encryption', 'access_controls'],
      retentionTime: 365
    }
  ],
  retentionPeriod: 365,
  dataSubjects: ['customers'],
  purposes: ['analytics', 'personalization'],
  legalBasis: 'consent',
  crossBorderTransfer: false,
  encryptionLevel: 'standard',
  anonymizationTechniques: ['pseudonymization', 'aggregation']
};

// Assess risk
const assessment = await riskAssessmentService.assessWorkflowRisk(workflow, 'assessor123');

console.log(`Risk Score: ${assessment.overallScore}`);
console.log(`Category: ${assessment.category}`);
console.log(`Recommendations: ${assessment.recommendations.join(', ')}`);
```

### API Usage

```bash
# Assess a workflow
curl -X POST http://localhost:3001/api/v1/risk-assessment/assess \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": { ... },
    "assessorId": "user123"
  }'

# Get risk heat map
curl http://localhost:3001/api/v1/risk-assessment/heatmap

# Get assessment history
curl http://localhost:3001/api/v1/risk-assessment/workflow/123/history

# Generate compliance report
curl http://localhost:3001/api/v1/risk-assessment/compliance-report?framework=gdpr
```

### Custom Risk Factors

```typescript
// Define custom risk factor
const customFactor = {
  id: 'industry_specific',
  name: 'Industry-Specific Risk',
  description: 'Risk factor specific to healthcare industry',
  weight: 0.15,
  evaluationFunction: 'evaluateHealthcareRisk',
  category: 'industry'
};

// Update assessment criteria
await riskAssessmentService.updateAssessmentCriteria({
  customFactors: [customFactor]
});
```

## 🔧 Advanced Configuration

### Custom Risk Assessment Criteria

You can customize the risk assessment algorithm by modifying the criteria:

```typescript
const customCriteria = {
  dataSensitivityWeights: {
    'health_data': 1.0,  // Higher weight for health data
    'financial_data': 0.9   // Increased weight for financial data
  },
  processingWeights: {
    'ai_processing': 0.9,   // Add new processing type
    'biometric_processing': 1.0
  },
  customFactors: [
    {
      id: 'data_volume',
      name: 'Data Volume Risk',
      description: 'Risk based on data volume',
      weight: 0.1,
      evaluationFunction: 'evaluateDataVolume',
      category: 'operational'
    }
  ]
};
```

### Compliance Framework Integration

Add new compliance frameworks:

```sql
INSERT INTO compliance_frameworks (name, version, description, requirements) VALUES
('LGPD', '2020', 'Lei Geral de Proteção de Dados', '[
  {
    "article": "Article 7",
    "title": "Lawfulness of processing",
    "description": "Processing of personal data must be based on legal grounds",
    "mandatory": true
  }
]');
```

## 📈 Monitoring & Analytics

### Risk Metrics Tracking

The system automatically tracks:
- Risk score trends over time
- Compliance status changes
- Mitigation strategy effectiveness
- Assessment completion rates

### Alert Configuration

Set up real-time alerts for:
- Critical risk thresholds
- Compliance failures
- Assessment due dates
- Trend anomalies

```typescript
// Configure alerts
const alertConfig = {
  criticalRiskThreshold: 0.8,
  complianceFailureThreshold: 0.7,
  enableEmailAlerts: true,
  enableSlackAlerts: true,
  alertRecipients: ['privacy@company.com', 'security@company.com']
};
```

## 🛡️ Security & Privacy

### Data Protection
- All assessment data encrypted at rest
- Secure API endpoints with authentication
- Audit logging for all operations
- Role-based access control

### Privacy Features
- Pseudonymization of sensitive data
- Data minimization principles
- Privacy by design architecture
- GDPR-compliant data handling

## 🧪 Testing

### Unit Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Integration Tests
```bash
# Run full integration test suite
npm run test:integration

# Test specific endpoints
npm run test:api
```

### Performance Testing
```bash
# Load testing for assessment endpoints
npm run test:performance

# Database performance tests
npm run test:db-performance
```

## 📚 API Reference

### Assessment Endpoints

#### POST /api/v1/risk-assessment/assess
Assesses privacy risk for a data workflow.

**Request Body:**
```json
{
  "workflow": {
    "id": "string",
    "name": "string",
    "description": "string",
    "dataTypes": ["string"],
    "processingSteps": [...],
    "retentionPeriod": "number",
    "dataSubjects": ["string"],
    "purposes": ["string"],
    "legalBasis": "string",
    "crossBorderTransfer": "boolean",
    "encryptionLevel": "none|basic|standard|advanced",
    "anonymizationTechniques": ["string"]
  },
  "assessorId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "workflowId": "string",
    "overallScore": 0.75,
    "category": "high",
    "riskFactors": [...],
    "mitigationStrategies": [...],
    "assessedAt": "2024-01-01T00:00:00Z",
    "assessorId": "string",
    "complianceFrameworks": [...],
    "recommendations": [...]
  }
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Conventional Commits for messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙋‍♂️ Support

- 📧 Email: support@stellar-ecosystem.com
- 💬 Discord: [Join our community](https://discord.gg/stellar)
- 📖 Documentation: [docs.stellar-ecosystem.com](https://docs.stellar-ecosystem.com)

## 🔗 Related Projects

- [Stellar Privacy Analytics](../README.md) - Main privacy analytics platform
- [Data Anonymization Tools](./DATA_ANONYMIZATION.md) - Privacy-preserving data processing
- [Compliance Management](./COMPLIANCE_MANAGEMENT.md) - Regulatory compliance tools

---

**Built with ❤️ for privacy-conscious organizations**
