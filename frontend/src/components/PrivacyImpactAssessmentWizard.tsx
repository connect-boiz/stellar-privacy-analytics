import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  Info,
  ArrowRight,
  ArrowLeft,
  FileText,
  Users,
  Database,
  Lock,
  BarChart3,
  Target,
  Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AssessmentQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple' | 'text' | 'scale';
  options?: string[];
  required: boolean;
  category: 'data' | 'purpose' | 'users' | 'risks' | 'mitigation';
}

interface AssessmentAnswer {
  questionId: string;
  answer: string | string[] | number;
}

interface RiskScore {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  factors: string[];
  recommendations: string[];
}

interface AssessmentResult {
  id: string;
  title: string;
  description: string;
  riskScore: RiskScore;
  mitigationStrategies: string[];
  complianceFrameworks: string[];
  createdAt: string;
}

const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'data-sensitivity',
    question: 'What is the sensitivity level of the data being analyzed?',
    type: 'single',
    options: ['Public', 'Internal', 'Confidential', 'Highly Sensitive (PII, Health, Financial)'],
    required: true,
    category: 'data'
  },
  {
    id: 'data-volume',
    question: 'What is the approximate volume of data to be processed?',
    type: 'single',
    options: ['< 1,000 records', '1,000 - 10,000 records', '10,000 - 100,000 records', '> 100,000 records'],
    required: true,
    category: 'data'
  },
  {
    id: 'analysis-purpose',
    question: 'What is the primary purpose of this analysis?',
    type: 'multiple',
    options: [
      'Business Intelligence',
      'Research',
      'Compliance Reporting',
      'Risk Assessment',
      'Customer Insights',
      'Operational Optimization',
      'Regulatory Requirements'
    ],
    required: true,
    category: 'purpose'
  },
  {
    id: 'user-access',
    question: 'Who will have access to the analysis results?',
    type: 'multiple',
    options: [
      'Data Scientists/Analysts',
      'Business Users',
      'Executives',
      'External Partners',
      'Public (aggregated)',
      'Regulators'
    ],
    required: true,
    category: 'users'
  },
  {
    id: 'retention-period',
    question: 'How long will the analysis results be retained?',
    type: 'single',
    options: ['< 30 days', '30-90 days', '90-365 days', '> 1 year', 'Indefinitely'],
    required: true,
    category: 'data'
  },
  {
    id: 'privacy-risks',
    question: 'Which privacy risks are you most concerned about?',
    type: 'multiple',
    options: [
      'Re-identification',
      'Data leakage',
      'Unauthorized access',
      'Inadequate anonymization',
      'Cross-border data transfers',
      'Third-party sharing',
      'Long-term data linkage'
    ],
    required: false,
    category: 'risks'
  },
  {
    id: 'existing-controls',
    question: 'What privacy controls are already in place?',
    type: 'multiple',
    options: [
      'Data anonymization/pseudonymization',
      'Access controls',
      'Encryption at rest',
      'Encryption in transit',
      'Audit logging',
      'Data classification',
      'Privacy impact assessments',
      'None'
    ],
    required: false,
    category: 'mitigation'
  },
  {
    id: 'compliance-requirements',
    question: 'Which compliance frameworks apply?',
    type: 'multiple',
    options: [
      'GDPR',
      'CCPA',
      'HIPAA',
      'SOX',
      'PCI DSS',
      'Industry-specific regulations',
      'None'
    ],
    required: false,
    category: 'mitigation'
  }
];

export const PrivacyImpactAssessmentWizard: React.FC = () => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const totalSteps = ASSESSMENT_QUESTIONS.length;
  const currentQuestion = ASSESSMENT_QUESTIONS[currentStep];
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const handleAnswer = (answer: string | string[] | number) => {
    const newAnswer: AssessmentAnswer = {
      questionId: currentQuestion.id,
      answer
    };

    setAnswers(prev => {
      const filtered = prev.filter(a => a.questionId !== currentQuestion.id);
      return [...filtered, newAnswer];
    });
  };

  const getCurrentAnswer = (): string | string[] | number | undefined => {
    const answer = answers.find(a => a.questionId === currentQuestion.id);
    return answer?.answer;
  };

  const canProceed = (): boolean => {
    if (!currentQuestion.required) return true;
    const answer = getCurrentAnswer();
    if (Array.isArray(answer)) return answer.length > 0;
    return answer !== undefined && answer !== '';
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const calculateRiskScore = (): RiskScore => {
    let score = 0;
    const factors: string[] = [];
    const recommendations: string[] = [];

    // Analyze answers to calculate risk
    answers.forEach(answer => {
      const question = ASSESSMENT_QUESTIONS.find(q => q.id === answer.questionId);
      if (!question) return;

      switch (question.id) {
        case 'data-sensitivity':
          if (answer.answer === 'Highly Sensitive (PII, Health, Financial)') {
            score += 40;
            factors.push('High data sensitivity');
            recommendations.push('Implement strong encryption and access controls');
          } else if (answer.answer === 'Confidential') {
            score += 25;
            factors.push('Medium data sensitivity');
          } else if (answer.answer === 'Internal') {
            score += 10;
            factors.push('Low data sensitivity');
          }
          break;

        case 'data-volume':
          if (answer.answer === '> 100,000 records') {
            score += 30;
            factors.push('Large data volume');
            recommendations.push('Consider data sampling or aggregation');
          } else if (answer.answer === '10,000 - 100,000 records') {
            score += 20;
            factors.push('Medium data volume');
          }
          break;

        case 'user-access':
          const accessList = answer.answer as string[];
          if (accessList.includes('External Partners') || accessList.includes('Public (aggregated)')) {
            score += 25;
            factors.push('Broad user access');
            recommendations.push('Implement strict access controls and data sharing agreements');
          }
          if (accessList.includes('Regulators')) {
            score += 15;
            factors.push('Regulatory access required');
          }
          break;

        case 'privacy-risks':
          const risks = answer.answer as string[];
          score += risks.length * 5;
          if (risks.length > 3) {
            factors.push('Multiple privacy risks identified');
            recommendations.push('Conduct detailed risk assessment');
          }
          break;

        case 'existing-controls':
          const controls = answer.answer as string[];
          if (controls.includes('None')) {
            score += 30;
            factors.push('No existing privacy controls');
            recommendations.push('Implement comprehensive privacy framework');
          } else {
            score -= controls.length * 3; // Reduce score for existing controls
          }
          break;
      }
    });

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 80) level = 'critical';
    else if (score >= 60) level = 'high';
    else if (score >= 40) level = 'medium';
    else level = 'low';

    // Add general recommendations
    if (score > 50) {
      recommendations.push('Consider privacy-preserving techniques (differential privacy, federated learning)');
      recommendations.push('Implement regular privacy audits');
    }

    return { level, score, factors, recommendations };
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const riskScore = calculateRiskScore();

      const assessmentResult: AssessmentResult = {
        id: `assessment-${Date.now()}`,
        title: 'Privacy Impact Assessment',
        description: 'Automated assessment based on provided criteria',
        riskScore,
        mitigationStrategies: [
          'Implement data minimization principles',
          'Use privacy-preserving computation techniques',
          'Regular privacy training for staff',
          'Automated privacy monitoring',
          'Data retention policies'
        ],
        complianceFrameworks: ['GDPR', 'CCPA'],
        createdAt: new Date().toISOString()
      };

      setResult(assessmentResult);

      // In a real implementation, this would be saved to backend
      console.log('Assessment completed:', assessmentResult);
    } catch (error) {
      console.error('Failed to submit assessment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setAnswers([]);
    setResult(null);
  };

  const getStepIcon = (stepIndex: number) => {
    const question = ASSESSMENT_QUESTIONS[stepIndex];
    switch (question.category) {
      case 'data': return <Database className="h-5 w-5" />;
      case 'purpose': return <Target className="h-5 w-5" />;
      case 'users': return <Users className="h-5 w-5" />;
      case 'risks': return <AlertTriangle className="h-5 w-5" />;
      case 'mitigation': return <Shield className="h-5 w-5" />;
      default: return <Info className="h-5 w-5" />;
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg"
      >
        <div className="text-center mb-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Complete</h2>
          <p className="text-gray-600">Your privacy impact assessment has been generated</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Risk Assessment
            </h3>
            <div className={`p-4 rounded-lg border ${getRiskColor(result.riskScore.level)}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium capitalize">{result.riskScore.level} Risk</span>
                <span className="text-2xl font-bold">{result.riskScore.score}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-current h-2 rounded-full transition-all duration-300"
                  style={{ width: `${result.riskScore.score}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-6 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              Key Factors
            </h3>
            <ul className="space-y-2">
              {result.riskScore.factors.map((factor, index) => (
                <li key={index} className="flex items-center text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" />
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Zap className="h-5 w-5 mr-2" />
            Recommendations
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {result.riskScore.recommendations.map((rec, index) => (
              <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">{rec}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center space-x-4">
          <button
            onClick={resetWizard}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Start New Assessment
          </button>
          <button
            onClick={() => window.print()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Export Report
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Privacy Impact Assessment
        </h1>
        <p className="text-gray-600">
          Evaluate privacy risks for your data analysis project
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Step {currentStep + 1} of {totalSteps}</span>
          <span>{Math.round(progress)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <motion.div
            className="bg-blue-600 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex justify-center mb-8">
        {ASSESSMENT_QUESTIONS.map((_, index) => (
          <div
            key={index}
            className={`flex items-center justify-center w-8 h-8 rounded-full mx-1 transition-colors ${
              index < currentStep
                ? 'bg-green-500 text-white'
                : index === currentStep
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-400'
            }`}
          >
            {index < currentStep ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              getStepIcon(index)
            )}
          </div>
        ))}
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="mb-8"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {currentQuestion.question}
          </h2>

          {currentQuestion.type === 'single' && currentQuestion.options && (
            <div className="space-y-3">
              {currentQuestion.options.map((option) => (
                <label key={option} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name={currentQuestion.id}
                    value={option}
                    checked={getCurrentAnswer() === option}
                    onChange={(e) => handleAnswer(e.target.value)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-gray-900">{option}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.type === 'multiple' && currentQuestion.options && (
            <div className="space-y-3">
              {currentQuestion.options.map((option) => (
                <label key={option} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    value={option}
                    checked={(getCurrentAnswer() as string[])?.includes(option) || false}
                    onChange={(e) => {
                      const current = (getCurrentAnswer() as string[]) || [];
                      const updated = current.includes(option)
                        ? current.filter(item => item !== option)
                        : [...current, option];
                      handleAnswer(updated);
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-gray-900">{option}</span>
                </label>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="flex items-center px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </button>

        <button
          onClick={handleNext}
          disabled={!canProceed() || isSubmitting}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {currentStep === totalSteps - 1 ? 'Complete Assessment' : 'Next'}
        </button>
      </div>
    </motion.div>
  );
};