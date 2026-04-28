import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Briefcase,
  GraduationCap,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  BookOpen,
  Clock,
  Target,
  Shield,
  Users,
  Database,
  Code,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
}

interface RecommendedTraining {
  id: string;
  title: string;
  description: string;
  required: boolean;
  estimatedDuration: number;
  priority: 'high' | 'medium' | 'low';
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const ROLES = [
  { id: 'admin', label: 'Administrator', icon: Shield, description: 'System administration and configuration' },
  { id: 'analyst', label: 'Data Analyst', icon: BarChart3, description: 'Data analysis and reporting' },
  { id: 'developer', label: 'Developer', icon: Code, description: 'Software development and integration' },
  { id: 'data_steward', label: 'Data Steward', icon: Database, description: 'Data governance and quality management' },
  { id: 'compliance_officer', label: 'Compliance Officer', icon: Users, description: 'Regulatory compliance and policy oversight' },
  { id: 'end_user', label: 'End User', icon: User, description: 'General system usage' }
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [recommendedTraining, setRecommendedTraining] = useState<RecommendedTraining[]>([]);
  const [loading, setLoading] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const steps: OnboardingStep[] = [
    { id: 'welcome', title: 'Welcome', description: 'Get started with Stellar Privacy Analytics', icon: <User className="w-6 h-6" />, completed: currentStep > 0 },
    { id: 'role', title: 'Your Role', description: 'Select your primary role', icon: <Briefcase className="w-6 h-6" />, completed: currentStep > 1 },
    { id: 'training', title: 'Training', description: 'Required and recommended training', icon: <GraduationCap className="w-6 h-6" />, completed: currentStep > 2 },
    { id: 'complete', title: 'Complete', description: 'Start your journey', icon: <CheckCircle className="w-6 h-6" />, completed: onboardingComplete }
  ];

  useEffect(() => {
    if (selectedRole) {
      fetchRecommendedTraining();
    }
  }, [selectedRole]);

  const fetchRecommendedTraining = async () => {
    if (!selectedRole) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE}/training/onboarding/recommendations?role=${selectedRole}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecommendedTraining(response.data.data?.recommended || []);
    } catch (error) {
      console.error('Failed to fetch training recommendations:', error);
      // Demo data
      setRecommendedTraining(getDemoTraining(selectedRole));
    } finally {
      setLoading(false);
    }
  };

  const getDemoTraining = (role: string): RecommendedTraining[] => {
    const baseTraining: RecommendedTraining[] = [
      {
        id: 'privacy-fundamentals',
        title: 'Privacy Fundamentals',
        description: 'Core concepts of data privacy and GDPR basics',
        required: true,
        estimatedDuration: 45,
        priority: 'high'
      }
    ];

    const roleSpecific: Record<string, RecommendedTraining[]> = {
      admin: [
        {
          id: 'incident-response',
          title: 'Privacy Incident Response',
          description: 'Handle and report privacy incidents',
          required: true,
          estimatedDuration: 75,
          priority: 'high'
        },
        {
          id: 'data-handling-procedures',
          title: 'Data Handling Procedures',
          description: 'Best practices for handling sensitive data',
          required: false,
          estimatedDuration: 60,
          priority: 'medium'
        }
      ],
      analyst: [
        {
          id: 'differential-privacy-deep-dive',
          title: 'Differential Privacy Deep Dive',
          description: 'Advanced DP techniques for analytics',
          required: true,
          estimatedDuration: 90,
          priority: 'high'
        }
      ],
      developer: [
        {
          id: 'consent-management',
          title: 'Consent Management Best Practices',
          description: 'Implementing consent systems',
          required: true,
          estimatedDuration: 50,
          priority: 'high'
        },
        {
          id: 'differential-privacy-deep-dive',
          title: 'Differential Privacy Deep Dive',
          description: 'Advanced DP techniques',
          required: false,
          estimatedDuration: 90,
          priority: 'medium'
        }
      ],
      data_steward: [
        {
          id: 'data-handling-procedures',
          title: 'Data Handling Procedures',
          description: 'Best practices for data governance',
          required: true,
          estimatedDuration: 60,
          priority: 'high'
        },
        {
          id: 'consent-management',
          title: 'Consent Management Best Practices',
          description: 'Managing consent records',
          required: true,
          estimatedDuration: 50,
          priority: 'high'
        }
      ],
      compliance_officer: [
        {
          id: 'incident-response',
          title: 'Privacy Incident Response',
          description: 'Handle and report privacy incidents',
          required: true,
          estimatedDuration: 75,
          priority: 'high'
        },
        {
          id: 'data-handling-procedures',
          title: 'Data Handling Procedures',
          description: 'Data governance best practices',
          required: true,
          estimatedDuration: 60,
          priority: 'high'
        }
      ],
      end_user: [
        {
          id: 'data-handling-procedures',
          title: 'Data Handling Procedures',
          description: 'Basic data handling guidelines',
          required: false,
          estimatedDuration: 30,
          priority: 'low'
        }
      ]
    };

    return [...baseTraining, ...(roleSpecific[role] || [])];
  };

  const handleCompleteOnboarding = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE}/training/onboarding/assign`, {
        role: selectedRole,
        name: userName,
        trainingIds: recommendedTraining.filter(t => t.required).map(t => t.id)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
    
    setOnboardingComplete(true);
  };

  const handleStartTraining = () => {
    navigate('/training');
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="text-center"
          >
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Stellar Privacy Analytics</h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              Let's set up your account and get you started with the training you need to handle privacy-sensitive data responsibly.
            </p>
            <div className="bg-blue-50 rounded-lg p-4 max-w-md mx-auto">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <Target className="w-5 h-5" />
                <span className="font-medium">What to expect</span>
              </div>
              <ul className="text-sm text-blue-700 text-left space-y-1">
                <li>• Select your role to personalize your experience</li>
                <li>• Get assigned relevant privacy training</li>
                <li>• Complete required courses to gain system access</li>
              </ul>
            </div>
          </motion.div>
        );

      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">What's your role?</h2>
              <p className="text-gray-600">Select your primary role to get personalized training recommendations</p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <h3 className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                          {role.label}
                        </h3>
                        <p className="text-sm text-gray-500">{role.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Training Plan</h2>
              <p className="text-gray-600">Based on your role as <span className="font-medium">{ROLES.find(r => r.id === selectedRole)?.label}</span></p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"
                />
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {recommendedTraining.map((training, index) => (
                    <motion.div
                      key={training.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-4 rounded-lg border ${
                        training.required ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${
                            training.required ? 'bg-blue-100' : 'bg-gray-100'
                          }`}>
                            <BookOpen className={`w-5 h-5 ${
                              training.required ? 'text-blue-600' : 'text-gray-600'
                            }`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900">{training.title}</h3>
                              {training.required && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{training.description}</p>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {training.estimatedDuration} min
                              </span>
                              <span className={`capitalize ${
                                training.priority === 'high' ? 'text-red-600' :
                                training.priority === 'medium' ? 'text-yellow-600' :
                                'text-gray-500'
                              }`}>
                                {training.priority} priority
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-800">Important</h4>
                      <p className="text-sm text-yellow-700">
                        Required training must be completed within 14 days to maintain system access.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">You're All Set!</h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              Your training has been assigned. Complete the required courses to unlock full system access.
            </p>
            
            <div className="bg-gray-50 rounded-lg p-6 max-w-md mx-auto mb-8">
              <h3 className="font-medium text-gray-900 mb-4">Your Training Summary</h3>
              <div className="space-y-3 text-left">
                <div className="flex justify-between">
                  <span className="text-gray-600">Required Courses</span>
                  <span className="font-medium text-gray-900">
                    {recommendedTraining.filter(t => t.required).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Recommended Courses</span>
                  <span className="font-medium text-gray-900">
                    {recommendedTraining.filter(t => !t.required).length}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-3">
                  <span className="text-gray-600">Total Time</span>
                  <span className="font-medium text-gray-900">
                    {recommendedTraining.reduce((sum, t) => sum + t.estimatedDuration, 0)} min
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={handleStartTraining}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Start Training Now
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return true;
      case 1:
        return selectedRole !== null && userName.trim() !== '';
      case 2:
        return !loading;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 2) {
      handleCompleteOnboarding();
    }
    setCurrentStep(Math.min(currentStep + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(Math.max(currentStep - 1, 0));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index <= currentStep
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {step.completed ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  <span className={`text-xs mt-2 ${
                    index <= currentStep ? 'text-blue-600 font-medium' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {renderStepContent()}
        </AnimatePresence>

        {/* Navigation */}
        {currentStep < 3 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                currentStep === 0
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-4">
              {currentStep < 2 && (
                <button
                  onClick={handleSkip}
                  className="text-gray-500 hover:text-gray-700 text-sm"
                >
                  Skip for now
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
                  canProceed()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {currentStep === 2 ? 'Complete Setup' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OnboardingPage;
