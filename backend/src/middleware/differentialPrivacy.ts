import { Request, Response, NextFunction } from 'express';

interface DifferentialPrivacyRequest extends Request {
  user?: {
    id: string;
    privacyLevel: 'low' | 'medium' | 'high';
  };
  differentialPrivacy?: {
    applied: boolean;
    epsilon: number;
    noiseAdded: boolean;
  };
}

export class DifferentialPrivacyMiddleware {
  private epsilon: number = 0.1; // Privacy budget parameter

  shouldApplyDifferentialPrivacy(req: DifferentialPrivacyRequest): boolean {
    // Apply differential privacy to sensitive analytics endpoints
    const sensitiveEndpoints = ['/api/v1/analytics', '/api/v1/query'];
    return sensitiveEndpoints.some(endpoint => req.path.startsWith(endpoint));
  }

  applyDifferentialPrivacy(data: any): any {
    // Simple noise addition for demonstration
    if (Array.isArray(data)) {
      return data.map(item => ({
        ...item,
        // Add Laplace noise to numeric values
        ...(typeof item.value === 'number' && {
          value: item.value + this.generateLaplaceNoise(this.epsilon)
        })
      }));
    }
    return data;
  }

  private generateLaplaceNoise(epsilon: number): number {
    // Generate Laplace noise for differential privacy
    const u = Math.random() - 0.5;
    return - (1 / epsilon) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  getMiddleware() {
    return async (req: DifferentialPrivacyRequest, res: Response, next: NextFunction) => {
      try {
        if (!this.shouldApplyDifferentialPrivacy(req)) {
          return next();
        }

        // Store original json method
        const originalJson = res.json;

        // Override json method to apply differential privacy
        res.json = (data: any) => {
          const processedData = this.applyDifferentialPrivacy(data);
          req.differentialPrivacy = {
            applied: true,
            epsilon: this.epsilon,
            noiseAdded: true
          };
          return originalJson.call(res, processedData);
        };

        next();
      } catch (error) {
        console.error('Differential privacy middleware error:', error);
        next();
      }
    };
  }
}
