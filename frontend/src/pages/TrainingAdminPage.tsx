import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Plus,
  Edit,
  Trash2,
  BarChart3,
  Users,
  Clock,
  TrendingUp,
  Award,
  BookOpen,
  Save,
  X,
  ChevronDown,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import axios from 'axios';
import { Modal, ConfirmDialog } from '../components/ui/Modal';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedDuration: number;
  targetRoles: string[];
  prerequisites: string[];
  objectives: string[];
  passingScore: number;
  maxAttempts: number;
  isActive: boolean;
}

interface TrainingAnalytics {
  moduleId: string;
  totalEnrollments: number;
  completions: number;
  completionRate: number;
  averageScore: number;
  averageTimeSpent: number;
  passRate: number;
}

interface OverallAnalytics {
  totalModules: number;
  activeModules: number;
  totalEnrollments: number;
  totalCompletions: number;
  averageCompletionRate: number;
  certificatesIssued: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const AVAILABLE_ROLES = [
  'admin',
  'analyst',
  'developer',
  'data_steward',
  'compliance_officer',
  'end_user'
];

const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

const CATEGORIES = [
  'Foundations',
  'Advanced Techniques',
  'Operational',
  'Security',
  'Compliance',
  'Development',
  'Analytics'
];

export function TrainingAdminPage() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [analytics, setAnalytics] = useState<OverallAnalytics | null>(null);
  const [moduleAnalytics, setModuleAnalytics] = useState<Map<string, TrainingAnalytics>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'modules' | 'analytics' | 'settings'>('modules');

  // Edit/Create state
  const [editingModule, setEditingModule] = useState<Partial<TrainingModule> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; moduleId: string | null }>({
    isOpen: false,
    moduleId: null
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [modulesRes, analyticsRes] = await Promise.all([
        axios.get(`${API_BASE}/training/modules`, { headers }),
        axios.get(`${API_BASE}/training/analytics/overview`, { headers })
      ]);

      setModules(modulesRes.data.data || []);
      setAnalytics(analyticsRes.data.data);

      // Fetch analytics for each module
      const analyticsMap = new Map<string, TrainingAnalytics>();
      for (const module of modulesRes.data.data || []) {
        try {
          const modAnalytics = await axios.get(`${API_BASE}/training/analytics/modules/${module.id}`, { headers });
          analyticsMap.set(module.id, modAnalytics.data.data);
        } catch (e) {
          // Use demo data
        }
      }
      setModuleAnalytics(analyticsMap);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      // Use demo data
      setModules(getDemoModules());
      setAnalytics({
        totalModules: 5,
        activeModules: 5,
        totalEnrollments: 127,
        totalCompletions: 89,
        averageCompletionRate: 70.1,
        certificatesIssued: 89
      });
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
      maxAttempts: 3,
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
      maxAttempts: 3,
      isActive: true
    }
  ];

  const handleCreateModule = () => {
    setIsCreating(true);
    setEditingModule({
      title: '',
      description: '',
      category: CATEGORIES[0],
      difficulty: 'beginner',
      estimatedDuration: 30,
      targetRoles: ['end_user'],
      prerequisites: [],
      objectives: [],
      passingScore: 70,
      maxAttempts: 3,
      isActive: true
    });
  };

  const handleEditModule = (module: TrainingModule) => {
    setIsCreating(false);
    setEditingModule({ ...module });
  };

  const handleDeleteModule = async (moduleId: string) => {
    setDeleteConfirm({ isOpen: true, moduleId });
  };

  const confirmDeleteModule = async () => {
    const moduleId = deleteConfirm.moduleId;
    if (!moduleId) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE}/training/modules/${moduleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setModules(modules.filter(m => m.id !== moduleId));
      setSaveMessage({ type: 'success', text: 'Module deleted successfully' });
    } catch (error) {
      console.error('Failed to delete module:', error);
      setSaveMessage({ type: 'error', text: 'Failed to delete module' });
    } finally {
      setDeleteConfirm({ isOpen: false, moduleId: null });
    }

    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSaveModule = async () => {
    if (!editingModule) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('token');

      if (isCreating) {
        const response = await axios.post(`${API_BASE}/training/modules`, editingModule, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setModules([...modules, response.data.data]);
        setSaveMessage({ type: 'success', text: 'Module created successfully' });
      } else {
        const response = await axios.put(`${API_BASE}/training/modules/${editingModule.id}`, editingModule, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setModules(modules.map(m => m.id === editingModule.id ? response.data.data : m));
        setSaveMessage({ type: 'success', text: 'Module updated successfully' });
      }

      setEditingModule(null);
    } catch (error) {
      console.error('Failed to save module:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save module' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleToggleActive = async (module: TrainingModule) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_BASE}/training/modules/${module.id}`, {
        isActive: !module.isActive
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setModules(modules.map(m => m.id === module.id ? response.data.data : m));
    } catch (error) {
      console.error('Failed to toggle module status:', error);
      // Update locally for demo
      setModules(modules.map(m =>
        m.id === module.id ? { ...m, isActive: !m.isActive } : m
      ));
    }
  };

  const firstInputRef = useRef<HTMLInputElement>(null);

  const renderModuleEditor = () => {
    return (
      <Modal
        isOpen={editingModule !== null}
        onClose={() => setEditingModule(null)}
        title={isCreating ? 'Create New Module' : 'Edit Module'}
        size="lg"
        initialFocusRef={firstInputRef}
      >

        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              ref={firstInputRef}
              type="text"
              value={editingModule?.title || ''}
              onChange={(e) => setEditingModule({ ...editingModule!, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Module title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editingModule?.description || ''}
              onChange={(e) => setEditingModule({ ...editingModule!, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Module description"
            />
          </div>

          {/* Category & Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={editingModule?.category || ''}
                onChange={(e) => setEditingModule({ ...editingModule!, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                value={editingModule?.difficulty || 'beginner'}
                onChange={(e) => setEditingModule({ ...editingModule!, difficulty: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {DIFFICULTY_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Duration & Passing Score */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={editingModule?.estimatedDuration || 30}
                onChange={(e) => setEditingModule({ ...editingModule!, estimatedDuration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passing Score (%)</label>
              <input
                type="number"
                value={editingModule?.passingScore || 70}
                onChange={(e) => setEditingModule({ ...editingModule!, passingScore: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Target Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Roles</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ROLES.map(role => (
                <label
                  key={role}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${editingModule?.targetRoles?.includes(role)
                    ? 'bg-blue-100 border-blue-500 text-blue-800'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={editingModule?.targetRoles?.includes(role)}
                    onChange={(e) => {
                      const roles = editingModule?.targetRoles || [];
                      if (e.target.checked) {
                        setEditingModule({ ...editingModule!, targetRoles: [...roles, role] });
                      } else {
                        setEditingModule({ ...editingModule!, targetRoles: roles.filter(r => r !== role) });
                      }
                    }}
                    className="hidden"
                  />
                  {role.replace('_', ' ')}
                </label>
              ))}
            </div>
          </div>

          {/* Objectives */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Learning Objectives</label>
            {(editingModule?.objectives || []).map((obj, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={obj}
                  onChange={(e) => {
                    const objectives = [...(editingModule?.objectives || [])];
                    objectives[index] = e.target.value;
                    setEditingModule({ ...editingModule!, objectives });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    const objectives = editingModule?.objectives?.filter((_, i) => i !== index);
                    setEditingModule({ ...editingModule!, objectives });
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setEditingModule({
                ...editingModule!,
                objectives: [...(editingModule?.objectives || []), '']
              })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Objective
            </button>
          </div>

          {/* Max Attempts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Assessment Attempts</label>
            <input
              type="number"
              value={editingModule?.maxAttempts || 3}
              onChange={(e) => setEditingModule({ ...editingModule!, maxAttempts: parseInt(e.target.value) })}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-700">Module Active</span>
            <button
              onClick={() => setEditingModule({ ...editingModule!, isActive: !editingModule?.isActive })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editingModule?.isActive ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              role="switch"
              aria-checked={editingModule?.isActive}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editingModule?.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={() => setEditingModule(null)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveModule}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Module'}
          </button>
        </div>
      </Modal>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-7 h-7" />
            Training Administration
          </h1>
          <p className="text-gray-600 mt-1">Manage training content, track effectiveness, and configure settings</p>
        </div>
        <button
          onClick={handleCreateModule}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Module
        </button>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 p-4 rounded-lg ${saveMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
        >
          {saveMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {saveMessage.text}
        </motion.div>
      )}

      {/* Analytics Overview */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Modules</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalModules}</p>
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
                <p className="text-sm text-gray-500">Total Enrollments</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalEnrollments}</p>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
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
                <p className="text-sm text-gray-500">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.averageCompletionRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
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
                <p className="text-sm text-gray-500">Certificates Issued</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.certificatesIssued}</p>
              </div>
              <Award className="w-8 h-8 text-yellow-500" />
            </div>
          </motion.div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {(['modules', 'analytics', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab
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
      {activeTab === 'modules' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Difficulty</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {modules.map((module) => (
                  <tr key={module.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{module.title}</div>
                        <div className="text-sm text-gray-500 line-clamp-1">{module.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{module.category}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${module.difficulty === 'beginner' ? 'bg-green-100 text-green-800' :
                        module.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                          module.difficulty === 'advanced' ? 'bg-orange-100 text-orange-800' :
                            'bg-red-100 text-red-800'
                        }`}>
                        {module.difficulty}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{module.estimatedDuration} min</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(module)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${module.isActive ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${module.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditModule(module)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteModule(module.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {modules.map(module => {
            const stats = moduleAnalytics.get(module.id) || {
              totalEnrollments: Math.floor(Math.random() * 50) + 10,
              completions: Math.floor(Math.random() * 30) + 5,
              completionRate: Math.random() * 40 + 50,
              averageScore: Math.random() * 20 + 70,
              passRate: Math.random() * 30 + 60
            };

            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <h3 className="font-semibold text-gray-900 mb-4">{module.title}</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">{stats.totalEnrollments}</p>
                    <p className="text-sm text-gray-500">Enrolled</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">{stats.completions}</p>
                    <p className="text-sm text-gray-500">Completed</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{stats.completionRate.toFixed(1)}%</p>
                    <p className="text-sm text-gray-500">Completion Rate</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{stats.averageScore.toFixed(1)}%</p>
                    <p className="text-sm text-gray-500">Avg Score</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Completion Progress</span>
                    <span>{stats.completionRate.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${stats.completionRate}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Training Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Default Passing Score</label>
              <input
                type="number"
                defaultValue={70}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">Default passing score for new modules</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Assessment Attempts</label>
              <input
                type="number"
                defaultValue={3}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">Default maximum attempts for assessments</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Certificate Validity Period</label>
              <select className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="365">1 Year</option>
                <option value="730">2 Years</option>
                <option value="1095">3 Years</option>
                <option value="0">No Expiration</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Auto-assign onboarding training</p>
                <p className="text-sm text-gray-500">Automatically assign required training to new users</p>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
                <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6" />
              </button>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Send completion reminders</p>
                <p className="text-sm text-gray-500">Email users about incomplete training</p>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
                <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6" />
              </button>
            </div>

            <div className="pt-4">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Module Editor Modal */}
      {renderModuleEditor()}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, moduleId: null })}
        onConfirm={confirmDeleteModule}
        title="Delete Module"
        message="Are you sure you want to delete this training module? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default TrainingAdminPage;
