import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';

const router = Router();

router.post('/register', [
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('password').optional({ values: 'null' }).isString().isLength({ min: 8, max: 256 }),
  body('name').optional().trim().isLength({ max: 200 }),
  validateRequest,
], asyncHandler(async (_req: Request, res: Response) => {
  res.status(201).json({
    message: 'User registered successfully',
    userId: 'temp-user-id',
  });
}));

router.post('/login', [
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('password').optional().isString().isLength({ max: 256 }),
  validateRequest,
], asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    token: 'placeholder-token',
    user: { id: 'temp-user-id', email: 'user@example.com' },
  });
}));

router.post('/logout', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
}));

export { router as authRoutes };
