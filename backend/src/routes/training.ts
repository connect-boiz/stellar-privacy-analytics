import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import TrainingService, { UserRole } from '../services/trainingService';
import { validateRequest } from '../middleware/validation';

const router = Router();

const TRAINING_ROLES: UserRole[] = [
  'admin',
  'analyst',
  'developer',
  'data_steward',
  'compliance_officer',
  'end_user',
];

const moduleIdParam = () =>
  param('moduleId').trim().matches(/^[a-zA-Z0-9_-]{1,128}$/).withMessage('Invalid moduleId');
const certificateIdParam = () =>
  param('certificateId').trim().matches(/^[a-zA-Z0-9_-]{1,128}$/).withMessage('Invalid certificateId');
const verificationCodeParam = () =>
  param('verificationCode').trim().matches(/^[a-zA-Z0-9_-]{1,128}$/).withMessage('Invalid verificationCode');

// ============================================
// Module Management Routes
// ============================================

// Get all training modules
router.get('/modules', [
  query('role').optional().isIn(TRAINING_ROLES),
  query('category').optional().trim().isLength({ max: 128 }),
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { role, category, difficulty } = req.query;
  
  let modules = TrainingService.getAllModules();
  
  if (role) {
    modules = TrainingService.getModulesByRole(role as UserRole);
  }
  
  if (category) {
    modules = modules.filter(m => m.category === category);
  }
  
  if (difficulty) {
    modules = modules.filter(m => m.difficulty === difficulty);
  }
  
  res.json({
    success: true,
    data: modules.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      difficulty: m.difficulty,
      estimatedDuration: m.estimatedDuration,
      targetRoles: m.targetRoles,
      prerequisites: m.prerequisites,
      objectives: m.objectives,
      passingScore: m.passingScore,
      version: m.version,
      isActive: m.isActive
    }))
  });
}));

// Get single module with full details
router.get('/modules/:moduleId', [
  moduleIdParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  const module = TrainingService.getModuleById(moduleId);
  
  if (!module) {
    return res.status(404).json({
      success: false,
      error: 'Module not found'
    });
  }
  
  res.json({
    success: true,
    data: module
  });
}));

// Create new module (admin only)
router.post('/modules', [
  body('title').optional().trim().isLength({ max: 500 }),
  body('description').optional().trim().isLength({ max: 10000 }),
  body('category').optional().trim().isLength({ max: 200 }),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('estimatedDuration').optional().isInt({ min: 1, max: 10080 }),
  body('passingScore').optional().isInt({ min: 0, max: 100 }),
  body('maxAttempts').optional().isInt({ min: 1, max: 100 }),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'system';
  const module = TrainingService.createModule(req.body, userId);
  
  res.status(201).json({
    success: true,
    data: module,
    message: 'Training module created successfully'
  });
}));

// Update module (admin only)
router.put('/modules/:moduleId', [
  moduleIdParam(),
  body('title').optional().trim().isLength({ max: 500 }),
  body('description').optional().trim().isLength({ max: 10000 }),
  body('category').optional().trim().isLength({ max: 200 }),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  body('estimatedDuration').optional().isInt({ min: 1, max: 10080 }),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  const module = TrainingService.updateModule(moduleId, req.body);
  
  if (!module) {
    return res.status(404).json({
      success: false,
      error: 'Module not found'
    });
  }
  
  res.json({
    success: true,
    data: module,
    message: 'Training module updated successfully'
  });
}));

// Delete module (admin only)
router.delete('/modules/:moduleId', [
  moduleIdParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  const deleted = TrainingService.deleteModule(moduleId);
  
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Module not found'
    });
  }
  
  res.json({
    success: true,
    message: 'Training module deleted successfully'
  });
}));

// ============================================
// Progress Tracking Routes
// ============================================

// Get user's training progress
router.get('/progress', [
  query('moduleId').optional({ checkFalsy: true }).trim().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { moduleId } = req.query;
  
  const progress = TrainingService.getUserProgress(userId, moduleId as string);
  
  res.json({
    success: true,
    data: progress.map(p => ({
      ...p,
      exerciseResults: Object.fromEntries(p.exerciseResults)
    }))
  });
}));

// Start a training module
router.post('/progress/start', [
  body('moduleId').trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { moduleId } = req.body;
  
  const result = TrainingService.startModule(userId, moduleId);
  
  if ('error' in result) {
    return res.status(400).json({
      success: false,
      error: result.error
    });
  }
  
  res.json({
    success: true,
    data: {
      ...result,
      exerciseResults: Object.fromEntries(result.exerciseResults)
    },
    message: 'Training module started successfully'
  });
}));

// Update progress (content viewing, time tracking)
router.put('/progress/:moduleId', [
  moduleIdParam(),
  body('contentIndex').optional().isInt({ min: 0, max: 1_000_000 }),
  body('timeSpent').optional().isInt({ min: 0, max: 1_000_000_000 }),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { moduleId } = req.params;
  const { contentIndex, timeSpent } = req.body;
  
  const progress = TrainingService.updateProgress(userId, moduleId, {
    contentIndex,
    timeSpent
  });
  
  if (!progress) {
    return res.status(404).json({
      success: false,
      error: 'Progress not found'
    });
  }
  
  res.json({
    success: true,
    data: {
      ...progress,
      exerciseResults: Object.fromEntries(progress.exerciseResults)
    }
  });
}));

// ============================================
// Exercise Routes
// ============================================

// Get exercises for a module
router.get('/modules/:moduleId/exercises', [
  moduleIdParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  const module = TrainingService.getModuleById(moduleId);
  
  if (!module) {
    return res.status(404).json({
      success: false,
      error: 'Module not found'
    });
  }
  
  res.json({
    success: true,
    data: module.exercises.map(e => ({
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      difficulty: e.difficulty,
      instructions: e.instructions,
      scenario: e.scenario,
      data: e.data,
      hints: e.hints,
      points: e.points,
      timeLimit: e.timeLimit
    }))
  });
}));

// Submit exercise answer
router.post('/exercises/submit', [
  body('moduleId').trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  body('exerciseId').trim().notEmpty().isLength({ max: 128 }),
  body('answers').isObject(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { moduleId, exerciseId, answers } = req.body;
  
  const result = TrainingService.submitExercise(userId, moduleId, exerciseId, answers);
  
  if ('error' in result) {
    return res.status(400).json({
      success: false,
      error: result.error
    });
  }
  
  res.json({
    success: true,
    data: result,
    message: result.passed ? 'Exercise completed successfully!' : 'Exercise submitted. Review the feedback and try again.'
  });
}));

// ============================================
// Assessment Routes
// ============================================

// Get assessment for a module
router.get('/modules/:moduleId/assessment', [
  moduleIdParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  const module = TrainingService.getModuleById(moduleId);
  
  if (!module) {
    return res.status(404).json({
      success: false,
      error: 'Module not found'
    });
  }
  
  res.json({
    success: true,
    data: {
      id: module.assessment.id,
      title: module.assessment.title,
      description: module.assessment.description,
      timeLimit: module.assessment.timeLimit,
      passingScore: module.assessment.passingScore,
      questionCount: module.assessment.questions.length,
      totalPoints: module.assessment.questions.reduce((sum, q) => sum + q.points, 0),
      randomizeQuestions: module.assessment.randomizeQuestions,
      showResultsImmediately: module.assessment.showResultsImmediately,
      allowReview: module.assessment.allowReview
    }
  });
}));

// Start assessment
router.post('/assessment/start', [
  body('moduleId').trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { moduleId } = req.body;
  
  const result = TrainingService.startAssessment(userId, moduleId);
  
  if ('error' in result) {
    return res.status(400).json({
      success: false,
      error: result.error
    });
  }
  
  // Get module to return questions
  const module = TrainingService.getModuleById(moduleId);
  if (!module) {
    return res.status(404).json({
      success: false,
      error: 'Module not found'
    });
  }
  
  // Randomize questions if configured
  let questions = [...module.assessment.questions];
  if (module.assessment.randomizeQuestions) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }
  
  res.json({
    success: true,
    data: {
      attempt: result,
      questions: questions.map(q => ({
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options?.map(o => ({ id: o.id, text: o.text })),
        points: q.points,
        difficulty: q.difficulty,
        category: q.category
      })),
      timeLimit: module.assessment.timeLimit,
      totalQuestions: questions.length
    }
  });
}));

// Submit assessment
router.post('/assessment/submit', [
  body('moduleId').trim().notEmpty().matches(/^[a-zA-Z0-9_-]{1,128}$/),
  body('attemptId').trim().notEmpty().isLength({ max: 128 }),
  body('answers').isObject(),
  body('timeSpent').optional().isInt({ min: 0, max: 1_000_000_000 }),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { moduleId, attemptId, answers, timeSpent } = req.body;
  
  // Convert answers object to Map
  const answersMap = new Map(Object.entries(answers));
  
  const result = TrainingService.submitAssessment(userId, moduleId, attemptId, answersMap, timeSpent);
  
  if ('error' in result) {
    return res.status(400).json({
      success: false,
      error: result.error
    });
  }
  
  res.json({
    success: true,
    data: {
      score: result.attempt.score,
      passed: result.passed,
      questionResults: result.attempt.questionResults,
      certificate: result.certificate ? {
        id: result.certificate.id,
        verificationCode: result.certificate.verificationCode,
        certificateUrl: result.certificate.certificateUrl
      } : undefined
    },
    message: result.passed 
      ? 'Congratulations! You passed the assessment!' 
      : 'Assessment submitted. You did not reach the passing score.'
  });
}));

// ============================================
// Certificate Routes
// ============================================

// Get user's certificates
router.get('/certificates', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  
  const certificates = TrainingService.getUserCertificates(userId);
  
  res.json({
    success: true,
    data: certificates
  });
}));

// Get specific certificate
router.get('/certificates/:certificateId', [
  certificateIdParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { certificateId } = req.params;
  
  const certificate = TrainingService.getCertificate(certificateId);
  
  if (!certificate) {
    return res.status(404).json({
      success: false,
      error: 'Certificate not found'
    });
  }
  
  res.json({
    success: true,
    data: certificate
  });
}));

// Verify certificate by code
router.get('/certificates/verify/:verificationCode', [
  verificationCodeParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { verificationCode } = req.params;
  
  const certificate = TrainingService.verifyCertificate(verificationCode);
  
  if (!certificate) {
    return res.status(404).json({
      success: false,
      error: 'Invalid verification code'
    });
  }
  
  res.json({
    success: true,
    data: {
      moduleName: certificate.moduleName,
      userName: certificate.userName,
      issuedAt: certificate.issuedAt,
      score: certificate.score,
      isValid: certificate.isValid
    }
  });
}));

// ============================================
// Analytics Routes
// ============================================

// Get module analytics
router.get('/analytics/modules/:moduleId', [
  moduleIdParam(),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  
  const analytics = TrainingService.getModuleAnalytics(moduleId);
  
  if ('error' in analytics) {
    return res.status(404).json({
      success: false,
      error: analytics.error
    });
  }
  
  res.json({
    success: true,
    data: analytics
  });
}));

// Get overall training analytics
router.get('/analytics/overview', asyncHandler(async (req: Request, res: Response) => {
  const analytics = TrainingService.getOverallAnalytics();
  
  res.json({
    success: true,
    data: analytics
  });
}));

// ============================================
// Onboarding Integration Routes
// ============================================

// Get recommended training for onboarding
router.get('/onboarding/:role', [
  param('role').isIn(TRAINING_ROLES),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.params;
  
  const modules = TrainingService.getOnboardingTraining(role as UserRole);
  
  res.json({
    success: true,
    data: modules.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      estimatedDuration: m.estimatedDuration,
      objectives: m.objectives
    }))
  });
}));

// Assign required training to user
router.post('/onboarding/assign', [
  body('role').isIn(TRAINING_ROLES),
  validateRequest,
], asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'demo-user';
  const { role } = req.body;
  
  const progress = TrainingService.assignRequiredTraining(userId, role as UserRole);
  
  res.json({
    success: true,
    data: progress.map(p => ({
      moduleId: p.moduleId,
      status: p.status
    })),
    message: `Assigned ${progress.length} required training modules`
  });
}));

export { router as trainingRoutes };
