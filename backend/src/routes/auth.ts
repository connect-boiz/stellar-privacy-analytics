import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Register user
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({
    message: 'User registered successfully',
    userId: 'temp-user-id'
  });
}));

// Login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    token: 'temp-jwt-token',
    user: { id: 'temp-user-id', email: 'user@example.com' }
  });
}));

// Logout
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
}));

export { router as authRoutes };
