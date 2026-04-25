import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  GraduationCap, 
  BookOpen, 
  Award, 
  Clock, 
  CheckCircle, 
  PlayCircle,
  TrendingUp,
  Target,
  ChevronRight,
  Filter,
  Search
} from 'lucide-react';
import axios from 'axios';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimatedDuration: number;
  targetRoles: string[];
  prerequisites: string[];
  objectives: string[];
  passingScore: number;
  version: string;
  isActive: boolean;
}

interface UserProgress {
  id: string;
  moduleId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'expired';
  progress: number;
  bestScore: number;
  timeSpent: number;
  completedAt?: string;
  certificateId?: string;
}

interface Certificate {
  id: string;
  moduleName: string;
  issuedAt: string;
  score: number;
  verificationCode: string;
  certificateUrl: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export function TrainingPage() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'courses' | 'progress' | 'certificates'>('courses');

  useEffect(() => {
    fetchTrainingData();
  }, []);

  const fetchTrainingData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [modulesRes, progressRes, certsRes] = await Promise.all([
        axios.get(`${API_BASE}/training/modules`, { headers }),
        axios.get(`${API_BASE}/training/progress`, { headers }),
        axios.get(`${API_BASE}/training/certificates`, { headers })
      ]);

      setModules(modulesRes.data.data || []);
      setProgress(progressRes.data.data || []);
      setCertificates(certsRes.data.data || []);
    } catch (error) {
      console.error('Failed to fetch training data:', error);
      // Use demo data for development
      setModules(getDemoModules());
      setProgress(getDemoProgress());
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const getDemoModules = (): TrainingModule[] => [
    {
      id: 'privacy-fundamentals',
      title: 'Privacy Fundamentals',
      description: 'Core concepts of data privacy, GDPR basics, and privacy-by-design principles',
      category: 'Foundations',
      difficulty: 'beginner',
      estimatedDuration: 45,
      targetRoles: ['admin', 'analyst', 'developer', 'data_steward', 'compliance_officer', 'end_user'],
      prerequisites: [],
      objectives: ['Understand key privacy concepts', 'Learn GDPR principles', 'Apply privacy-by-design'],
      passingScore: 70,
      version: '1.0.0',
      isActive: true
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
      objectives: ['Master DP mathematics', 'Implement epsilon parameters', 'Balance privacy-utility'],
      passingScore: 75,
      version: '1.0.0',
      isActive: true
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
      objectives: ['Classify data properly', 'Handle DSARs', 'Maintain compliance'],
      passingScore: 70,
      version: '1.0.0',
      isActive: true
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
      objectives: ['Identify incidents', 'Execute response plans', 'Report breaches'],
      passingScore: 75,
      version: '1.0.0',
      isActive: true
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
      objectives: ['Design consent mechanisms', 'Handle withdrawal', 'Maintain records'],
      passingScore: 70,
      version: '1.0.0',
      isActive: true
    }
  ];

  const getDemoProgress = (): UserProgress[] => [
    {
      id: 'demo-progress-1',
      moduleId: 'privacy-fundamentals',
      status: 'completed',
      progress: 100,
      bestScore: 85,
      timeSpent: 42,
      completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'demo-progress-2',
      moduleId: 'data-handling-procedures',
      status: 'in_progress',
      progress: 45,
      bestScore: 0,
      timeSpent: 25
    }
  ];

  const getProgressForModule = (moduleId: string): UserProgress | undefined => {
    return progress.find(p => p.moduleId === moduleId);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-orange-100 text-orange-800';
      case 'expert': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" /> Completed
        </span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <PlayCircle className="w-3 h-3 mr-1" /> In Progress
        </span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Not Started
        </span>;
    }
  };

  const filteredModules = modules.filter(m => {
    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'all' || m.difficulty === selectedDifficulty;
    const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesDifficulty && matchesSearch;
  });

  const categories = [...new Set(modules.map(m => m.category))];

  const stats = {
    totalCourses: modules.length,
    completed: progress.filter(p => p.status === 'completed').length,
    inProgress: progress.filter(p => p.status === 'in_progress').length,
    totalTimeSpent: progress.reduce((sum, p) => sum + p.timeSpent, 0),
    certificatesEarned: certificates.length
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="w-8 h-8" />
              Privacy Training Center
            </h1>
            <p className="mt-1 text-blue-100">
              Build your privacy expertise with interactive courses and assessments
            </p>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.completed}</div>
              <div className="text-sm text-blue-200">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.certificatesEarned}</div>
              <div className="text-sm text-blue-200">Certificates</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Courses</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCourses}</p>
            </div>
            <BookOpen className="w-8 h-8 text-blue-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">In Progress</p>
              <p className="text-2xl font-bold text-gray-900">{stats.inProgress}</p>
            </div>
            <PlayCircle className="w-8 h-8 text-yellow-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Time Spent</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalTimeSpent}m</p>
            </div>
            <Clock className="w-8 h-8 text-purple-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Certificates</p>
              <p className="text-2xl font-bold text-gray-900">{stats.certificatesEarned}</p>
            </div>
            <Award className="w-8 h-8 text-green-500" />
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {(['courses', 'progress', 'certificates'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'courses' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search courses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Levels</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
            </div>
          </div>

          {/* Course Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredModules.map((module, index) => {
              const moduleProgress = getProgressForModule(module.id);
              return (
                <motion.div
                  key={module.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(module.difficulty)}`}>
                        {module.difficulty}
                      </span>
                      {moduleProgress && getStatusBadge(moduleProgress.status)}
                    </div>
                    
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{module.description}</p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {module.estimatedDuration}m
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="w-4 h-4" />
                        {module.passingScore}% to pass
                      </span>
                    </div>

                    {moduleProgress && moduleProgress.status === 'in_progress' && (
                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span>{Math.round(moduleProgress.progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${moduleProgress.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => window.location.href = `/training/module/${module.id}`}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {moduleProgress?.status === 'completed' ? 'Review Course' : 
                       moduleProgress?.status === 'in_progress' ? 'Continue Course' : 'Start Course'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Your Learning Journey</h2>
            <div className="space-y-4">
              {progress.map((p) => {
                const module = modules.find(m => m.id === p.moduleId);
                if (!module) return null;
                return (
                  <div key={p.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{module.title}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span>{Math.round(p.progress)}% complete</span>
                        <span>{p.timeSpent}m spent</span>
                        {p.status === 'completed' && <span>Score: {p.bestScore}%</span>}
                      </div>
                    </div>
                    <div className="w-32">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${p.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                    </div>
                    {getStatusBadge(p.status)}
                  </div>
                );
              })}
              {progress.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No courses started yet. Begin your learning journey!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'certificates' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Your Certificates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {certificates.map((cert) => (
                <motion.div
                  key={cert.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="border border-yellow-200 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg p-6"
                >
                  <div className="flex items-start gap-4">
                    <Award className="w-12 h-12 text-yellow-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{cert.moduleName}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Issued: {new Date(cert.issuedAt).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">Score: {cert.score}%</p>
                      <p className="text-xs text-gray-500 mt-2 font-mono">
                        Verification: {cert.verificationCode}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(cert.certificateUrl, '_blank')}
                    className="mt-4 w-full py-2 text-center text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    View Certificate
                  </button>
                </motion.div>
              ))}
              {certificates.length === 0 && (
                <div className="col-span-2 text-center py-8 text-gray-500">
                  <Award className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Complete courses to earn certificates!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrainingPage;
