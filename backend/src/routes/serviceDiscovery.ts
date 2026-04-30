import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ServiceDiscovery, ServiceRegistration, ServiceInfo, FailoverPolicy, DisasterRecoveryPlan } from '../services/ServiceDiscovery';
import { logger } from '../utils/logger';

const router = Router();

// Service Discovery instance (will be initialized in main app)
let serviceDiscovery: ServiceDiscovery | null = null;

export const initializeServiceDiscovery = (sd: ServiceDiscovery) => {
  serviceDiscovery = sd;
};

// Middleware to check if service discovery is initialized
const checkServiceDiscovery = (req: Request, res: Response, next: any) => {
  if (!serviceDiscovery) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Service Discovery is not initialized'
    });
  }
  next();
};

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }
  next();
};

// Register a new service
router.post('/services/register',
  [
    body('name').notEmpty().withMessage('Service name is required'),
    body('host').notEmpty().withMessage('Host is required'),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('Port must be a valid port number'),
    body('version').optional().isString(),
    body('weight').optional().isInt({ min: 1 }),
    body('metadata').optional().isObject(),
    body('tags').optional().isArray(),
    body('healthCheckInterval').optional().isInt({ min: 1000 })
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const registration: ServiceRegistration = {
        name: req.body.name,
        host: req.body.host,
        port: req.body.port,
        version: req.body.version,
        weight: req.body.weight,
        metadata: req.body.metadata,
        tags: req.body.tags,
        healthCheckInterval: req.body.healthCheckInterval
      };

      const serviceId = await serviceDiscovery!.registerService(registration);
      
      res.status(201).json({
        message: 'Service registered successfully',
        serviceId,
        registration
      });
      
      logger.info(`Service registered: ${serviceId}`);
      
    } catch (error: any) {
      logger.error('Failed to register service:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Deregister a service
router.delete('/services/:serviceId',
  [
    param('serviceId').notEmpty().withMessage('Service ID is required')
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceId } = req.params;
      const success = await serviceDiscovery!.deregisterService(serviceId);
      
      if (success) {
        res.json({
          message: 'Service deregistered successfully',
          serviceId
        });
        logger.info(`Service deregistered: ${serviceId}`);
      } else {
        res.status(404).json({
          error: 'Not Found',
          message: 'Service not found'
        });
      }
      
    } catch (error: any) {
      logger.error('Failed to deregister service:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get a specific service
router.get('/services/:serviceName',
  [
    param('serviceName').notEmpty().withMessage('Service name is required'),
    query('healthyOnly').optional().isBoolean()
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const healthyOnly = req.query.healthyOnly !== 'false';
      
      const service = await serviceDiscovery!.getService(serviceName);
      
      if (service) {
        res.json({
          service,
          serviceName,
          healthyOnly
        });
      } else {
        res.status(404).json({
          error: 'Not Found',
          message: 'Service not found or no healthy instances available'
        });
      }
      
    } catch (error: any) {
      logger.error('Failed to get service:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get all services
router.get('/services',
  [
    query('serviceName').optional().isString(),
    query('healthyOnly').optional().isBoolean()
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName, healthyOnly } = req.query;
      
      const services = await serviceDiscovery!.getAllServices(
        serviceName as string | undefined
      );
      
      let filteredServices = services;
      if (healthyOnly === 'true') {
        filteredServices = services.filter(service => service.health === 'healthy');
      }
      
      res.json({
        services: filteredServices,
        total: filteredServices.length,
        filters: { serviceName, healthyOnly }
      });
      
    } catch (error: any) {
      logger.error('Failed to get services:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Discover available services
router.get('/discover',
  checkServiceDiscovery,
  async (req: Request, res: Response) => {
    try {
      const services = await serviceDiscovery!.discoverServices();
      
      res.json({
        services,
        count: services.length
      });
      
    } catch (error: any) {
      logger.error('Failed to discover services:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get service health status
router.get('/health',
  checkServiceDiscovery,
  async (req: Request, res: Response) => {
    try {
      const healthStatus = await serviceDiscovery!.getHealthStatus();
      
      res.json(healthStatus);
      
    } catch (error: any) {
      logger.error('Failed to get health status:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get service metrics
router.get('/metrics',
  [
    query('serviceName').optional().isString()
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.query;
      
      const metrics = serviceDiscovery!.getServiceMetrics(
        serviceName as string | undefined
      );
      
      res.json(metrics);
      
    } catch (error: any) {
      logger.error('Failed to get service metrics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get active alerts
router.get('/alerts',
  [
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical'])
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { severity } = req.query;
      
      const alerts = serviceDiscovery!.getActiveAlerts(
        severity as string | undefined
      );
      
      res.json({
        alerts,
        count: alerts.length,
        severity
      });
      
    } catch (error: any) {
      logger.error('Failed to get alerts:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Add health check for a service
router.post('/health-checks',
  [
    body('serviceName').notEmpty().withMessage('Service name is required'),
    body('endpoint').notEmpty().withMessage('Endpoint is required'),
    body('interval').optional().isInt({ min: 1000 })
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName, endpoint, interval } = req.body;
      
      serviceDiscovery!.addHealthCheck(serviceName, endpoint, interval);
      
      res.status(201).json({
        message: 'Health check added successfully',
        serviceName,
        endpoint,
        interval
      });
      
      logger.info(`Health check added for ${serviceName} at ${endpoint}`);
      
    } catch (error: any) {
      logger.error('Failed to add health check:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Remove health check for a service
router.delete('/health-checks',
  [
    body('serviceName').notEmpty().withMessage('Service name is required'),
    body('endpoint').notEmpty().withMessage('Endpoint is required')
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName, endpoint } = req.body;
      
      serviceDiscovery!.removeHealthCheck(serviceName, endpoint);
      
      res.json({
        message: 'Health check removed successfully',
        serviceName,
        endpoint
      });
      
      logger.info(`Health check removed for ${serviceName} at ${endpoint}`);
      
    } catch (error: any) {
      logger.error('Failed to remove health check:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Add failover policy
router.post('/failover/policies',
  [
    body('serviceName').notEmpty().withMessage('Service name is required'),
    body('maxFailures').isInt({ min: 1 }).withMessage('Max failures must be at least 1'),
    body('recoveryTimeout').isInt({ min: 1000 }).withMessage('Recovery timeout must be at least 1000ms'),
    body('failoverStrategy').isIn(['round_robin', 'weighted', 'priority', 'geographic']),
    body('backupInstances').isArray().withMessage('Backup instances must be an array'),
    body('enableAutoFailover').optional().isBoolean(),
    body('healthCheckInterval').optional().isInt({ min: 1000 })
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const policy: FailoverPolicy = req.body;
      
      serviceDiscovery!.addFailoverPolicy(policy);
      
      res.status(201).json({
        message: 'Failover policy added successfully',
        policy
      });
      
      logger.info(`Failover policy added for ${policy.serviceName}`);
      
    } catch (error: any) {
      logger.error('Failed to add failover policy:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Add disaster recovery plan
router.post('/disaster-recovery/plans',
  [
    body('serviceName').notEmpty().withMessage('Service name is required'),
    body('primaryRegion').notEmpty().withMessage('Primary region is required'),
    body('backupRegions').isArray().withMessage('Backup regions must be an array'),
    body('dataReplicationDelay').isInt({ min: 0 }).withMessage('Data replication delay must be non-negative'),
    body('maxDowntime').isInt({ min: 0 }).withMessage('Max downtime must be non-negative'),
    body('recoverySteps').isArray().withMessage('Recovery steps must be an array'),
    body('contactEmails').isArray().withMessage('Contact emails must be an array')
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const plan: DisasterRecoveryPlan = req.body;
      
      serviceDiscovery!.addDisasterRecoveryPlan(plan);
      
      res.status(201).json({
        message: 'Disaster recovery plan added successfully',
        plan
      });
      
      logger.info(`Disaster recovery plan added for ${plan.serviceName}`);
      
    } catch (error: any) {
      logger.error('Failed to add disaster recovery plan:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get failover status
router.get('/failover/status',
  [
    query('serviceName').optional().isString()
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.query;
      
      const status = serviceDiscovery!.getFailoverStatus(
        serviceName as string | undefined
      );
      
      res.json(status);
      
    } catch (error: any) {
      logger.error('Failed to get failover status:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Manual failover
router.post('/failover/manual/:serviceName',
  [
    param('serviceName').notEmpty().withMessage('Service name is required')
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      
      await serviceDiscovery!.manualFailover(serviceName);
      
      res.json({
        message: 'Manual failover initiated successfully',
        serviceName
      });
      
      logger.info(`Manual failover initiated for ${serviceName}`);
      
    } catch (error: any) {
      logger.error('Failed to initiate manual failover:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Manual failback
router.post('/failback/manual/:serviceName',
  [
    param('serviceName').notEmpty().withMessage('Service name is required')
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      
      await serviceDiscovery!.manualFailback(serviceName);
      
      res.json({
        message: 'Manual failback initiated successfully',
        serviceName
      });
      
      logger.info(`Manual failback initiated for ${serviceName}`);
      
    } catch (error: any) {
      logger.error('Failed to initiate manual failback:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Get Prometheus metrics
router.get('/prometheus',
  checkServiceDiscovery,
  async (req: Request, res: Response) => {
    try {
      const metrics = serviceDiscovery!.getPrometheusMetrics();
      
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
      
    } catch (error: any) {
      logger.error('Failed to get Prometheus metrics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

// Service mesh request proxy
router.post('/mesh/request/:serviceName',
  [
    param('serviceName').notEmpty().withMessage('Service name is required'),
    body('path').notEmpty().withMessage('Path is required'),
    body('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    body('data').optional(),
    body('headers').optional().isObject(),
    body('params').optional().isObject(),
    body('timeout').optional().isInt({ min: 1000 })
  ],
  checkServiceDiscovery,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const { path, method = 'GET', data, headers, params, timeout } = req.body;
      
      const response = await serviceDiscovery!.request({
        serviceName,
        path,
        method,
        data,
        headers,
        params,
        timeout
      });
      
      res.json({
        response,
        serviceName,
        path,
        method
      });
      
    } catch (error: any) {
      logger.error('Failed to make service mesh request:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

export default router;
