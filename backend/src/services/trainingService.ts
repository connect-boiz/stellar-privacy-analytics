import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Types and Interfaces
export type UserRole = 'admin' | 'analyst' | 'developer' | 'data_steward' | 'compliance_officer' | 'end_user';
export type TrainingStatus = 'not_started' | 'in_progress' | 'completed' | 'expired';
export type ExerciseType = 'multiple_choice' | 'simulation' | 'drag_drop' | 'scenario' | 'code_review' | 'interactive';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: DifficultyLevel;
  estimatedDuration: number; // in minutes
  targetRoles: UserRole[];
  prerequisites: string[];
  objectives: string[];
  content: TrainingContent[];
  exercises: Exercise[];
  assessment: Assessment;
  passingScore: number;
  maxAttempts: number;
  version: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface TrainingContent {
  id: string;
  type: 'video' | 'text' | 'interactive' | 'presentation';
  title: string;
  content: string;
  duration: number;
  order: number;
  resources?: Resource[];
}

export interface Resource {
  id: string;
  title: string;
  type: 'pdf' | 'link' | 'document' | 'video';
  url: string;
}

export interface Exercise {
  id: string;
  type: ExerciseType;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  scenario?: string;
  instructions: string;
  data?: any;
  expectedOutput?: any;
  hints: string[];
  points: number;
  timeLimit?: number; // in seconds
  feedback: {
    correct: string;
    incorrect: string;
    partial?: string;
  };
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  timeLimit: number; // in minutes
  passingScore: number;
  questions: AssessmentQuestion[];
  randomizeQuestions: boolean;
  showResultsImmediately: boolean;
  allowReview: boolean;
}

export interface AssessmentQuestion {
  id: string;
  type: 'multiple_choice' | 'multiple_select' | 'true_false' | 'fill_blank' | 'matching' | 'ordering';
  question: string;
  options?: AssessmentOption[];
  correctAnswer: any;
  explanation: string;
  points: number;
  difficulty: DifficultyLevel;
  category: string;
}

export interface AssessmentOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface UserTrainingProgress {
  id: string;
  userId: string;
  moduleId: string;
  status: TrainingStatus;
  progress: number; // percentage
  currentContentIndex: number;
  completedExercises: string[];
  exerciseResults: Map<string, ExerciseResult>;
  assessmentAttempts: AssessmentAttempt[];
  bestScore: number;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  certificateId?: string;
  timeSpent: number; // in minutes
  lastAccessedAt: Date;
}

export interface ExerciseResult {
  exerciseId: string;
  score: number;
  maxScore: number;
  passed: boolean;
  attempts: number;
  completedAt: Date;
  answers: any;
  feedback?: string;
}

export interface AssessmentAttempt {
  id: string;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  answers: Map<string, any>;
  score: number;
  passed: boolean;
  timeSpent: number;
  questionResults: QuestionResult[];
}

export interface QuestionResult {
  questionId: string;
  answer: any;
  isCorrect: boolean;
  points: number;
  maxPoints: number;
  timeSpent: number;
}

export interface Certificate {
  id: string;
  userId: string;
  moduleId: string;
  moduleName: string;
  userName: string;
  issuedAt: Date;
  expiresAt: Date;
  score: number;
  certificateUrl: string;
  verificationCode: string;
  isValid: boolean;
}

export interface TrainingAnalytics {
  moduleId: string;
  totalEnrollments: number;
  completions: number;
  completionRate: number;
  averageScore: number;
  averageTimeSpent: number;
  passRate: number;
  dropOffPoints: { contentId: string; dropOffRate: number }[];
  exerciseStats: { exerciseId: string; averageScore: number; attemptRate: number }[];
  questionStats: { questionId: string; correctRate: number; averageTime: number }[];
  roleBreakdown: { role: UserRole; count: number; completionRate: number }[];
}

// In-memory storage (would be database in production)
const trainingModules: Map<string, TrainingModule> = new Map();
const userProgress: Map<string, UserTrainingProgress> = new Map();
const certificates: Map<string, Certificate> = new Map();

// Initialize with default privacy training modules
function initializeDefaultModules() {
  const modules: Partial<TrainingModule>[] = [
    {
      id: 'privacy-fundamentals',
      title: 'Privacy Fundamentals',
      description: 'Core concepts of data privacy, GDPR basics, and privacy-by-design principles',
      category: 'Foundations',
      difficulty: 'beginner',
      estimatedDuration: 45,
      targetRoles: ['admin', 'analyst', 'developer', 'data_steward', 'compliance_officer', 'end_user'],
      prerequisites: [],
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
          instructions: 'Identify the privacy issues and recommend the correct approach',
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
            correctAnswer: 'b',
            explanation: 'GDPR aims to give individuals control over their personal data and simplify the regulatory environment for international business.',
            points: 5,
            difficulty: 'beginner',
            category: 'GDPR Basics'
          },
          {
            id: 'pf-q2',
            type: 'multiple_select',
            question: 'Which of the following are GDPR principles? (Select all that apply)',
            options: [
              { id: 'a', text: 'Accuracy', isCorrect: true },
              { id: 'b', text: 'Storage limitation', isCorrect: true },
              { id: 'c', text: 'Profit maximization', isCorrect: false },
              { id: 'd', text: 'Purpose limitation', isCorrect: true },
              { id: 'e', text: 'Data minimization', isCorrect: true }
            ],
            correctAnswer: ['a', 'b', 'd', 'e'],
            explanation: 'GDPR principles include lawfulness, fairness, transparency, accuracy, storage limitation, purpose limitation, data minimization, and integrity/confidentiality.',
            points: 10,
            difficulty: 'intermediate',
            category: 'GDPR Basics'
          },
          {
            id: 'pf-q3',
            type: 'true_false',
            question: 'Pseudonymized data is no longer considered personal data under GDPR.',
            correctAnswer: false,
            explanation: 'Pseudonymized data is still personal data under GDPR because it can be attributed to a natural person with additional information.',
            points: 5,
            difficulty: 'intermediate',
            category: 'Data Classification'
          }
        ]
      },
      passingScore: 70,
      maxAttempts: 3,
      version: '1.0.0',
      isActive: true,
      createdBy: 'system'
    },
    {
      id: 'differential-privacy-deep-dive',
      title: 'Differential Privacy Deep Dive',
      description: 'Advanced techniques for implementing differential privacy in analytics workflows',
      category: 'Advanced Techniques',
      difficulty: 'advanced',
      estimatedDuration: 90,
      targetRoles: ['developer', 'analyst', 'data_steward'],
      prerequisites: ['privacy-fundamentals'],
      objectives: [
        'Understand the mathematical foundations of differential privacy',
        'Implement epsilon and delta parameters correctly',
        'Apply differential privacy to real-world analytics queries',
        'Balance privacy and utility trade-offs'
      ],
      content: [
        {
          id: 'dp-content-1',
          type: 'text',
          title: 'Mathematical Foundations',
          content: `
            # Differential Privacy: Mathematical Foundations
            
            Differential privacy provides a mathematically rigorous definition of privacy guarantees.
            
            ## Formal Definition
            
            A randomized algorithm M is (ε, δ)-differentially private if for all datasets D1 and D2 differing on at most one element:
            
            Pr[M(D1) ∈ S] ≤ e^ε × Pr[M(D2) ∈ S] + δ
            
            ## Key Parameters
            
            - **ε (epsilon)**: Privacy loss parameter. Lower = more privacy
            - **δ (delta)**: Probability of privacy failure. Should be cryptographically small
            - **Sensitivity**: Maximum impact of one record on the query output
          `,
          duration: 25,
          order: 1
        }
      ],
      exercises: [
        {
          id: 'dp-ex-1',
          type: 'code_review',
          title: 'Differential Privacy Implementation Review',
          description: 'Review and fix a differential privacy implementation',
          difficulty: 'advanced',
          instructions: 'Identify and fix the issues in this differential privacy implementation',
          data: {
            code: `
// Count query with differential privacy
function privateCount(data, epsilon) {
  const count = data.length;
  const noise = laplaceSample(1/epsilon); // Sensitivity = 1
  return count + noise;
}

// Average query with differential privacy
function privateAverage(data, epsilon) {
  const sum = data.reduce((a, b) => a + b, 0);
  const avg = sum / data.length;
  const noise = laplaceSample(1/epsilon);
  return avg + noise;
}
            `,
            issues: [
              'The average query sensitivity is incorrect',
              'No bounds clamping for average',
              'Epsilon is not properly scaled'
            ]
          },
          hints: ['Consider the sensitivity of average queries', 'Think about bounded vs unbounded data'],
          points: 20,
          feedback: {
            correct: 'Excellent! You identified all the implementation issues.',
            incorrect: 'Review the sensitivity calculations for different query types.'
          }
        },
        {
          id: 'dp-ex-2',
          type: 'simulation',
          title: 'Privacy Budget Simulator',
          description: 'Simulate privacy budget consumption across multiple queries',
          difficulty: 'advanced',
          scenario: 'You have a total privacy budget of ε=1.0. Plan the allocation for the following analytics queries while maintaining useful results.',
          instructions: 'Allocate epsilon values to each query type to balance privacy and utility',
          data: {
            totalBudget: 1.0,
            queries: [
              { type: 'count', priority: 'high', suggestedEpsilon: 0.1 },
              { type: 'histogram', priority: 'medium', suggestedEpsilon: 0.3 },
              { type: 'average', priority: 'medium', suggestedEpsilon: 0.2 },
              { type: 'variance', priority: 'low', suggestedEpsilon: 0.15 }
            ]
          },
          hints: ['Higher priority queries may need more budget', 'Consider composition theorems'],
          points: 25,
          feedback: {
            correct: 'Great budget allocation! You balanced privacy and utility well.',
            incorrect: 'Consider the privacy-utility trade-off and composition properties.'
          }
        }
      ],
      assessment: {
        id: 'dp-assessment',
        title: 'Differential Privacy Assessment',
        description: 'Demonstrate your understanding of differential privacy',
        timeLimit: 30,
        passingScore: 75,
        randomizeQuestions: true,
        showResultsImmediately: true,
        allowReview: true,
        questions: [
          {
            id: 'dp-q1',
            type: 'multiple_choice',
            question: 'What happens to privacy guarantees when epsilon decreases?',
            options: [
              { id: 'a', text: 'Privacy increases, utility decreases' },
              { id: 'b', text: 'Privacy decreases, utility increases' },
              { id: 'c', text: 'Both privacy and utility increase' },
              { id: 'd', text: 'Both privacy and utility decrease' }
            ],
            correctAnswer: 'a',
            explanation: 'Lower epsilon means stronger privacy guarantees but more noise, reducing utility.',
            points: 10,
            difficulty: 'intermediate',
            category: 'Privacy-Utility Trade-off'
          },
          {
            id: 'dp-q2',
            type: 'fill_blank',
            question: 'The composition theorem states that running k (ε, δ)-DP mechanisms sequentially results in ___-DP.',
            correctAnswer: '(kε, kδ)',
            explanation: 'Basic composition: privacy losses add up across multiple queries.',
            points: 15,
            difficulty: 'advanced',
            category: 'Composition'
          }
        ]
      },
      passingScore: 75,
      maxAttempts: 3,
      version: '1.0.0',
      isActive: true,
      createdBy: 'system'
    },
    {
      id: 'data-handling-procedures',
      title: 'Data Handling Procedures',
      description: 'Best practices for handling sensitive data throughout its lifecycle',
      category: 'Operational',
      difficulty: 'intermediate',
      estimatedDuration: 60,
      targetRoles: ['admin', 'analyst', 'data_steward', 'compliance_officer'],
      prerequisites: ['privacy-fundamentals'],
      objectives: [
        'Apply proper data classification procedures',
        'Implement secure data handling workflows',
        'Understand data retention requirements',
        'Execute data subject access requests'
      ],
      content: [
        {
          id: 'dh-content-1',
          type: 'text',
          title: 'Data Classification Framework',
          content: `
            # Data Classification Framework
            
            ## Classification Levels
            
            ### Level 1: Public
            - No restrictions on disclosure
            - Examples: Published reports, marketing materials
            
            ### Level 2: Internal
            - Limited to internal use
            - Examples: Internal memos, organizational charts
            
            ### Level 3: Confidential
            - Business sensitive
            - Examples: Financial data, strategic plans
            
            ### Level 4: Restricted
            - Personal or highly sensitive
            - Examples: PII, health records, financial records
          `,
          duration: 15,
          order: 1
        }
      ],
      exercises: [
        {
          id: 'dh-ex-1',
          type: 'drag_drop',
          title: 'Data Classification Exercise',
          description: 'Classify data items by dragging them to the correct category',
          difficulty: 'intermediate',
          instructions: 'Drag each data item to its appropriate classification level',
          data: {
            items: [
              { id: 'item1', text: 'Employee SSN', correctLevel: 'restricted' },
              { id: 'item2', text: 'Company logo', correctLevel: 'public' },
              { id: 'item3', text: 'Customer email list', correctLevel: 'restricted' },
              { id: 'item4', text: 'Quarterly earnings report (public)', correctLevel: 'public' },
              { id: 'item5', text: 'Internal meeting notes', correctLevel: 'internal' },
              { id: 'item6', text: 'Product roadmap', correctLevel: 'confidential' }
            ],
            categories: ['public', 'internal', 'confidential', 'restricted']
          },
          hints: ['Consider who should have access to each data type', 'Think about the impact of disclosure'],
          points: 15,
          feedback: {
            correct: 'Perfect classification! You understand data sensitivity levels.',
            incorrect: 'Review the classification criteria for each level.'
          }
        },
        {
          id: 'dh-ex-2',
          type: 'scenario',
          title: 'DSAR Processing Simulation',
          description: 'Process a Data Subject Access Request correctly',
          difficulty: 'intermediate',
          scenario: 'A customer submits a DSAR requesting all data you hold about them. They also request deletion of specific marketing data.',
          instructions: 'Follow the correct procedure for handling this request',
          data: {
            steps: [
              {
                id: 1,
                question: 'What is your first step upon receiving the DSAR?',
                options: [
                  'Immediately delete all their data',
                  'Verify the identity of the requester',
                  'Forward to legal department',
                  'Reject the request as too broad'
                ],
                correct: 1
              },
              {
                id: 2,
                question: 'How long do you have to respond to the DSAR under GDPR?',
                options: [
                  '7 days',
                  '30 days',
                  '60 days',
                  '90 days'
                ],
                correct: 1
              },
              {
                id: 3,
                question: 'What should you provide in response?',
                options: [
                  'Only data from the last year',
                  'A summary of data categories',
                  'A copy of all personal data in a portable format',
                  'Confirmation that data exists'
                ],
                correct: 2
              }
            ]
          },
          hints: ['Identity verification is crucial', 'GDPR has specific timelines'],
          points: 20,
          feedback: {
            correct: 'Excellent DSAR handling! You followed proper procedures.',
            incorrect: 'Review GDPR Article 15 and Article 17 requirements.'
          }
        }
      ],
      assessment: {
        id: 'dh-assessment',
        title: 'Data Handling Assessment',
        description: 'Test your knowledge of data handling procedures',
        timeLimit: 25,
        passingScore: 70,
        randomizeQuestions: true,
        showResultsImmediately: true,
        allowReview: true,
        questions: [
          {
            id: 'dh-q1',
            type: 'multiple_choice',
            question: 'What is the minimum retention period for GDPR compliance records?',
            options: [
              { id: 'a', text: '1 year' },
              { id: 'b', text: '3 years' },
              { id: 'c', text: '5 years' },
              { id: 'd', text: 'Depends on the data type and purpose' }
            ],
            correctAnswer: 'd',
            explanation: 'Retention periods depend on the purpose of processing and legal requirements.',
            points: 10,
            difficulty: 'intermediate',
            category: 'Data Retention'
          }
        ]
      },
      passingScore: 70,
      maxAttempts: 3,
      version: '1.0.0',
      isActive: true,
      createdBy: 'system'
    },
    {
      id: 'incident-response',
      title: 'Privacy Incident Response',
      description: 'How to detect, respond to, and report privacy incidents and data breaches',
      category: 'Security',
      difficulty: 'intermediate',
      estimatedDuration: 75,
      targetRoles: ['admin', 'compliance_officer', 'data_steward'],
      prerequisites: ['privacy-fundamentals', 'data-handling-procedures'],
      objectives: [
        'Identify and classify privacy incidents',
        'Execute incident response procedures',
        'Understand breach notification requirements',
        'Document and report incidents properly'
      ],
      content: [
        {
          id: 'ir-content-1',
          type: 'text',
          title: 'Incident Response Framework',
          content: `
            # Privacy Incident Response Framework
            
            ## Incident Classification
            
            ### Severity Levels
            - **Critical**: Large-scale breach, high-risk data exposed
            - **High**: Significant breach, sensitive data at risk
            - **Medium**: Limited breach, contained impact
            - **Low**: Minor incident, minimal exposure
            
            ## Response Phases
            
            1. **Detection**: Identify potential incident
            2. **Containment**: Limit the spread/impact
            3. **Investigation**: Determine scope and cause
            4. **Remediation**: Fix vulnerabilities
            5. **Notification**: Inform required parties
            6. **Documentation**: Record all actions
          `,
          duration: 20,
          order: 1
        }
      ],
      exercises: [
        {
          id: 'ir-ex-1',
          type: 'simulation',
          title: 'Breach Response Simulation',
          description: 'Navigate a simulated data breach scenario',
          difficulty: 'intermediate',
          scenario: 'Your security team has detected unauthorized access to a database containing customer PII. Approximately 10,000 records may have been accessed.',
          instructions: 'Make the correct decisions at each stage of the incident response',
          data: {
            stages: [
              {
                id: 'containment',
                title: 'Containment Phase',
                question: 'What is your immediate action?',
                options: [
                  { id: 'a', text: 'Shut down all systems', consequence: 'Causes unnecessary business disruption' },
                  { id: 'b', text: 'Revoke compromised credentials and isolate affected systems', consequence: 'Correct - limits further damage' },
                  { id: 'c', text: 'Wait for more information', consequence: 'Allows potential ongoing breach' },
                  { id: 'd', text: 'Notify all customers immediately', consequence: 'Premature without full investigation' }
                ],
                correct: 'b'
              },
              {
                id: 'notification',
                title: 'Notification Decision',
                question: 'Under GDPR, when must you notify the supervisory authority?',
                options: [
                  { id: 'a', text: 'Within 24 hours' },
                  { id: 'b', text: 'Within 72 hours' },
                  { id: 'c', text: 'Within 7 days' },
                  { id: 'd', text: 'Only if customer data is involved' }
                ],
                correct: 'b'
              }
            ]
          },
          hints: ['Speed is critical but accuracy matters', 'Consider regulatory requirements'],
          points: 25,
          feedback: {
            correct: 'Excellent incident response! You minimized damage and met compliance requirements.',
            incorrect: 'Review GDPR breach notification requirements and incident response best practices.'
          }
        }
      ],
      assessment: {
        id: 'ir-assessment',
        title: 'Incident Response Assessment',
        description: 'Demonstrate your incident response knowledge',
        timeLimit: 30,
        passingScore: 75,
        randomizeQuestions: true,
        showResultsImmediately: true,
        allowReview: true,
        questions: [
          {
            id: 'ir-q1',
            type: 'multiple_choice',
            question: 'What information must be included in a breach notification to the supervisory authority?',
            options: [
              { id: 'a', text: 'Only the number of affected individuals' },
              { id: 'b', text: 'Nature of breach, categories and approximate number of individuals, DPO contact, consequences, measures taken' },
              { id: 'c', text: 'Only technical details of the breach' },
              { id: 'd', text: 'Names of all affected individuals' }
            ],
            correctAnswer: 'b',
            explanation: 'GDPR Article 33 requires specific information in breach notifications.',
            points: 15,
            difficulty: 'intermediate',
            category: 'Breach Notification'
          }
        ]
      },
      passingScore: 75,
      maxAttempts: 3,
      version: '1.0.0',
      isActive: true,
      createdBy: 'system'
    },
    {
      id: 'consent-management',
      title: 'Consent Management Best Practices',
      description: 'Implementing effective consent collection and management systems',
      category: 'Compliance',
      difficulty: 'intermediate',
      estimatedDuration: 50,
      targetRoles: ['developer', 'data_steward', 'compliance_officer'],
      prerequisites: ['privacy-fundamentals'],
      objectives: [
        'Design compliant consent mechanisms',
        'Implement consent management platforms',
        'Handle consent withdrawal properly',
        'Maintain consent records and audit trails'
      ],
      content: [
        {
          id: 'cm-content-1',
          type: 'text',
          title: 'GDPR Consent Requirements',
          content: `
            # GDPR Consent Requirements
            
            ## Valid Consent Must Be:
            
            - **Freely given**: No penalty for refusing
            - **Specific**: For defined purposes
            - **Informed**: Clear information provided
            - **Unambiguous**: Clear affirmative action
            
            ## Implementation Requirements
            
            1. Separate consent for each purpose
            2. Easy to withdraw (as easy as to give)
            3. No pre-ticked boxes
            4. Clear and plain language
            5. Documented and auditable
          `,
          duration: 15,
          order: 1
        }
      ],
      exercises: [
        {
          id: 'cm-ex-1',
          type: 'interactive',
          title: 'Consent Form Builder',
          description: 'Build a compliant consent form',
          difficulty: 'intermediate',
          instructions: 'Design a consent form that meets GDPR requirements',
          data: {
            purposes: [
              { id: 'p1', name: 'Marketing emails', required: false },
              { id: 'p2', name: 'Analytics cookies', required: false },
              { id: 'p3', name: 'Third-party sharing', required: false },
              { id: 'p4', name: 'Service delivery', required: true }
            ],
            elements: [
              'Privacy policy link',
              'Withdraw consent instructions',
              'Purpose descriptions',
              'Checkbox for each purpose',
              'Submit button'
            ]
          },
          hints: ['Required purposes cannot be bundled with consent', 'Each optional purpose needs separate consent'],
          points: 20,
          feedback: {
            correct: 'Great consent form design! It meets all GDPR requirements.',
            incorrect: 'Review the consent requirements: freely given, specific, informed, unambiguous.'
          }
        }
      ],
      assessment: {
        id: 'cm-assessment',
        title: 'Consent Management Assessment',
        description: 'Test your consent management knowledge',
        timeLimit: 20,
        passingScore: 70,
        randomizeQuestions: true,
        showResultsImmediately: true,
        allowReview: true,
        questions: [
          {
            id: 'cm-q1',
            type: 'true_false',
            question: 'Pre-ticked checkboxes are acceptable for consent under GDPR.',
            correctAnswer: false,
            explanation: 'GDPR requires clear affirmative action - pre-ticked boxes do not constitute valid consent.',
            points: 10,
            difficulty: 'beginner',
            category: 'Consent Requirements'
          }
        ]
      },
      passingScore: 70,
      maxAttempts: 3,
      version: '1.0.0',
      isActive: true,
      createdBy: 'system'
    }
  ];

  modules.forEach(module => {
    const fullModule: TrainingModule = {
      ...module,
      createdAt: new Date(),
      updatedAt: new Date()
    } as TrainingModule;
    trainingModules.set(fullModule.id, fullModule);
  });

  logger.info(`Initialized ${modules.length} default training modules`);
}

// Initialize on module load
initializeDefaultModules();

// Service Functions
export class TrainingService {
  // Module Management
  static getAllModules(): TrainingModule[] {
    return Array.from(trainingModules.values()).filter(m => m.isActive);
  }

  static getModuleById(id: string): TrainingModule | undefined {
    return trainingModules.get(id);
  }

  static getModulesByRole(role: UserRole): TrainingModule[] {
    return this.getAllModules().filter(m => m.targetRoles.includes(role));
  }

  static createModule(moduleData: Partial<TrainingModule>, createdBy: string): TrainingModule {
    const module: TrainingModule = {
      id: uuidv4(),
      title: moduleData.title || 'Untitled Module',
      description: moduleData.description || '',
      category: moduleData.category || 'General',
      difficulty: moduleData.difficulty || 'beginner',
      estimatedDuration: moduleData.estimatedDuration || 30,
      targetRoles: moduleData.targetRoles || ['end_user'],
      prerequisites: moduleData.prerequisites || [],
      objectives: moduleData.objectives || [],
      content: moduleData.content || [],
      exercises: moduleData.exercises || [],
      assessment: moduleData.assessment || {
        id: uuidv4(),
        title: 'Assessment',
        description: '',
        timeLimit: 30,
        passingScore: 70,
        questions: [],
        randomizeQuestions: true,
        showResultsImmediately: true,
        allowReview: true
      },
      passingScore: moduleData.passingScore || 70,
      maxAttempts: moduleData.maxAttempts || 3,
      version: '1.0.0',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy
    };

    trainingModules.set(module.id, module);
    logger.info(`Created training module: ${module.id}`);
    return module;
  }

  static updateModule(id: string, updates: Partial<TrainingModule>): TrainingModule | undefined {
    const module = trainingModules.get(id);
    if (!module) return undefined;

    const updated = {
      ...module,
      ...updates,
      updatedAt: new Date()
    };
    trainingModules.set(id, updated);
    logger.info(`Updated training module: ${id}`);
    return updated;
  }

  static deleteModule(id: string): boolean {
    const module = trainingModules.get(id);
    if (!module) return false;
    
    module.isActive = false;
    trainingModules.set(id, module);
    logger.info(`Soft deleted training module: ${id}`);
    return true;
  }

  // Progress Tracking
  static getUserProgress(userId: string, moduleId?: string): UserTrainingProgress[] {
    const allProgress = Array.from(userProgress.values()).filter(p => p.userId === userId);
    if (moduleId) {
      return allProgress.filter(p => p.moduleId === moduleId);
    }
    return allProgress;
  }

  static startModule(userId: string, moduleId: string): UserTrainingProgress | { error: string } {
    const module = trainingModules.get(moduleId);
    if (!module) {
      return { error: 'Module not found' };
    }

    // Check prerequisites
    const unmetPrerequisites = module.prerequisites.filter(prereq => {
      const prereqProgress = userProgress.get(`${userId}-${prereq}`);
      return !prereqProgress || prereqProgress.status !== 'completed';
    });

    if (unmetPrerequisites.length > 0) {
      return { error: `Prerequisites not met: ${unmetPrerequisites.join(', ')}` };
    }

    const progressId = `${userId}-${moduleId}`;
    let progress = userProgress.get(progressId);

    if (!progress) {
      progress = {
        id: progressId,
        userId,
        moduleId,
        status: 'in_progress',
        progress: 0,
        currentContentIndex: 0,
        completedExercises: [],
        exerciseResults: new Map(),
        assessmentAttempts: [],
        bestScore: 0,
        startedAt: new Date(),
        timeSpent: 0,
        lastAccessedAt: new Date()
      };
      userProgress.set(progressId, progress);
    } else {
      progress.status = 'in_progress';
      progress.lastAccessedAt = new Date();
    }

    logger.info(`User ${userId} started module ${moduleId}`);
    return progress;
  }

  static updateProgress(
    userId: string,
    moduleId: string,
    updates: {
      contentIndex?: number;
      timeSpent?: number;
    }
  ): UserTrainingProgress | undefined {
    const progressId = `${userId}-${moduleId}`;
    const progress = userProgress.get(progressId);
    if (!progress) return undefined;

    if (updates.contentIndex !== undefined) {
      progress.currentContentIndex = updates.contentIndex;
    }
    if (updates.timeSpent !== undefined) {
      progress.timeSpent += updates.timeSpent;
    }

    // Calculate overall progress
    const module = trainingModules.get(moduleId);
    if (module) {
      const contentProgress = (progress.currentContentIndex / module.content.length) * 50;
      const exerciseProgress = (progress.completedExercises.length / module.exercises.length) * 30;
      const assessmentProgress = progress.status === 'completed' ? 20 : 0;
      progress.progress = Math.min(100, contentProgress + exerciseProgress + assessmentProgress);
    }

    progress.lastAccessedAt = new Date();
    userProgress.set(progressId, progress);
    return progress;
  }

  // Exercise Handling
  static submitExercise(
    userId: string,
    moduleId: string,
    exerciseId: string,
    answers: any
  ): ExerciseResult | { error: string } {
    const module = trainingModules.get(moduleId);
    if (!module) return { error: 'Module not found' };

    const exercise = module.exercises.find(e => e.id === exerciseId);
    if (!exercise) return { error: 'Exercise not found' };

    const progressId = `${userId}-${moduleId}`;
    const progress = userProgress.get(progressId);
    if (!progress) return { error: 'Progress not found. Start the module first.' };

    // Evaluate the exercise based on type
    let score = 0;
    let passed = false;
    let feedback = '';

    switch (exercise.type) {
      case 'multiple_choice':
        const mcResult = this.evaluateMultipleChoice(exercise, answers);
        score = mcResult.score;
        passed = mcResult.passed;
        feedback = passed ? exercise.feedback.correct : exercise.feedback.incorrect;
        break;
      
      case 'scenario':
        const scenarioResult = this.evaluateScenario(exercise, answers);
        score = scenarioResult.score;
        passed = scenarioResult.passed;
        feedback = passed ? exercise.feedback.correct : exercise.feedback.incorrect;
        break;
      
      case 'simulation':
        const simResult = this.evaluateSimulation(exercise, answers);
        score = simResult.score;
        passed = simResult.passed;
        feedback = passed ? exercise.feedback.correct : exercise.feedback.incorrect;
        break;
      
      default:
        // For other types, use a simplified scoring
        score = exercise.points * 0.7;
        passed = true;
        feedback = exercise.feedback.correct;
    }

    const result: ExerciseResult = {
      exerciseId,
      score,
      maxScore: exercise.points,
      passed,
      attempts: (progress.exerciseResults.get(exerciseId)?.attempts || 0) + 1,
      completedAt: new Date(),
      answers,
      feedback
    };

    progress.exerciseResults.set(exerciseId, result);
    if (passed && !progress.completedExercises.includes(exerciseId)) {
      progress.completedExercises.push(exerciseId);
    }

    userProgress.set(progressId, progress);
    logger.info(`User ${userId} submitted exercise ${exerciseId} in module ${moduleId}`);
    return result;
  }

  private static evaluateMultipleChoice(exercise: Exercise, answers: any): { score: number; passed: boolean } {
    const correctOptions = exercise.data.options.filter((o: any) => o.isPersonalData || o.isCorrect);
    const selectedOptions = Array.isArray(answers) ? answers : [answers];
    
    const correctCount = selectedOptions.filter((a: string) => 
      correctOptions.some((co: any) => co.id === a)
    ).length;
    
    const incorrectCount = selectedOptions.filter((a: string) => 
      !correctOptions.some((co: any) => co.id === a)
    ).length;

    const score = Math.max(0, (correctCount - incorrectCount) / correctOptions.length * exercise.points);
    return { score, passed: score >= exercise.points * 0.7 };
  }

  private static evaluateScenario(exercise: Exercise, answers: any): { score: number; passed: boolean } {
    const steps = exercise.data.steps;
    let correctCount = 0;

    steps.forEach((step: any) => {
      if (answers[step.id] === step.correct) {
        correctCount++;
      }
    });

    const score = (correctCount / steps.length) * exercise.points;
    return { score, passed: score >= exercise.points * 0.7 };
  }

  private static evaluateSimulation(exercise: Exercise, answers: any): { score: number; passed: boolean } {
    const stages = exercise.data.stages;
    let correctCount = 0;

    stages.forEach((stage: any) => {
      if (answers[stage.id] === stage.correct) {
        correctCount++;
      }
    });

    const score = (correctCount / stages.length) * exercise.points;
    return { score, passed: score >= exercise.points * 0.7 };
  }

  // Assessment Handling
  static startAssessment(userId: string, moduleId: string): AssessmentAttempt | { error: string } {
    const module = trainingModules.get(moduleId);
    if (!module) return { error: 'Module not found' };

    const progressId = `${userId}-${moduleId}`;
    const progress = userProgress.get(progressId);
    if (!progress) return { error: 'Progress not found' };

    if (progress.assessmentAttempts.length >= module.maxAttempts) {
      return { error: 'Maximum attempts reached' };
    }

    const attempt: AssessmentAttempt = {
      id: uuidv4(),
      attemptNumber: progress.assessmentAttempts.length + 1,
      startedAt: new Date(),
      answers: new Map(),
      score: 0,
      passed: false,
      timeSpent: 0,
      questionResults: []
    };

    progress.assessmentAttempts.push(attempt);
    userProgress.set(progressId, progress);
    logger.info(`User ${userId} started assessment for module ${moduleId}`);
    return attempt;
  }

  static submitAssessment(
    userId: string,
    moduleId: string,
    attemptId: string,
    answers: Map<string, any>,
    timeSpent: number
  ): { attempt: AssessmentAttempt; passed: boolean; certificate?: Certificate } | { error: string } {
    const module = trainingModules.get(moduleId);
    if (!module) return { error: 'Module not found' };

    const progressId = `${userId}-${moduleId}`;
    const progress = userProgress.get(progressId);
    if (!progress) return { error: 'Progress not found' };

    const attempt = progress.assessmentAttempts.find(a => a.id === attemptId);
    if (!attempt) return { error: 'Attempt not found' };

    // Evaluate each question
    let totalPoints = 0;
    let earnedPoints = 0;

    const questions = module.assessment.randomizeQuestions
      ? this.shuffleArray([...module.assessment.questions])
      : module.assessment.questions;

    questions.forEach(question => {
      const answer = answers.get(question.id);
      const result = this.evaluateQuestion(question, answer);
      
      attempt.questionResults.push(result);
      totalPoints += question.points;
      earnedPoints += result.points;
    });

    attempt.score = (earnedPoints / totalPoints) * 100;
    attempt.passed = attempt.score >= module.passingScore;
    attempt.completedAt = new Date();
    attempt.timeSpent = timeSpent;
    attempt.answers = answers;

    if (attempt.passed) {
      progress.status = 'completed';
      progress.completedAt = new Date();
      progress.bestScore = Math.max(progress.bestScore, attempt.score);
      progress.progress = 100;
    }

    userProgress.set(progressId, progress);

    let certificate: Certificate | undefined;
    if (attempt.passed) {
      certificate = this.generateCertificate(userId, moduleId, attempt.score);
    }

    logger.info(`User ${userId} submitted assessment for module ${moduleId}. Score: ${attempt.score}`);
    return { attempt, passed: attempt.passed, certificate };
  }

  private static evaluateQuestion(question: AssessmentQuestion, answer: any): QuestionResult {
    let isCorrect = false;
    let points = 0;

    switch (question.type) {
      case 'multiple_choice':
        isCorrect = answer === question.correctAnswer;
        points = isCorrect ? question.points : 0;
        break;
      
      case 'multiple_select':
        const correctSet = new Set(question.correctAnswer as string[]);
        const answerSet = new Set(answer as string[]);
        isCorrect = correctSet.size === answerSet.size && 
          [...correctSet].every(a => answerSet.has(a));
        points = isCorrect ? question.points : Math.floor(question.points * 0.5);
        break;
      
      case 'true_false':
        isCorrect = answer === question.correctAnswer;
        points = isCorrect ? question.points : 0;
        break;
      
      case 'fill_blank':
        isCorrect = answer?.toLowerCase().trim() === String(question.correctAnswer).toLowerCase().trim();
        points = isCorrect ? question.points : 0;
        break;
      
      default:
        points = Math.floor(question.points * 0.7);
    }

    return {
      questionId: question.id,
      answer,
      isCorrect,
      points,
      maxPoints: question.points,
      timeSpent: 0
    };
  }

  private static shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Certificate Generation
  static generateCertificate(userId: string, moduleId: string, score: number): Certificate {
    const module = trainingModules.get(moduleId);
    if (!module) throw new Error('Module not found');

    const certificate: Certificate = {
      id: uuidv4(),
      userId,
      moduleId,
      moduleName: module.title,
      userName: 'User', // Would be fetched from user service
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      score,
      certificateUrl: `/certificates/${uuidv4()}`,
      verificationCode: this.generateVerificationCode(),
      isValid: true
    };

    certificates.set(certificate.id, certificate);
    logger.info(`Generated certificate ${certificate.id} for user ${userId}`);
    return certificate;
  }

  private static generateVerificationCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  static getCertificate(certificateId: string): Certificate | undefined {
    return certificates.get(certificateId);
  }

  static getUserCertificates(userId: string): Certificate[] {
    return Array.from(certificates.values()).filter(c => c.userId === userId);
  }

  static verifyCertificate(verificationCode: string): Certificate | undefined {
    return Array.from(certificates.values()).find(c => c.verificationCode === verificationCode);
  }

  // Analytics
  static getModuleAnalytics(moduleId: string): TrainingAnalytics | { error: string } {
    const module = trainingModules.get(moduleId);
    if (!module) return { error: 'Module not found' };

    const moduleProgress = Array.from(userProgress.values()).filter(p => p.moduleId === moduleId);
    const completions = moduleProgress.filter(p => p.status === 'completed');

    const roleBreakdown = this.calculateRoleBreakdown(moduleProgress);
    const dropOffPoints = this.calculateDropOffPoints(module, moduleProgress);
    const exerciseStats = this.calculateExerciseStats(module, moduleProgress);
    const questionStats = this.calculateQuestionStats(module, moduleProgress);

    return {
      moduleId,
      totalEnrollments: moduleProgress.length,
      completions: completions.length,
      completionRate: moduleProgress.length > 0 ? (completions.length / moduleProgress.length) * 100 : 0,
      averageScore: completions.length > 0
        ? completions.reduce((sum, p) => sum + p.bestScore, 0) / completions.length
        : 0,
      averageTimeSpent: moduleProgress.length > 0
        ? moduleProgress.reduce((sum, p) => sum + p.timeSpent, 0) / moduleProgress.length
        : 0,
      passRate: completions.length > 0
        ? completions.filter(c => c.bestScore >= module.passingScore).length / completions.length * 100
        : 0,
      dropOffPoints,
      exerciseStats,
      questionStats,
      roleBreakdown
    };
  }

  private static calculateRoleBreakdown(progress: UserTrainingProgress[]): TrainingAnalytics['roleBreakdown'] {
    const roleCount = new Map<UserRole, { total: number; completed: number }>();
    
    progress.forEach(p => {
      // Would normally fetch user role from user service
      const role: UserRole = 'analyst';
      const current = roleCount.get(role) || { total: 0, completed: 0 };
      roleCount.set(role, {
        total: current.total + 1,
        completed: current.completed + (p.status === 'completed' ? 1 : 0)
      });
    });

    return Array.from(roleCount.entries()).map(([role, data]) => ({
      role,
      count: data.total,
      completionRate: data.total > 0 ? (data.completed / data.total) * 100 : 0
    }));
  }

  private static calculateDropOffPoints(module: TrainingModule, progress: UserTrainingProgress[]): TrainingAnalytics['dropOffPoints'] {
    const contentDropOff = module.content.map(c => {
      const reachedCount = progress.filter(p => p.currentContentIndex >= c.order).length;
      return {
        contentId: c.id,
        dropOffRate: progress.length > 0 ? ((progress.length - reachedCount) / progress.length) * 100 : 0
      };
    });

    return contentDropOff;
  }

  private static calculateExerciseStats(module: TrainingModule, progress: UserTrainingProgress[]): TrainingAnalytics['exerciseStats'] {
    return module.exercises.map(exercise => {
      const results = progress
        .map(p => p.exerciseResults.get(exercise.id))
        .filter((r): r is ExerciseResult => r !== undefined);
      
      return {
        exerciseId: exercise.id,
        averageScore: results.length > 0
          ? results.reduce((sum, r) => sum + r.score, 0) / results.length
          : 0,
        attemptRate: progress.length > 0
          ? results.length / progress.length * 100
          : 0
      };
    });
  }

  private static calculateQuestionStats(module: TrainingModule, progress: UserTrainingProgress[]): TrainingAnalytics['questionStats'] {
    return module.assessment.questions.map(question => {
      const results = progress
        .flatMap(p => p.assessmentAttempts)
        .flatMap(a => a.questionResults)
        .filter(r => r.questionId === question.id);
      
      return {
        questionId: question.id,
        correctRate: results.length > 0
          ? results.filter(r => r.isCorrect).length / results.length * 100
          : 0,
        averageTime: 0 // Would track actual time in production
      };
    });
  }

  static getOverallAnalytics(): {
    totalModules: number;
    activeModules: number;
    totalEnrollments: number;
    totalCompletions: number;
    averageCompletionRate: number;
    certificatesIssued: number;
  } {
    const allProgress = Array.from(userProgress.values());
    const completions = allProgress.filter(p => p.status === 'completed');

    return {
      totalModules: trainingModules.size,
      activeModules: Array.from(trainingModules.values()).filter(m => m.isActive).length,
      totalEnrollments: allProgress.length,
      totalCompletions: completions.length,
      averageCompletionRate: allProgress.length > 0
        ? (completions.length / allProgress.length) * 100
        : 0,
      certificatesIssued: certificates.size
    };
  }

  // Onboarding Integration
  static getOnboardingTraining(role: UserRole): TrainingModule[] {
    return this.getModulesByRole(role)
      .filter(m => m.difficulty === 'beginner' && m.prerequisites.length === 0)
      .slice(0, 3);
  }

  static assignRequiredTraining(userId: string, role: UserRole): UserTrainingProgress[] {
    const requiredModules = this.getModulesByRole(role)
      .filter(m => m.difficulty === 'beginner');
    
    const assigned: UserTrainingProgress[] = [];
    
    requiredModules.forEach(module => {
      const result = this.startModule(userId, module.id);
      if ('id' in result) {
        assigned.push(result);
      }
    });

    logger.info(`Assigned ${assigned.length} required training modules to user ${userId}`);
    return assigned;
  }
}

export default TrainingService;
