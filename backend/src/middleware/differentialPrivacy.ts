import { Request, Response, NextFunction } from 'express';
import {

  };
}

export class DifferentialPrivacyMiddleware {

    return async (req: DifferentialPrivacyRequest, res: Response, next: NextFunction) => {
      try {
        if (!this.shouldApplyDifferentialPrivacy(req)) {
          return next();
        }


        };

        next();
      } catch (error) {
