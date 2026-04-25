import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import TrainingService, { UserRole, TrainingModule } from '../services/trainingService';

const router = Router();

// ============================================
// Module Management Routes
// ============================================

// Get all training modules
router.get('/modules', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/modules/:moduleId', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/modules', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || 'system';
  const module = TrainingService.createModule(req.body, userId);
  
  res.status(201).json({
    success: true,
    data: module,
    message: 'Training module created successfully'
  });
}));

// Update module (admin only)
router.put('/modules/:moduleId', asyncHandler(async (req: Request, res: Response) => {
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
router.delete('/modules/:moduleId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/progress', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/progress/start', asyncHandler(async (req: Request, res: Response) => {
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
router.put('/progress/:moduleId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/modules/:moduleId/exercises', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/exercises/submit', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/modules/:moduleId/assessment', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/assessment/start', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/assessment/submit', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/certificates/:certificateId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/certificates/verify/:verificationCode', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/analytics/modules/:moduleId', asyncHandler(async (req: Request, res: Response) => {
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
router.get('/onboarding/:role', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/onboarding/assign', asyncHandler(async (req: Request, res: Response) => {
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
