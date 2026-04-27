import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { logger } from '../utils/logger';

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Stellar Privacy Analytics API',
      version: '1.0.0',
      description: 'Privacy-first analytics API for Stellar ecosystem',
      contact: {
        name: 'Stellar Privacy Analytics Team',
        email: 'support@stellar-privacy.com',
        url: 'https://stellar-privacy.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'https://api.stellar-privacy.com/v1',
        description: 'Production server'
      },
      {
        url: 'https://staging-api.stellar-privacy.com/v1',
        description: 'Staging server'
      },
      {
        url: 'http://localhost:3001/v1',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/docs/openapi.yaml'
  ]
};

// Generate Swagger specification
const specs = swaggerJsdoc(swaggerOptions);

// Custom CSS for Swagger UI
const customCss = `
  .swagger-ui .topbar { display: none }
  .swagger-ui .info { margin: 20px 0 }
  .swagger-ui .scheme-container { margin: 20px 0 }
  .swagger-ui .opblock.opblock-post { border-color: #49cc90; }
  .swagger-ui .opblock.opblock-get { border-color: #61affe; }
  .swagger-ui .opblock.opblock-put { border-color: #fca130; }
  .swagger-ui .opblock.opblock-delete { border-color: #f93e3e; }
`;

// Custom options for Swagger UI
const swaggerUiOptions = {
  customCss,
  customSiteTitle: 'Stellar Privacy Analytics API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    tryItOutEnabled: true
  }
};

// Middleware to log API documentation access
const swaggerLogger = (req: any, res: any, next: any) => {
  logger.info('API Documentation accessed', {
    type: 'api_docs_access',
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  next();
};

// Function to setup Swagger documentation
export const setupSwaggerDocumentation = (app: Express): void => {
  try {
    // Serve OpenAPI specification
    app.get('/api/v1/docs/openapi.json', (req, res) => {
      logger.info('OpenAPI specification requested', {
        type: 'openapi_spec_access',
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(specs);
    });

    // Serve Swagger UI
    app.use('/api/v1/docs', swaggerLogger, swaggerUi.serve);
    app.get('/api/v1/docs', swaggerUi.setup(specs, swaggerUiOptions));

    // Redirect root docs to Swagger UI
    app.get('/docs', (req, res) => {
      res.redirect('/api/v1/docs');
    });

    // API documentation endpoint info
    app.get('/api/v1/docs/info', (req, res) => {
      res.json({
        title: 'Stellar Privacy Analytics API Documentation',
        version: '1.0.0',
        description: 'Comprehensive API documentation with interactive testing',
        endpoints: {
          swagger_ui: '/api/v1/docs',
          openapi_spec: '/api/v1/docs/openapi.json',
          postman_collection: '/api/v1/docs/postman'
        },
        features: [
          'Interactive API testing',
          'Request/response examples',
          'Authentication testing',
          'Real-time validation',
          'Downloadable specifications'
        ]
      });
    });

    // Generate Postman collection (simplified)
    app.get('/api/v1/docs/postman', (req, res) => {
      const postmanCollection = {
        info: {
          name: 'Stellar Privacy Analytics API',
          description: 'Postman collection for Stellar Privacy Analytics API',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        auth: {
          type: 'bearer',
          bearer: [
            {
              key: 'token',
              value: '{{jwt_token}}',
              type: 'string'
            }
          ]
        },
        variable: [
          {
            key: 'base_url',
            value: 'http://localhost:3001/v1',
            type: 'string'
          },
          {
            key: 'jwt_token',
            value: '',
            type: 'string'
          }
        ],
        item: [
          {
            name: 'Authentication',
            item: [
              {
                name: 'Register User',
                request: {
                  method: 'POST',
                  header: [
                    {
                      key: 'Content-Type',
                      value: 'application/json'
                    }
                  ],
                  body: {
                    mode: 'raw',
                    raw: JSON.stringify({
                      email: 'user@example.com',
                      password: 'SecurePass123!',
                      confirmPassword: 'SecurePass123!'
                    }, null, 2)
                  },
                  url: {
                    raw: '{{base_url}}/auth/register',
                    host: ['{{base_url}}'],
                    path: ['auth', 'register']
                  }
                }
              },
              {
                name: 'Login User',
                request: {
                  method: 'POST',
                  header: [
                    {
                      key: 'Content-Type',
                      value: 'application/json'
                    }
                  ],
                  body: {
                    mode: 'raw',
                    raw: JSON.stringify({
                      email: 'user@example.com',
                      password: 'SecurePass123!'
                    }, null, 2)
                  },
                  url: {
                    raw: '{{base_url}}/auth/login',
                    host: ['{{base_url}}'],
                    path: ['auth', 'login']
                  }
                },
                event: [
                  {
                    listen: 'test',
                    script: {
                      exec: [
                        'if (pm.response.code === 200) {',
                        '    const response = pm.response.json();',
                        '    pm.collectionVariables.set(\'jwt_token\', response.token);',
                        '}'
                      ]
                    }
                  }
                ]
              }
            ]
          },
          {
            name: 'Analytics',
            item: [
              {
                name: 'Get All Analyses',
                request: {
                  method: 'GET',
                  header: [
                    {
                      key: 'Authorization',
                      value: 'Bearer {{jwt_token}}'
                    }
                  ],
                  url: {
                    raw: '{{base_url}}/analytics',
                    host: ['{{base_url}}'],
                    path: ['analytics']
                  }
                }
              },
              {
                name: 'Create Analysis',
                request: {
                  method: 'POST',
                  header: [
                    {
                      key: 'Authorization',
                      value: 'Bearer {{jwt_token}}'
                    },
                    {
                      key: 'Content-Type',
                      value: 'application/json'
                    }
                  ],
                  body: {
                    mode: 'raw',
                    raw: JSON.stringify({
                      name: 'Test Analysis',
                      description: 'Test analysis description',
                      query: {
                        steps: [
                          { type: 'select', field: 'transaction_amount' },
                          { type: 'filter', field: 'transaction_amount', operator: 'gt', value: 100 }
                        ]
                      }
                    }, null, 2)
                  },
                  url: {
                    raw: '{{base_url}}/analytics',
                    host: ['{{base_url}}'],
                    path: ['analytics']
                  }
                }
              }
            ]
          }
        ]
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="stellar-privacy-analytics.postman_collection.json"');
      res.send(postmanCollection);
    });

    logger.info('Swagger documentation setup completed', {
      swagger_ui_url: '/api/v1/docs',
      openapi_spec_url: '/api/v1/docs/openapi.json',
      postman_collection_url: '/api/v1/docs/postman'
    });

  } catch (error) {
    logger.error('Failed to setup Swagger documentation', { error: error.message });
    throw error;
  }
};

export default setupSwaggerDocumentation;
