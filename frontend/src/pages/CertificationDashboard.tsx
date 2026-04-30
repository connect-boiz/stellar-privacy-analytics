import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { 
  Shield, 
  Award, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Download,
  Share2,
  Eye,
  RefreshCw,
  Plus,
  Filter,
  Search,
  ExternalLink,
  FileText,
  Calendar,
  Settings,
  BarChart3,
  Globe,
  Lock,
  Users,
  TrendingUp,
  Activity,
  Zap,
  Target,
  BookOpen,
  Certificate,
  Link2,
  Mail,
  Copy,
  CheckSquare,
  AlertCircle,
  ChevronRight,
  Star,
  AwardIcon
} from 'lucide-react';
import { certificationService, Certification, ComplianceCheck, IndustryStandard, CertificationRequest, BadgeConfig } from '../services/certificationService';
import { CertificationGenerationForm } from '../components/certification/CertificationGenerationForm';
import { ValidationWorkflow } from '../components/certification/ValidationWorkflow';
import { BadgeDisplay } from '../components/certification/BadgeDisplay';
import { ComplianceChecker } from '../components/certification/ComplianceChecker';
import { PublicVerificationPortal } from '../components/certification/PublicVerificationPortal';
import { CertificationHistory } from '../components/certification/CertificationHistory';
import { CertificationDashboardSkeleton } from '@/components/skeletons';

const CertificationDashboard: React.FC = () => {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'validation' | 'compliance' | 'badges' | 'verification'>('overview');
  const [industryStandards, setIndustryStandards] = useState<IndustryStandard[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    validated: 0,
    pending: 0,
    expired: 0,
    revoked: 0,
    expiringSoon: 0
  });

  useEffect(() => {
    fetchCertifications();
    fetchIndustryStandards();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [certifications]);

  const fetchCertifications = async () => {
    try {
      setLoading(true);
      const data = await certificationService.getCertifications();
      setCertifications(data);
    } catch (error) {
      toast.error('Failed to fetch certifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndustryStandards = async () => {
    try {
      const data = await certificationService.getIndustryStandards();
      setIndustryStandards(data);
    } catch (error) {
      console.error('Failed to fetch industry standards:', error);
    }
  };

  const calculateStats = () => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const newStats = {
      total: certifications.length,
      validated: certifications.filter(c => c.status === 'validated').length,
      pending: certifications.filter(c => c.status === 'pending').length,
      expired: certifications.filter(c => c.status === 'expired').length,
      revoked: certifications.filter(c => c.status === 'revoked').length,
      expiringSoon: certifications.filter(c => {
        const expiryDate = new Date(c.expiryDate);
        return c.status === 'validated' && expiryDate <= thirtyDaysFromNow && expiryDate > now;
      }).length
    };
    
    setStats(newStats);
  };

  const filteredCertifications = certifications.filter(cert => {
    const matchesSearch = cert.organizationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cert.certificationType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || cert.status === filterStatus;
    const matchesType = filterType === 'all' || cert.certificationType === filterType;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'validated':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'expired':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'revoked':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'revoked':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'GDPR': 'bg-blue-100 text-blue-800',
      'CCPA': 'bg-orange-100 text-orange-800',
      'HIPAA': 'bg-purple-100 text-purple-800',
      'ISO27001': 'bg-green-100 text-green-800',
      'SOC2': 'bg-indigo-100 text-indigo-800',
      'CUSTOM': 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const handleGenerateCertification = (request: CertificationRequest) => {
    certificationService.createCertification(request)
      .then((newCertification) => {
        setCertifications(prev => [...prev, newCertification]);
        setShowGenerateModal(false);
        toast.success('Certification created successfully');
      })
      .catch((error) => {
        toast.error('Failed to create certification');
      });
  };

  const handleViewDetails = (certification: Certification) => {
    setSelectedCertification(certification);
    setShowDetailsModal(true);
  };

  const handleValidation = (certification: Certification) => {
    setSelectedCertification(certification);
    setShowValidationModal(true);
  };

  const handleComplianceCheck = (certification: Certification) => {
    setSelectedCertification(certification);
    setShowComplianceModal(true);
  };

  const handleViewHistory = (certification: Certification) => {
    setSelectedCertification(certification);
    setShowHistoryModal(true);
  };

  const handleRenewCertification = async (certificationId: string) => {
    try {
      const renewedCert = await certificationService.renewCertification(certificationId);
      setCertifications(prev => prev.map(cert => 
        cert.id === certificationId ? renewedCert : cert
      ));
      toast.success('Certification renewed successfully');
    } catch (error) {
      toast.error('Failed to renew certification');
    }
  };

  const handleDownloadBadge = async (certificationId: string, format: 'svg' | 'png' | 'pdf' = 'png') => {
    try {
      const blob = await certificationService.downloadBadge(certificationId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certification-badge-${certificationId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Badge downloaded successfully');
    } catch (error) {
      toast.error('Failed to download badge');
    }
  };

  const handleShareBadge = async (certification: Certification) => {
    try {
      if (certification.publicVerificationUrl) {
        await navigator.clipboard.writeText(certification.publicVerificationUrl);
        toast.success('Verification link copied to clipboard');
      } else {
        toast.error('No public verification URL available');
      }
    } catch (error) {
      toast.error('Failed to copy verification link');
    }
  };

  const handleRunComplianceCheck = async (certificationId: string) => {
    try {
      const certification = certifications.find(c => c.id === certificationId);
      if (!certification) return;
      
      const standards = [certification.certificationType];
      const complianceResult = await certificationService.runComplianceCheck(certificationId, standards);
      
      // Update certification with new compliance check
      setCertifications(prev => prev.map(cert => 
        cert.id === certificationId 
          ? { ...cert, complianceHistory: [...cert.complianceHistory, complianceResult] }
          : cert
      ));
      
      toast.success('Compliance check completed');
    } catch (error) {
      toast.error('Failed to run compliance check');
    }
  };

  if (loading) {
    return <CertificationDashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-600" />
            Privacy Certification Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Manage and track your privacy certifications and compliance badges
          </p>
        </div>
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowVerificationModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Globe className="w-5 h-5" />
            Public Portal
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Generate Certification
          </motion.button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow p-1">
        <div className="flex space-x-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'validation', label: 'Validation', icon: CheckSquare },
            { id: 'compliance', label: 'Compliance', icon: Shield },
            { id: 'badges', label: 'Badges', icon: Award },
            { id: 'verification', label: 'Verification', icon: Globe }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Award className="w-8 h-8 text-blue-600" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Validated</p>
              <p className="text-2xl font-bold text-green-600">{stats.validated}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Expired</p>
              <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revoked</p>
              <p className="text-2xl font-bold text-red-700">{stats.revoked}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-700" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-lg shadow p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Expiring Soon</p>
              <p className="text-2xl font-bold text-orange-600">{stats.expiringSoon}</p>
            </div>
            <Calendar className="w-8 h-8 text-orange-600" />
          </div>
        </motion.div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search certifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="validated">Validated</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="GDPR">GDPR</option>
              <option value="CCPA">CCPA</option>
              <option value="HIPAA">HIPAA</option>
              <option value="ISO27001">ISO27001</option>
              <option value="SOC2">SOC2</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
        </div>
      </div>

      {/* Certifications List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Privacy Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issued
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCertifications.map((certification, index) => (
                <motion.tr
                  key={certification.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="hover:bg-gray-50"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {certification.organizationName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {certification.contactEmail}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(certification.certificationType)}`}>
                      {certification.certificationType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(certification.status)}
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(certification.status)}`}>
                        {certification.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      certification.privacyLevel === 'high' ? 'bg-red-100 text-red-800' :
                      certification.privacyLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {certification.privacyLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(certification.issuedDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(certification.expiryDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(certification)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadBadge(certification.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Download Badge"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleShareBadge(certification.id)}
                        className="text-purple-600 hover:text-purple-900"
                        title="Share Badge"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRunComplianceCheck(certification.id)}
                        className="text-orange-600 hover:text-orange-900"
                        title="Run Compliance Check"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Certification Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
          >
            <h2 className="text-xl font-bold mb-4">Generate New Certification</h2>
            <p className="text-gray-600 mb-4">
              Create a new privacy certification for your analysis.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  toast.success('Certification generation initiated');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Generate
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Certification Details Modal */}
      {showDetailsModal && selectedCertification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Certification Details</h2>
                <p className="text-gray-600">{selectedCertification.organizationName}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Certification ID</p>
                  <p className="font-medium">{selectedCertification.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Type</p>
                  <p className="font-medium">{selectedCertification.certificationType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium">{selectedCertification.status}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Privacy Level</p>
                  <p className="font-medium">{selectedCertification.privacyLevel}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Issued Date</p>
                  <p className="font-medium">{new Date(selectedCertification.issuedDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Expiry Date</p>
                  <p className="font-medium">{new Date(selectedCertification.expiryDate).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600">Verification Code</p>
                <p className="font-mono text-sm bg-gray-100 p-2 rounded">{selectedCertification.verificationCode}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">Contact Email</p>
                <p className="font-medium">{selectedCertification.contactEmail}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
              <button
                onClick={() => handleDownloadBadge(selectedCertification.id)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Download Badge
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CertificationDashboard;
