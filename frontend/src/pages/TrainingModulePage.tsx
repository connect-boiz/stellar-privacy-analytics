import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  Video,
  FileText,
  PlayCircle,
  CheckCircle,
  Clock,
  Award,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Lightbulb,
  AlertCircle,
  Send,
  RotateCcw,
  Timer
} from 'lucide-react';
import axios from 'axios';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedDuration: number;
  objectives: string[];
  content: ContentItem[];
  exercises: Exercise[];
  assessment: Assessment;
  passingScore: number;
}

interface ContentItem {
  id: string;
  type: 'video' | 'text' | 'interactive' | 'presentation';
  title: string;
  content: string;
  duration: number;
  order: number;
}

interface Exercise {
  id: string;
  type: 'multiple_choice' | 'simulation' | 'scenario' | 'drag_drop' | 'code_review' | 'interactive';
  title: string;
  description: string;
  difficulty: string;
  scenario?: string;
  instructions: string;
  data: any;
  hints: string[];
  points: number;
  timeLimit?: number;
  feedback: {
    correct: string;
    incorrect: string;
    partial?: string;
  };
}

interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  passingScore: number;
  questions: AssessmentQuestion[];
  randomizeQuestions: boolean;
  showResultsImmediately: boolean;
  allowReview: boolean;
}

interface AssessmentQuestion {
  id: string;
  type: 'multiple_choice' | 'multiple_select' | 'true_false' | 'fill_blank' | 'matching' | 'ordering';
  question: string;
  options?: { id: string; text: string }[];
  points: number;
  difficulty: string;
  category: string;
}

interface UserProgress {
  status: string;
  progress: number;
  currentContentIndex: number;
  completedExercises: string[];
  exerciseResults: Record<string, { score: number; passed: boolean; feedback: string }>;
  bestScore: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export function TrainingModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'content' | 'exercises' | 'assessment'>('content');
  const [currentContentIndex, setCurrentContentIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [showExerciseHint, setShowExerciseHint] = useState(false);
  const [exerciseAnswers, setExerciseAnswers] = useState<any>({});
  const [exerciseResult, setExerciseResult] = useState<any>(null);
  
  // Assessment state
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [assessmentAttempt, setAssessmentAttempt] = useState<any>(null);
  const [assessmentAnswers, setAssessmentAnswers] = useState<Record<string, any>>({});
  const [assessmentTimer, setAssessmentTimer] = useState<number | null>(null);
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<any>(null);

  useEffect(() => {
    fetchModuleData();
  }, [moduleId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (assessmentTimer !== null && assessmentTimer > 0 && assessmentStarted && !assessmentSubmitted) {
      interval = setInterval(() => {
        setAssessmentTimer(prev => {
          if (prev === null || prev <= 1) {
            submitAssessment();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [assessmentTimer, assessmentStarted, assessmentSubmitted]);

  const fetchModuleData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [moduleRes, progressRes] = await Promise.all([
        axios.get(`${API_BASE}/training/modules/${moduleId}`, { headers }),
        axios.get(`${API_BASE}/training/progress?moduleId=${moduleId}`, { headers })
      ]);

      setModule(moduleRes.data.data);
      if (progressRes.data.data?.[0]) {
        setProgress(progressRes.data.data[0]);
        setCurrentContentIndex(progressRes.data.data[0].currentContentIndex || 0);
      }
    } catch (error) {
      console.error('Failed to fetch module data:', error);
      // Use demo data
      setModule(getDemoModule());
      setProgress({
        status: 'in_progress',
        progress: 30,
        currentContentIndex: 0,
        completedExercises: [],
        exerciseResults: {},
        bestScore: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const getDemoModule = (): TrainingModule => ({
    id: 'privacy-fundamentals',
    title: 'Privacy Fundamentals',
    description: 'Core concepts of data privacy, GDPR basics, and privacy-by-design principles',
    category: 'Foundations',
    difficulty: 'beginner',
    estimatedDuration: 45,
    objectives: [
      'Understand key privacy concepts and terminology',
      'Learn the principles of GDPR and data protection',
      'Apply privacy-by-design in daily work',
      'Identify personal data and sensitive information'
    ],
    content: [
      {
        id: 'pf-content-1',
        type: 'text',
        title: 'Introduction to Data Privacy',
        content: `
# Introduction to Data Privacy

Data privacy is the right of individuals to control how their personal information is collected, used, and shared.

## Key Concepts

- **Personal Data**: Any information relating to an identified or identifiable natural person
- **Data Subject**: The individual whose data is being processed
- **Data Controller**: Entity that determines purposes and means of processing
- **Data Processor**: Entity that processes data on behalf of the controller

## Why Privacy Matters

1. Legal compliance (GDPR, CCPA, etc.)
2. Customer trust and reputation
3. Ethical responsibility
4. Competitive advantage

### Real-World Impact

Organizations that prioritize privacy see:
- 40% higher customer trust scores
- Reduced regulatory fines
- Better data quality
- Enhanced brand reputation
        `,
        duration: 10,
        order: 1
      },
      {
        id: 'pf-content-2',
        type: 'interactive',
        title: 'GDPR Principles Interactive Guide',
        content: 'interactive:gdpr-principles',
        duration: 15,
        order: 2
      },
      {
        id: 'pf-content-3',
        type: 'video',
        title: 'Privacy by Design in Practice',
        content: 'https://example.com/videos/privacy-by-design.mp4',
        duration: 20,
        order: 3
      }
    ],
    exercises: [
      {
        id: 'pf-ex-1',
        type: 'multiple_choice',
        title: 'Identifying Personal Data',
        description: 'Determine which data elements qualify as personal data',
        difficulty: 'beginner',
        instructions: 'Select all items that qualify as personal data under GDPR',
        data: {
          options: [
            { id: 'a', text: 'Email address: john.doe@company.com', isPersonalData: true },
            { id: 'b', text: 'Aggregated sales statistics', isPersonalData: false },
            { id: 'c', text: 'IP address: 192.168.1.1', isPersonalData: true },
            { id: 'd', text: 'Company name: Acme Corp', isPersonalData: false },
            { id: 'e', text: 'Cookie identifier: abc123xyz', isPersonalData: true }
          ]
        },
        hints: ['Personal data can identify a person directly or indirectly', 'Even pseudonymous data can be personal data'],
        points: 10,
        feedback: {
          correct: 'Excellent! You correctly identified all personal data elements.',
          incorrect: 'Remember: any data that can identify a person (directly or indirectly) is personal data.'
        }
      },
      {
        id: 'pf-ex-2',
        type: 'scenario',
        title: 'Privacy Scenario: Data Collection',
        description: 'Navigate a realistic data collection scenario',
        difficulty: 'intermediate',
        scenario: 'Your marketing team wants to collect customer email addresses for a newsletter. They plan to use a simple form without any consent explanation.',
        instructions: 'Answer the questions to navigate this scenario correctly',
        data: {
          steps: [
            {
              id: 1,
              question: 'What is the primary privacy concern with this approach?',
              options: [
                'No legal basis for processing',
                'No privacy notice or consent',
                'Both A and B',
                'No concern - email collection is always allowed'
              ],
              correct: 2
            },
            {
              id: 2,
              question: 'What should be added to make this compliant?',
              options: [
                'A checkbox for consent',
                'A privacy notice explaining the purpose',
                'An unsubscribe link',
                'All of the above'
              ],
              correct: 3
            }
          ]
        },
        hints: ['Consider GDPR requirements for consent', 'Transparency is key'],
        points: 15,
        feedback: {
          correct: 'Great job! You understand the requirements for lawful data collection.',
          incorrect: 'Review the GDPR consent requirements and transparency principles.'
        }
      }
    ],
    assessment: {
      id: 'pf-assessment',
      title: 'Privacy Fundamentals Assessment',
      description: 'Test your understanding of privacy fundamentals',
      timeLimit: 20,
      passingScore: 70,
      randomizeQuestions: true,
      showResultsImmediately: true,
      allowReview: true,
      questions: [
        {
          id: 'pf-q1',
          type: 'multiple_choice',
          question: 'What is the primary purpose of GDPR?',
          options: [
            { id: 'a', text: 'To protect businesses from data breaches' },
            { id: 'b', text: 'To give individuals control over their personal data' },
            { id: 'c', text: 'To create a unified market for data sales' },
            { id: 'd', text: 'To eliminate cross-border data transfers' }
          ],
          points: 5,
          difficulty: 'beginner',
          category: 'GDPR Basics'
        },
        {
          id: 'pf-q2',
          type: 'multiple_select',
          question: 'Which of the following are GDPR principles? (Select all that apply)',
          options: [
            { id: 'a', text: 'Accuracy' },
            { id: 'b', text: 'Storage limitation' },
            { id: 'c', text: 'Profit maximization' },
            { id: 'd', text: 'Purpose limitation' },
            { id: 'e', text: 'Data minimization' }
          ],
          points: 10,
          difficulty: 'intermediate',
          category: 'GDPR Basics'
        },
        {
          id: 'pf-q3',
          type: 'true_false',
          question: 'Pseudonymized data is no longer considered personal data under GDPR.',
          options: [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' }
          ],
          points: 5,
          difficulty: 'intermediate',
          category: 'Data Classification'
        }
      ]
    },
    passingScore: 70
  });

  const updateProgress = async (contentIndex?: number, timeSpent?: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_BASE}/training/progress/${moduleId}`, {
        contentIndex,
        timeSpent
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  };

  const handleContentNavigation = (direction: 'next' | 'prev') => {
    if (!module) return;
    
    const newIndex = direction === 'next' 
      ? Math.min(currentContentIndex + 1, module.content.length - 1)
      : Math.max(currentContentIndex - 1, 0);
    
    setCurrentContentIndex(newIndex);
    updateProgress(newIndex, 1);
  };

  const submitExercise = async () => {
    if (!module || !module.exercises[currentExerciseIndex]) return;
    
    const exercise = module.exercises[currentExerciseIndex];
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE}/training/exercises/submit`, {
        moduleId: module.id,
        exerciseId: exercise.id,
        answers: exerciseAnswers
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setExerciseResult(response.data.data);
    } catch (error) {
      console.error('Failed to submit exercise:', error);
      // Demo result
      const score = exercise.type === 'multiple_choice' 
        ? Math.random() > 0.3 ? exercise.points : exercise.points * 0.5
        : exercise.points * 0.8;
      
      setExerciseResult({
        score,
        maxScore: exercise.points,
        passed: score >= exercise.points * 0.7,
        feedback: score >= exercise.points * 0.7 ? exercise.feedback.correct : exercise.feedback.incorrect
      });
    }
  };

  const startAssessment = async () => {
    if (!module) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE}/training/assessment/start`, {
        moduleId: module.id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAssessmentAttempt(response.data.data.attempt);
      setAssessmentTimer(module.assessment.timeLimit * 60);
      setAssessmentStarted(true);
    } catch (error) {
      console.error('Failed to start assessment:', error);
      // Demo mode
      setAssessmentAttempt({ id: 'demo-attempt', attemptNumber: 1 });
      setAssessmentTimer(module.assessment.timeLimit * 60);
      setAssessmentStarted(true);
    }
  };

  const submitAssessment = async () => {
    if (!module || !assessmentAttempt) return;
    
    try {
      const token = localStorage.getItem('token');
      const timeSpent = module.assessment.timeLimit * 60 - (assessmentTimer || 0);
      
      const response = await axios.post(`${API_BASE}/training/assessment/submit`, {
        moduleId: module.id,
        attemptId: assessmentAttempt.id,
        answers: assessmentAnswers,
        timeSpent
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAssessmentResult(response.data.data);
      setAssessmentSubmitted(true);
    } catch (error) {
      console.error('Failed to submit assessment:', error);
      // Demo result
      const score = 60 + Math.random() * 35;
      setAssessmentResult({
        score: Math.round(score),
        passed: score >= module.passingScore,
        questionResults: module.assessment.questions.map(q => ({
          questionId: q.id,
          isCorrect: Math.random() > 0.3,
          points: Math.random() > 0.3 ? q.points : 0,
          maxPoints: q.points
        }))
      });
      setAssessmentSubmitted(true);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderContent = () => {
    if (!module || !module.content[currentContentIndex]) return null;
    
    const content = module.content[currentContentIndex];
    
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          {content.type === 'video' ? <Video className="w-4 h-4" /> : 
           content.type === 'interactive' ? <PlayCircle className="w-4 h-4" /> : 
           <FileText className="w-4 h-4" />}
          <span>{content.type.charAt(0).toUpperCase() + content.type.slice(1)}</span>
          <span>•</span>
          <span>{content.duration} min</span>
        </div>
        
        <h2 className="text-xl font-bold text-gray-900 mb-4">{content.title}</h2>
        
        {content.type === 'text' && (
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-gray-700">{content.content}</pre>
          </div>
        )}
        
        {content.type === 'video' && (
          <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Video className="w-12 h-12 mx-auto mb-2" />
              <p>Video content placeholder</p>
              <p className="text-sm">{content.content}</p>
            </div>
          </div>
        )}
        
        {content.type === 'interactive' && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6">
            <div className="text-center">
              <PlayCircle className="w-12 h-12 mx-auto mb-2 text-blue-600" />
              <h3 className="font-semibold text-gray-900 mb-2">Interactive Component</h3>
              <p className="text-gray-600">This interactive element would load here</p>
            </div>
          </div>
        )}
        
        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={() => handleContentNavigation('prev')}
            disabled={currentContentIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <span className="text-sm text-gray-500">
            {currentContentIndex + 1} of {module.content.length}
          </span>
          
          <button
            onClick={() => handleContentNavigation('next')}
            disabled={currentContentIndex === module.content.length - 1}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderExercise = () => {
    if (!module || !module.exercises[currentExerciseIndex]) return null;
    
    const exercise = module.exercises[currentExerciseIndex];
    
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              exercise.difficulty === 'beginner' ? 'bg-green-100 text-green-800' :
              exercise.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
              'bg-orange-100 text-orange-800'
            }`}>
              {exercise.difficulty}
            </span>
            <span className="text-sm text-gray-500">{exercise.points} points</span>
          </div>
          {progress?.completedExercises.includes(exercise.id) && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              Completed
            </span>
          )}
        </div>
        
        <h2 className="text-xl font-bold text-gray-900 mb-2">{exercise.title}</h2>
        <p className="text-gray-600 mb-4">{exercise.description}</p>
        
        {exercise.scenario && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-blue-900 mb-2">Scenario</h4>
            <p className="text-blue-800">{exercise.scenario}</p>
          </div>
        )}
        
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-gray-900 mb-2">Instructions</h4>
          <p className="text-gray-700">{exercise.instructions}</p>
        </div>
        
        {/* Exercise Content */}
        {!exerciseResult && (
          <>
            {exercise.type === 'multiple_choice' && (
              <div className="space-y-2">
                {exercise.data.options.map((option: any) => (
                  <label
                    key={option.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      exerciseAnswers.selected === option.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={exerciseAnswers.selected?.includes(option.id)}
                      onChange={(e) => {
                        const selected = exerciseAnswers.selected || [];
                        if (e.target.checked) {
                          setExerciseAnswers({ selected: [...selected, option.id] });
                        } else {
                          setExerciseAnswers({ selected: selected.filter((id: string) => id !== option.id) });
                        }
                      }}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-gray-700">{option.text}</span>
                  </label>
                ))}
              </div>
            )}
            
            {exercise.type === 'scenario' && (
              <div className="space-y-6">
                {exercise.data.steps.map((step: any, index: number) => (
                  <div key={step.id} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">
                      Step {index + 1}: {step.question}
                    </h4>
                    <div className="space-y-2">
                      {step.options.map((option: string, optIndex: number) => (
                        <label
                          key={optIndex}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            exerciseAnswers[step.id] === optIndex
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name={step.id}
                            checked={exerciseAnswers[step.id] === optIndex}
                            onChange={() => setExerciseAnswers({ ...exerciseAnswers, [step.id]: optIndex })}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-gray-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Hints */}
            <div className="mt-4">
              <button
                onClick={() => setShowExerciseHint(!showExerciseHint)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <Lightbulb className="w-4 h-4" />
                {showExerciseHint ? 'Hide Hints' : 'Show Hints'}
              </button>
              
              {showExerciseHint && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                >
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {exercise.hints.map((hint, index) => (
                      <li key={index}>• {hint}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </div>
            
            {/* Submit Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={submitExercise}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Send className="w-4 h-4" />
                Submit Answer
              </button>
            </div>
          </>
        )}
        
        {/* Result */}
        {exerciseResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-4 rounded-lg ${
              exerciseResult.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {exerciseResult.passed ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={`font-medium ${exerciseResult.passed ? 'text-green-800' : 'text-red-800'}`}>
                {exerciseResult.passed ? 'Correct!' : 'Not quite right'}
              </span>
            </div>
            <p className={`text-sm ${exerciseResult.passed ? 'text-green-700' : 'text-red-700'}`}>
              {exerciseResult.feedback}
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Score: {exerciseResult.score}/{exerciseResult.maxScore} points
            </p>
            
            <button
              onClick={() => {
                setExerciseResult(null);
                setExerciseAnswers({});
                setShowExerciseHint(false);
              }}
              className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <RotateCcw className="w-4 h-4" />
              Try Again
            </button>
          </motion.div>
        )}
        
        {/* Exercise Navigation */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={() => {
              setCurrentExerciseIndex(Math.max(0, currentExerciseIndex - 1));
              setExerciseResult(null);
              setExerciseAnswers({});
            }}
            disabled={currentExerciseIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous Exercise
          </button>
          
          <span className="text-sm text-gray-500">
            {currentExerciseIndex + 1} of {module.exercises.length}
          </span>
          
          <button
            onClick={() => {
              setCurrentExerciseIndex(Math.min(module.exercises.length - 1, currentExerciseIndex + 1));
              setExerciseResult(null);
              setExerciseAnswers({});
            }}
            disabled={currentExerciseIndex === module.exercises.length - 1}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            Next Exercise
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderAssessment = () => {
    if (!module) return null;
    
    if (!assessmentStarted) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{module.assessment.title}</h2>
          <p className="text-gray-600 mb-6">{module.assessment.description}</p>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Timer className="w-4 h-4" />
                <span className="text-sm">Time Limit</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">{module.assessment.timeLimit} minutes</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Award className="w-4 h-4" />
                <span className="text-sm">Passing Score</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">{module.assessment.passingScore}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm">Questions</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">{module.assessment.questions.length}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">Attempts</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">Unlimited</p>
            </div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-yellow-800 mb-2">Before You Begin</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Make sure you have enough time to complete the assessment</li>
              <li>• You cannot pause once started</li>
              <li>• Review your answers before submitting</li>
            </ul>
          </div>
          
          <button
            onClick={startAssessment}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Start Assessment
          </button>
        </div>
      );
    }
    
    if (assessmentSubmitted && assessmentResult) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center mb-6">
            {assessmentResult.passed ? (
              <>
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Congratulations!</h2>
                <p className="text-gray-600">You passed the assessment</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-10 h-10 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Not Quite</h2>
                <p className="text-gray-600">You need {module.assessment.passingScore}% to pass</p>
              </>
            )}
          </div>
          
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Your Score</p>
              <p className={`text-4xl font-bold ${assessmentResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                {assessmentResult.score}%
              </p>
            </div>
          </div>
          
          {assessmentResult.passed && assessmentResult.certificate && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-yellow-800 mb-2">Certificate Earned!</h4>
              <p className="text-sm text-yellow-700 mb-2">
                Verification Code: {assessmentResult.certificate.verificationCode}
              </p>
              <button
                onClick={() => navigate('/training')}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                View Certificate →
              </button>
            </div>
          )}
          
          <div className="flex gap-4">
            <button
              onClick={() => {
                setAssessmentStarted(false);
                setAssessmentSubmitted(false);
                setAssessmentResult(null);
                setAssessmentAnswers({});
              }}
              className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Retake Assessment
            </button>
            <button
              onClick={() => navigate('/training')}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Training
            </button>
          </div>
        </div>
      );
    }
    
    // Assessment in progress
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Timer */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{module.assessment.title}</h2>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
            (assessmentTimer || 0) < 300 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
          }`}>
            <Timer className="w-4 h-4" />
            <span className="font-mono font-medium">{formatTime(assessmentTimer || 0)}</span>
          </div>
        </div>
        
        {/* Questions */}
        <div className="space-y-6">
          {module.assessment.questions.map((question, index) => (
            <div key={question.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm text-gray-500">Question {index + 1}</span>
                <span className="text-sm text-gray-500">{question.points} points</span>
              </div>
              
              <p className="font-medium text-gray-900 mb-4">{question.question}</p>
              
              {question.type === 'multiple_choice' && question.options && (
                <div className="space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        assessmentAnswers[question.id] === option.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={assessmentAnswers[question.id] === option.id}
                        onChange={() => setAssessmentAnswers({ ...assessmentAnswers, [question.id]: option.id })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-gray-700">{option.text}</span>
                    </label>
                  ))}
                </div>
              )}
              
              {question.type === 'multiple_select' && question.options && (
                <div className="space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        assessmentAnswers[question.id]?.includes(option.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={assessmentAnswers[question.id]?.includes(option.id)}
                        onChange={(e) => {
                          const selected = assessmentAnswers[question.id] || [];
                          if (e.target.checked) {
                            setAssessmentAnswers({ ...assessmentAnswers, [question.id]: [...selected, option.id] });
                          } else {
                            setAssessmentAnswers({ ...assessmentAnswers, [question.id]: selected.filter((id: string) => id !== option.id) });
                          }
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-gray-700">{option.text}</span>
                    </label>
                  ))}
                </div>
              )}
              
              {question.type === 'true_false' && question.options && (
                <div className="flex gap-4">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        assessmentAnswers[question.id] === option.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={assessmentAnswers[question.id] === option.id}
                        onChange={() => setAssessmentAnswers({ ...assessmentAnswers, [question.id]: option.id })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-gray-700">{option.text}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Submit Button */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={submitAssessment}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Submit Assessment
          </button>
          <p className="text-center text-sm text-gray-500 mt-2">
            {Object.keys(assessmentAnswers).length} of {module.assessment.questions.length} questions answered
          </p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Module not found</h2>
        <button onClick={() => navigate('/training')} className="text-blue-600 hover:text-blue-700">
          Return to Training
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/training')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{module.title}</h1>
          <p className="text-gray-600">{module.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-500">{module.estimatedDuration} min</span>
        </div>
      </div>

      {/* Progress Bar */}
      {progress && (
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-500">{Math.round(progress.progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveSection('content')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeSection === 'content'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BookOpen className="w-4 h-4 inline-block mr-2" />
              Content ({module.content.length})
            </button>
            <button
              onClick={() => setActiveSection('exercises')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeSection === 'exercises'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <PlayCircle className="w-4 h-4 inline-block mr-2" />
              Exercises ({module.exercises.length})
            </button>
            <button
              onClick={() => setActiveSection('assessment')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeSection === 'assessment'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Award className="w-4 h-4 inline-block mr-2" />
              Assessment
            </button>
          </nav>
        </div>
        
        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeSection === 'content' && (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {renderContent()}
              </motion.div>
            )}
            
            {activeSection === 'exercises' && (
              <motion.div
                key="exercises"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {renderExercise()}
              </motion.div>
            )}
            
            {activeSection === 'assessment' && (
              <motion.div
                key="assessment"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {renderAssessment()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Learning Objectives */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Learning Objectives</h3>
        <ul className="space-y-2">
          {module.objectives.map((objective, index) => (
            <li key={index} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <span className="text-gray-700">{objective}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default TrainingModulePage;
