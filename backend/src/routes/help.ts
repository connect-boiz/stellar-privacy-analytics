import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Help documentation data
const helpCategories = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics of Stellar Privacy Analytics',
    icon: '🚀',
    articles: [
      {
        id: 'overview',
        title: 'Platform Overview',
        content: `
# Stellar Privacy Analytics Overview

Stellar Privacy Analytics is a privacy-first analytics platform designed for the Stellar ecosystem. Our platform enables you to perform sophisticated data analysis while maintaining complete privacy through differential privacy techniques.

## Key Features

- **🔐 Privacy-First Design**: All queries are processed with differential privacy to protect individual data points
- **📊 Advanced Analytics**: Complex queries with aggregations, filtering, and statistical analysis
- **⚡ Real-Time Processing**: Get results in seconds, not hours
- **🛡️ Enterprise Security**: Bank-grade encryption and audit logging
- **📈 Privacy Budget Management**: Track and manage your privacy budget usage

## How It Works

1. **Authentication**: Secure JWT-based authentication with role-based access control
2. **Query Building**: Create privacy-preserving queries using our intuitive query builder
3. **Privacy Cost Calculation**: See the privacy cost before executing queries
4. **Noise Injection**: Automatic noise addition to protect individual privacy
5. **Results**: Get statistically accurate results without compromising privacy

## Privacy Budget

Each query consumes privacy budget measured in epsilon (ε). Think of it as a privacy currency:
- **Low cost queries** (ε < 1): Simple aggregations and counts
- **Medium cost queries** (1 ≤ ε < 5): Complex aggregations with multiple dimensions
- **High cost queries** (ε ≥ 5): Detailed analysis with multiple joins

Your account has a daily privacy budget limit based on your subscription tier.
        `,
        category: 'getting-started',
        difficulty: 'beginner',
        readTime: '5 min'
      },
      {
        id: 'first-query',
        title: 'Your First Query',
        content: `
# Creating Your First Privacy Query

Let's walk through creating your first privacy-preserving query step by step.

## Step 1: Select Your Data Fields

Start by choosing the fields you want to analyze:

\`\`\`json
{
  "steps": [
    {
      "type": "select",
      "field": "transaction_amount"
    }
  ]
}
\`\`\`

## Step 2: Add Filters (Optional)

Filter your data to focus on specific subsets:

\`\`\`json
{
  "steps": [
    {
      "type": "select",
      "field": "transaction_amount"
    },
    {
      "type": "filter",
      "field": "transaction_amount",
      "operator": "gt",
      "value": 100
    }
  ]
}
\`\`\`

### Available Filter Operators
- **eq**: Equals
- **gt**: Greater than
- **lt**: Less than
- **gte**: Greater than or equal to
- **lte**: Less than or equal to
- **contains**: Contains (for text fields)
- **in**: In list (for categorical fields)

## Step 3: Add Aggregations

Perform statistical analysis on your filtered data:

\`\`\`json
{
  "steps": [
    {
      "type": "select",
      "field": "transaction_amount"
    },
    {
      "type": "filter",
      "field": "transaction_amount",
      "operator": "gt",
      "value": 100
    },
    {
      "type": "aggregate",
      "field": "transaction_amount",
      "aggregation": "average"
    }
  ]
}
\`\`\`

### Available Aggregations
- **count**: Count of records
- **sum**: Sum of values
- **average**: Average (mean) of values
- **min**: Minimum value
- **max**: Maximum value

## Step 4: Group By (Optional)

Group your results by categorical fields:

\`\`\`json
{
  "steps": [
    {
      "type": "select",
      "field": "transaction_amount"
    },
    {
      "type": "select",
      "field": "user_type"
    },
    {
      "type": "group",
      "field": "user_type"
    },
    {
      "type": "aggregate",
      "field": "transaction_amount",
      "aggregation": "average"
    }
  ]
}
\`\`\`

## Step 5: Execute Your Query

Send your query to the execute endpoint:

\`\`\`bash
curl -X POST https://api.stellar-privacy.com/v1/query/execute \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": {
      "steps": [
        {
          "type": "select",
          "field": "transaction_amount"
        },
        {
          "type": "filter",
          "field": "transaction_amount",
          "operator": "gt",
          "value": 100
        },
        {
          "type": "aggregate",
          "field": "transaction_amount",
          "aggregation": "average"
        }
      ]
    }
  }'
\`\`\`

## Understanding the Results

Your response will include:

- **Results**: The query results with added privacy noise
- **Privacy Metrics**: Information about privacy cost and protection
- **Execution Time**: How long the query took to process

Example response:
\`\`\`json
{
  "success": true,
  "results": {
    "data": [
      {
        "transaction_amount_avg": 245.67
      }
    ]
  },
  "privacyMetrics": {
    "cost": 1.2,
    "epsilon": "0.12",
    "riskLevel": "low",
    "noiseAdded": true,
    "anonymizationStrength": 0.85
  },
  "executionTime": 1234
}
\`\`\`

## Best Practices

1. **Start Simple**: Begin with basic queries before adding complexity
2. **Check Privacy Cost**: Always review the privacy cost before execution
3. **Use Filters**: Filter data early to reduce privacy cost
4. **Save Favorites**: Save frequently used queries for easy access
5. **Monitor Budget**: Keep track of your daily privacy budget usage
        `,
        category: 'getting-started',
        difficulty: 'beginner',
        readTime: '8 min'
      }
    ]
  },
  {
    id: 'privacy-concepts',
    title: 'Privacy Concepts',
    description: 'Understanding differential privacy and privacy budget',
    icon: '🔒',
    articles: [
      {
        id: 'differential-privacy',
        title: 'Differential Privacy Explained',
        content: `
# Differential Privacy Explained

Differential privacy is a mathematical framework for quantifying and managing the privacy loss that results from data analysis.

## What is Differential Privacy?

Differential privacy ensures that the inclusion or exclusion of any single individual's data does not significantly affect the outcome of a statistical query. This is achieved by adding carefully calibrated statistical noise to query results.

## The Privacy Budget (ε)

The privacy budget, measured in epsilon (ε), quantifies the privacy loss:

- **ε = 0.1**: Very high privacy protection, significant noise
- **ε = 1.0**: Standard privacy protection, moderate noise
- **ε = 10.0**: Lower privacy protection, minimal noise

## How Noise is Added

We use the Laplace mechanism for noise addition:

\`\`\`
noise = Laplace(0, sensitivity/ε)
result = true_result + noise
\`\`\`

Where:
- **sensitivity**: Maximum change in query result from one individual
- **ε**: Privacy parameter (lower = more privacy)

## Privacy Composition

The total privacy cost is the sum of individual query costs:

- Query 1: ε = 0.5
- Query 2: ε = 0.3
- **Total**: ε = 0.8

## Why It Matters

1. **Formal Guarantees**: Mathematical proof of privacy protection
2. **Quantifiable**: Precise measurement of privacy loss
3. **Composable**: Privacy costs add up predictably
4. **Regulatory**: Meets modern privacy regulations (GDPR, CCPA)

## Real-World Impact

Without differential privacy:
- Exact average: \$234.56
- Potential re-identification: Possible

With differential privacy (ε = 1.0):
- Noisy average: \$235.12 ± \$2.34
- Potential re-identification: Mathematically impossible

## Best Practices

1. **Minimize ε**: Use the smallest epsilon that meets your needs
2. **Batch Queries**: Combine multiple questions into single queries
3. **Early Filtering**: Apply filters before aggregations
4. **Monitor Usage**: Track your privacy budget consumption
        `,
        category: 'privacy-concepts',
        difficulty: 'intermediate',
        readTime: '10 min'
      },
      {
        id: 'privacy-budget',
        title: 'Managing Your Privacy Budget',
        content: `
# Privacy Budget Management

Your privacy budget is a daily allocation of epsilon (ε) that determines how much privacy-preserving analysis you can perform.

## Budget Tiers

### Basic Tier
- **Daily Budget**: ε = 5.0
- **Reset Time**: Every 24 hours
- **Best for**: Simple counts and basic aggregations

### Premium Tier
- **Daily Budget**: ε = 20.0
- **Reset Time**: Every 24 hours
- **Best for**: Complex multi-dimensional analysis

### Enterprise Tier
- **Daily Budget**: ε = 100.0
- **Reset Time**: Every 24 hours
- **Best for**: Advanced machine learning and deep analytics

## Query Cost Calculation

Each query step has a base cost:

| Step Type | Base Cost |
|-----------|------------|
| Select     | ε = 0.1    |
| Filter     | ε = 0.2    |
| Aggregate  | ε = 0.5    |
| Group      | ε = 0.3    |

### Example Query Cost

\`\`\`json
{
  "steps": [
    {"type": "select", "field": "amount"},        // ε = 0.1
    {"type": "filter", "field": "amount",        // ε = 0.2
     "operator": "gt", "value": 100},
    {"type": "aggregate", "field": "amount",     // ε = 0.5
     "aggregation": "sum"}
  ]
}
\`\`\`

**Total Cost**: ε = 0.8

**With Aggregation Discount**: ε = 0.8 × 0.8 = ε = 0.64

## Cost Optimization Strategies

### 1. Use Aggregations
Queries with aggregations get a 20% discount:
- Without aggregation: ε = 1.0
- With aggregation: ε = 0.8

### 2. Combine Filters
Multiple filters on the same field cost less:
- Separate filters: ε = 0.2 + 0.2 = 0.4
- Combined filter: ε = 0.3

### 3. Early Filtering
Apply filters as early as possible to reduce data size:
\`\`\`json
// Good: Filter early
[
  {"type": "filter", "field": "amount", "operator": "gt", "value": 100},
  {"type": "aggregate", "field": "amount", "aggregation": "sum"}
]

// Less efficient: Aggregate then filter
[
  {"type": "aggregate", "field": "amount", "aggregation": "sum"},
  {"type": "filter", "field": "amount", "operator": "gt", "value": 100}
]
\`\`\`

## Budget Monitoring

### Check Current Usage
\`\`\`bash
curl -H "Authorization: Bearer TOKEN" \\
  https://api.stellar-privacy.com/v1/privacy/budget
\`\`\`

### Response Example
\`\`\`json
{
  "dailyBudget": 20.0,
  "usedToday": 3.2,
  "remaining": 16.8,
  "resetTime": "2024-01-15T00:00:00Z",
  "queriesToday": 5,
  "averageCost": 0.64
}
\`\`\`

## Budget Alerts

We'll notify you when:
- **80% Used**: Warning that budget is running low
- **95% Used**: Critical warning
- **100% Used**: Budget exhausted (wait for reset)

## Emergency Reset

For enterprise accounts, emergency budget resets are available:
- **Cost**: 2× monthly subscription fee
- **Limit**: Once per month
- **Contact**: support@stellar-privacy.com
        `,
        category: 'privacy-concepts',
        difficulty: 'intermediate',
        readTime: '12 min'
      }
    ]
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    description: 'Complete API documentation and examples',
    icon: '📚',
    articles: [
      {
        id: 'authentication',
        title: 'Authentication & Authorization',
        content: `
# Authentication & Authorization

This guide covers how to authenticate with the Stellar Privacy Analytics API.

## Getting Started

All API requests (except for registration and login) require authentication using JWT (JSON Web Tokens).

## Registration

Create a new account:

\`\`\`bash
curl -X POST https://api.stellar-privacy.com/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!"
  }'
\`\`\`

### Response
\`\`\`json
{
  "message": "User registered successfully",
  "userId": "user-abc123",
  "email": "user@example.com"
}
\`\`\`

## Login

Authenticate and receive a JWT token:

\`\`\`bash
curl -X POST https://api.stellar-privacy.com/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
\`\`\`

### Response
\`\`\`json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-abc123",
    "email": "user@example.com",
    "rateLimitTier": "premium",
    "permissions": ["read:analytics", "write:queries"]
  },
  "expiresIn": 3600
}
\`\`\`

## Using the Token

Include the JWT token in the Authorization header:

\`\`\`bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \\
  https://api.stellar-privacy.com/v1/analytics
\`\`\`

## Token Structure

The JWT token contains:

- **sub**: User ID
- **email**: User email
- **permissions**: Array of granted permissions
- **rateLimitTier**: User's subscription tier
- **organizationId**: Organization ID (if applicable)
- **sessionId**: Unique session identifier
- **iat**: Issued at timestamp
- **exp**: Expiration timestamp
- **jti**: JWT ID for revocation

## Token Expiration

- **Default Expiration**: 1 hour
- **Refresh**: Login again to get a new token
- **Security**: Tokens are automatically invalidated on logout

## Permissions

### Available Permissions
- **read:analytics**: View analytics and analyses
- **write:analytics**: Create and modify analyses
- **read:queries**: Execute privacy queries
- **write:queries**: Save and manage query favorites
- **admin:users**: User management (admin only)
- **admin:system**: System administration (admin only)

### Permission Checks

Each endpoint checks for required permissions:

\`\`\`javascript
// Example: Require query permission
app.use('/query', requirePermission('read:queries'));
\`\`\`

## Rate Limiting

Rate limits are based on your subscription tier:

| Tier | Requests per 15min | Burst Limit |
|-------|-------------------|-------------|
| Basic | 100 | 200 |
| Premium | 500 | 1000 |
| Enterprise | 2000 | 4000 |

### Rate Limit Headers

Responses include rate limit information:

\`\`\`http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 498
X-RateLimit-Reset: 1640995200
\`\`\`

## API Key Authentication

For service-to-service communication, you can use API keys:

### Generate API Key
Contact support to generate an API key for your service.

### Use API Key
\`\`\`bash
curl -H "X-API-Key: stellar_api_v1_abc123def456..." \\
  https://api.stellar-privacy.com/v1/analytics
\`\`\`

## Security Best Practices

1. **HTTPS Only**: Never transmit tokens over HTTP
2. **Token Storage**: Store tokens securely (httpOnly cookies, secure storage)
3. **Token Expiration**: Implement automatic token refresh
4. **Permission Principle**: Request minimum required permissions
5. **Token Revocation**: Implement logout functionality

## Error Handling

### Authentication Errors
\`\`\`json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "details": {
      "timestamp": "2024-01-15T10:30:00Z",
      "traceId": "trace_abc123"
    }
  }
}
\`\`\`

### Authorization Errors
\`\`\`json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions",
    "details": {
      "requiredPermission": "read:analytics",
      "userPermissions": ["read:queries"],
      "traceId": "trace_def456"
    }
  }
}
\`\`\`
        `,
        category: 'api-reference',
        difficulty: 'intermediate',
        readTime: '15 min'
      }
    ]
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Common issues and solutions',
    icon: '🔧',
    articles: [
      {
        id: 'common-errors',
        title: 'Common Errors and Solutions',
        content: `
# Common Errors and Solutions

This guide covers the most common errors and how to resolve them.

## Authentication Errors

### "Invalid or expired token"
**Cause**: JWT token has expired or is malformed

**Solution**:
1. Check token expiration time
2. Login again to get a fresh token
3. Ensure proper token format: \`Bearer <token>\`

\`\`\`bash
# Correct
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \\
  https://api.stellar-privacy.com/v1/analytics

# Incorrect
curl -H "Authorization: eyJhbGciOiJIUzI1NiIs..." \\
  https://api.stellar-privacy.com/v1/analytics
\`\`\`

### "Insufficient permissions"
**Cause**: User lacks required permission for the endpoint

**Solution**:
1. Check your user permissions in the login response
2. Contact admin to request additional permissions
3. Use endpoints within your permission scope

## Query Errors

### "Query validation failed"
**Cause**: Query structure is invalid

**Common Issues**:
- Missing required fields
- Invalid step types
- Incorrect operator usage

**Solution**:
1. Use the validate endpoint first
2. Check query structure against documentation

\`\`\`bash
# Validate before executing
curl -X POST https://api.stellar-privacy.com/v1/query/validate \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query": YOUR_QUERY}'
\`\`\`

### "Privacy budget exceeded"
**Cause**: Daily privacy budget has been exhausted

**Solution**:
1. Wait for daily reset (midnight UTC)
2. Optimize queries to use less privacy budget
3. Upgrade to higher tier for more budget

### "High privacy cost warning"
**Cause**: Query cost exceeds recommended threshold

**Solution**:
1. Add filters to reduce data scope
2. Use aggregations for cost discount
3. Break complex query into simpler parts

## Rate Limiting Errors

### "Too Many Requests"
**Cause**: Exceeded rate limit for your tier

**Solution**:
1. Wait for rate limit reset (check Retry-After header)
2. Implement exponential backoff
3. Upgrade to higher tier for higher limits

\`\`\`http
HTTP/429 Too Many Requests
Retry-After: 300
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 0
\`\`\`

## Network Issues

### "Connection timeout"
**Cause**: Network connectivity or server overload

**Solution**:
1. Check internet connection
2. Implement retry logic with exponential backoff
3. Check status page for service availability

### "SSL/TLS error"
**Cause**: Certificate or encryption issues

**Solution**:
1. Update your CA certificates
2. Ensure system time is correct
3. Check for firewall/proxy interference

## Data Issues

### "No data found"
**Cause**: Query filters are too restrictive

**Solution**:
1. Relax filter conditions
2. Check data availability
3. Verify field names and values

### "Unexpected results"
**Cause**: Privacy noise affecting results significantly

**Solution**:
1. Lower epsilon for less noise (but less privacy)
2. Increase sample size with broader filters
3. Run multiple queries and average results

## Performance Issues

### "Query timeout"
**Cause**: Complex query taking too long

**Solution**:
1. Simplify query structure
2. Add more selective filters
3. Break into multiple smaller queries

### "Slow response times"
**Cause**: High server load or network latency

**Solution**:
1. Check API status page
2. Use CDN endpoints if available
3. Implement client-side caching

## Debugging Tips

### 1. Use Trace IDs
Every response includes a trace ID for debugging:

\`\`\`json
{
  "traceId": "trace_abc123def456"
}
\`\`\`

Include this ID when contacting support.

### 2. Check Response Headers

Look for these diagnostic headers:
\`\`\`http
X-Response-Time: 1234
X-Privacy-Cost: 1.2
X-Request-ID: req-789
\`\`\`

### 3. Enable Debug Mode

Set the debug header for detailed logging:

\`\`\`bash
curl -H "X-Debug: true" \\
  -H "Authorization: Bearer TOKEN" \\
  https://api.stellar-privacy.com/v1/query/execute
\`\`\`

### 4. Use the Health Endpoint

Check service status:

\`\`\`bash
curl https://api.stellar-privacy.com/v1/health
\`\`\`

## Getting Help

If you're still stuck:

1. **Check Documentation**: Review API docs and help articles
2. **Search Issues**: Look for similar problems in our issue tracker
3. **Contact Support**: Email support@stellar-privacy.com
4. **Community**: Join our Discord community

When contacting support, include:
- Trace ID from the error response
- Your query (if applicable)
- Steps to reproduce
- Expected vs actual behavior
        `,
        category: 'troubleshooting',
        difficulty: 'beginner',
        readTime: '10 min'
      }
    ]
  }
];

// Get all help categories
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Help categories requested', {
    type: 'help_access',
    category: 'categories',
    userAgent: req.headers['user-agent']
  });

  res.json({
    categories: helpCategories.map(cat => ({
      id: cat.id,
      title: cat.title,
      description: cat.description,
      icon: cat.icon,
      articleCount: cat.articles.length
    })),
    message: 'Help categories retrieved successfully'
  });
}));

// Get category details
router.get('/category/:categoryId', asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  
  logger.info('Help category requested', {
    type: 'help_access',
    category: categoryId,
    userAgent: req.headers['user-agent']
  });

  const category = helpCategories.find(cat => cat.id === categoryId);
  
  if (!category) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Help category not found'
      }
    });
  }

  res.json({
    category: {
      id: category.id,
      title: category.title,
      description: category.description,
      icon: category.icon,
      articles: category.articles.map(article => ({
        id: article.id,
        title: article.title,
        description: article.content.substring(0, 200) + '...',
        difficulty: article.difficulty,
        readTime: article.readTime
      }))
    },
    message: 'Help category retrieved successfully'
  });
}));

// Get specific article
router.get('/article/:categoryId/:articleId', asyncHandler(async (req: Request, res: Response) => {
  const { categoryId, articleId } = req.params;
  
  logger.info('Help article requested', {
    type: 'help_access',
    category: categoryId,
    article: articleId,
    userAgent: req.headers['user-agent']
  });

  const category = helpCategories.find(cat => cat.id === categoryId);
  
  if (!category) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Help category not found'
      }
    });
  }

  const article = category.articles.find(art => art.id === articleId);
  
  if (!article) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Help article not found'
      }
    });
  }

  res.json({
    article: {
      id: article.id,
      title: article.title,
      content: article.content,
      category: article.category,
      difficulty: article.difficulty,
      readTime: article.readTime,
      relatedArticles: category.articles
        .filter(art => art.id !== articleId)
        .slice(0, 3)
        .map(art => ({
          id: art.id,
          title: art.title,
          difficulty: art.difficulty
        }))
    },
    message: 'Help article retrieved successfully'
  });
}));

// Search help content
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const { q: query, difficulty, category } = req.query;
  
  logger.info('Help search performed', {
    type: 'help_search',
    query,
    difficulty,
    category,
    userAgent: req.headers['user-agent']
  });

  if (!query) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Search query is required'
      }
    });
  }

  const searchTerm = (query as string).toLowerCase();
  const results: any[] = [];

  helpCategories.forEach(cat => {
    cat.articles.forEach(article => {
      const matchesSearch = article.title.toLowerCase().includes(searchTerm) ||
                          article.content.toLowerCase().includes(searchTerm);
      
      const matchesCategory = !category || cat.id === category;
      const matchesDifficulty = !difficulty || article.difficulty === difficulty;

      if (matchesSearch && matchesCategory && matchesDifficulty) {
        results.push({
          id: article.id,
          title: article.title,
          category: {
            id: cat.id,
            title: cat.title,
            icon: cat.icon
          },
          description: article.content.substring(0, 200) + '...',
          difficulty: article.difficulty,
          readTime: article.readTime,
          relevance: calculateRelevance(searchTerm, article.title, article.content)
        });
      }
    });
  });

  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance);

  res.json({
    results: results.slice(0, 20), // Limit to 20 results
    query,
    total: results.length,
    message: 'Help search completed successfully'
  });
}));

// Calculate relevance score for search results
function calculateRelevance(searchTerm: string, title: string, content: string): number {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  
  let score = 0;
  
  // Exact title match
  if (titleLower === searchTerm) score += 100;
  // Title contains search term
  else if (titleLower.includes(searchTerm)) score += 50;
  
  // Count occurrences in content
  const contentMatches = (contentLower.match(new RegExp(searchTerm, 'g')) || []).length;
  score += contentMatches * 5;
  
  // Prefer shorter content (more focused)
  score += Math.max(0, 50 - content.length / 100);
  
  return score;
}

// Get quick start guide
router.get('/quickstart', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Quick start guide requested', {
    type: 'help_access',
    guide: 'quickstart',
    userAgent: req.headers['user-agent']
  });

  const quickStartGuide = {
    title: 'Quick Start Guide',
    description: 'Get up and running with Stellar Privacy Analytics in 5 minutes',
    steps: [
      {
        step: 1,
        title: 'Create Account',
        description: 'Register for a free account to get started',
        action: 'POST /auth/register',
        example: {
          email: 'user@example.com',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        }
      },
      {
        step: 2,
        title: 'Get Authentication Token',
        description: 'Login to receive your JWT token',
        action: 'POST /auth/login',
        example: {
          email: 'user@example.com',
          password: 'SecurePass123!'
        }
      },
      {
        step: 3,
        title: 'Explore Data Schema',
        description: 'See what data fields are available',
        action: 'GET /query/schema',
        example: 'curl -H "Authorization: Bearer TOKEN" /api/v1/query/schema'
      },
      {
        step: 4,
        title: 'Build Your First Query',
        description: 'Create a simple privacy-preserving query',
        action: 'POST /query/validate',
        example: {
          query: {
            steps: [
              { type: 'select', field: 'transaction_amount' },
              { type: 'aggregate', field: 'transaction_amount', aggregation: 'average' }
            ]
          }
        }
      },
      {
        step: 5,
        title: 'Execute Query',
        description: 'Run your query and get results',
        action: 'POST /query/execute',
        example: {
          query: {
            steps: [
              { type: 'select', field: 'transaction_amount' },
              { type: 'aggregate', field: 'transaction_amount', aggregation: 'average' }
            ]
          }
        }
      }
    ],
    nextSteps: [
      'Read the full documentation at /api/v1/docs',
      'Try advanced queries with filters and grouping',
      'Save frequently used queries as favorites',
      'Monitor your privacy budget usage'
    ]
  };

  res.json({
    guide: quickStartGuide,
    message: 'Quick start guide retrieved successfully'
  });
}));

export { router as helpRoutes };
