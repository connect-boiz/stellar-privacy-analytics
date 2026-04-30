import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Lock, 
  Key, 
  Zap, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Info,
  Play,
  Pause,
  RotateCcw,
  Cpu,
  MemoryStick,
  Timer,
  FileText,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  CircuitBoard,
  Network,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ProofStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  duration?: number;
  details?: string[];
}

interface CircuitNode {
  id: string;
  type: 'input' | 'output' | 'gate' | 'constraint';
  label: string;
  position: { x: number; y: number };
  connections: string[];
}

interface ProofType {
  id: string;
  name: string;
  description: string;
  proverTime: string;
  verifierTime: string;
  proofSize: string;
  setupRequired: boolean;
  trustedSetup: boolean;
  features: string[];
}

interface PerformanceMetrics {
  proofGenerationTime: number;
  verificationTime: number;
  proofSize: number;
  memoryUsage: number;
  circuitSize: number;
  constraints: number;
}

const PROOF_TYPES: ProofType[] = [
  {
    id: 'groth16',
    name: 'Groth16',
    description: 'Optimized for fastest verification with small proof size',
    proverTime: 'Medium',
    verifierTime: 'Very Fast',
    proofSize: 'Small (128 bytes)',
    setupRequired: true,
    trustedSetup: true,
    features: [
      'Smallest proof size among zk-SNARKs',
      'Fastest verification time',
      'Requires trusted setup ceremony',
      'Circuit-specific setup'
    ]
  },
  {
    id: 'plonk',
    name: 'PLONK',
    description: 'Universal setup with flexible circuit design',
    proverTime: 'Medium',
    verifierTime: 'Fast',
    proofSize: 'Medium (~500 bytes)',
    setupRequired: true,
    trustedSetup: false,
    features: [
      'Universal setup (permutation)',
      'No trusted setup required',
      'Flexible circuit updates',
      'Batch verification support'
    ]
  },
  {
    id: 'bulletproofs',
    name: 'Bulletproofs',
    description: 'No setup required with range proofs',
    proverTime: 'Slow',
    verifierTime: 'Medium',
    proofSize: 'Large (logarithmic)',
    setupRequired: false,
    trustedSetup: false,
    features: [
      'No trusted setup',
      'Excellent for range proofs',
      'Proof size logarithmic in witness',
      'Slower verification'
    ]
  }
];

const ZKProofVisualization: React.FC = () => {
  const [selectedProofType, setSelectedProofType] = useState<string>('groth16');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [proofSteps, setProofSteps] = useState<ProofStep[]>([]);
  const [circuitNodes, setCircuitNodes] = useState<CircuitNode[]>([]);
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1);

  // Initialize proof generation steps
  const initializeProofSteps = useCallback(() => {
    const steps: ProofStep[] = [
      {
        id: 'setup',
        title: 'Trusted Setup',
        description: 'Generate proving and verification keys',
        status: 'pending',
        details: ['Create toxic waste', 'Generate parameters', 'Discard secrets']
      },
      {
        id: 'witness',
        title: 'Witness Computation',
        description: 'Compute witness from private inputs',
        status: 'pending',
        details: ['Evaluate circuit', 'Generate assignments', 'Satisfy constraints']
      },
      {
        id: 'commitment',
        title: 'Commitment Scheme',
        description: 'Create polynomial commitments',
        status: 'pending',
        details: ['Encode witness', 'Generate commitments', 'Hide information']
      },
      {
        id: 'challenge',
        title: 'Challenge Generation',
        description: 'Verifier generates random challenge',
        status: 'pending',
        details: ['Random oracle', 'Fiat-Shamir transform', 'Non-interactive']
      },
      {
        id: 'response',
        title: 'Response Computation',
        description: 'Prover computes response to challenge',
        status: 'pending',
        details: ['Evaluate polynomials', 'Compute proofs', 'Generate response']
      },
      {
        id: 'verification',
        title: 'Verification',
        description: 'Verifier checks proof validity',
        status: 'pending',
        details: ['Check equations', 'Verify commitments', 'Accept or reject']
      }
    ];
    setProofSteps(steps);
  }, []);

  // Initialize circuit visualization
  const initializeCircuit = useCallback(() => {
    const nodes: CircuitNode[] = [
      { id: 'in1', type: 'input', label: 'Input A', position: { x: 50, y: 50 }, connections: ['g1'] },
      { id: 'in2', type: 'input', label: 'Input B', position: { x: 50, y: 150 }, connections: ['g1'] },
      { id: 'g1', type: 'gate', label: 'ADD', position: { x: 200, y: 100 }, connections: ['g2'] },
      { id: 'in3', type: 'input', label: 'Input C', position: { x: 50, y: 250 }, connections: ['g2'] },
      { id: 'g2', type: 'gate', label: 'MUL', position: { x: 350, y: 150 }, connections: ['out'] },
      { id: 'out', type: 'output', label: 'Output', position: { x: 500, y: 150 }, connections: [] },
      { id: 'c1', type: 'constraint', label: 'Constraint 1', position: { x: 200, y: 250 }, connections: [] },
      { id: 'c2', type: 'constraint', label: 'Constraint 2', position: { x: 350, y: 300 }, connections: [] }
    ];
    setCircuitNodes(nodes);
  }, []);

  // Simulate proof generation animation
  const runProofAnimation = useCallback(async () => {
    const steps = [...proofSteps];
    for (let i = 0; i < steps.length; i++) {
      if (!isPlaying) break;
      
      setCurrentStep(i);
      steps[i].status = 'active';
      setProofSteps([...steps]);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, (2000 / animationSpeed)));
      
      steps[i].status = 'completed';
      steps[i].duration = Math.random() * 500 + 100;
      setProofSteps([...steps]);
    }
    
    if (isPlaying) {
      // Generate mock metrics
      setMetrics({
        proofGenerationTime: Math.random() * 2000 + 1000,
        verificationTime: Math.random() * 100 + 10,
        proofSize: Math.random() * 400 + 100,
        memoryUsage: Math.random() * 512 + 128,
        circuitSize: Math.random() * 10000 + 5000,
        constraints: Math.floor(Math.random() * 100000 + 10000)
      });
      toast.success('Proof generation completed');
    }
    
    setIsPlaying(false);
    setCurrentStep(0);
  }, [proofSteps, isPlaying, animationSpeed]);

  // Reset animation
  const resetAnimation = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(0);
    initializeProofSteps();
    setMetrics(null);
  }, [initializeProofSteps]);

  // Toggle details section
  const toggleDetails = useCallback((id: string) => {
    setShowDetails(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeProofSteps();
    initializeCircuit();
  }, [initializeProofSteps, initializeCircuit]);

  // Run animation when playing
  useEffect(() => {
    if (isPlaying && currentStep === 0) {
      runProofAnimation();
    }
  }, [isPlaying, currentStep, runProofAnimation]);

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'input': return 'bg-blue-500';
      case 'output': return 'bg-green-500';
      case 'gate': return 'bg-purple-500';
      case 'constraint': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'active': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'failed': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const selectedProofData = PROOF_TYPES.find(pt => pt.id === selectedProofType);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">ZK Proof Visualization</h1>
                <p className="text-sm text-gray-600">Interactive demonstration of zero-knowledge proof systems</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Play</span>
                  </>
                )}
              </button>
              <button
                onClick={resetAnimation}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Proof Type Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Proof System</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PROOF_TYPES.map((type) => (
              <motion.div
                key={type.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedProofType(type.id);
                  resetAnimation();
                }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedProofType === type.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{type.name}</h3>
                  {type.trustedSetup && (
                    <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">
                      Trusted Setup
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-3">{type.description}</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>Prover Time: {type.proverTime}</div>
                  <div>Verifier Time: {type.verifierTime}</div>
                  <div>Proof Size: {type.proofSize}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Circuit Visualization */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CircuitBoard className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Circuit Construction</h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>Animation Speed:</span>
                <select
                  value={animationSpeed}
                  onChange={(e) => setAnimationSpeed(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                </select>
              </div>
            </div>
          </div>

          <div className="relative bg-gray-50 rounded-lg p-4 h-80">
            <svg className="w-full h-full">
              {/* Draw connections */}
              {circuitNodes.map((node) =>
                node.connections.map((connId) => {
                  const targetNode = circuitNodes.find(n => n.id === connId);
                  if (!targetNode) return null;
                  return (
                    <motion.line
                      key={`${node.id}-${connId}`}
                      x1={node.position.x + 40}
                      y1={node.position.y + 20}
                      x2={targetNode.position.x}
                      y2={targetNode.position.y + 20}
                      stroke={node.type === 'input' ? '#3b82f6' : '#8b5cf6'}
                      strokeWidth="2"
                      initial={{ pathLength: 0 }}
                      animate={{ 
                        pathLength: isPlaying && currentStep >= 1 ? 1 : 0,
                        opacity: isPlaying && currentStep >= 1 ? 1 : 0.3
                      }}
                      transition={{ duration: 1 / animationSpeed }}
                    />
                  );
                })
              )}

              {/* Draw nodes */}
              {circuitNodes.map((node, index) => (
                <motion.g
                  key={node.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: isPlaying && index <= currentStep ? 1 : 0.8,
                    opacity: isPlaying && index <= currentStep ? 1 : 0.5
                  }}
                  transition={{ delay: index * 0.2 / animationSpeed }}
                >
                  <rect
                    x={node.position.x}
                    y={node.position.y}
                    width={80}
                    height={40}
                    rx={8}
                    fill={getNodeTypeColor(node.type)}
                    opacity={0.2}
                  />
                  <rect
                    x={node.position.x}
                    y={node.position.y}
                    width={80}
                    height={40}
                    rx={8}
                    fill="none"
                    stroke={getNodeTypeColor(node.type)}
                    strokeWidth="2"
                  />
                  <text
                    x={node.position.x + 40}
                    y={node.position.y + 25}
                    textAnchor="middle"
                    className="text-xs font-medium"
                    fill="#374151"
                  >
                    {node.label}
                  </text>
                </motion.g>
              ))}
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span>Input</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span>Output</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-4 h-4 bg-purple-500 rounded"></div>
              <span>Gate</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-4 h-4 bg-orange-500 rounded"></div>
              <span>Constraint</span>
            </div>
          </div>
        </div>

        {/* Proof Generation Steps */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Zap className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Proof Generation Process</h2>
          </div>

          <div className="space-y-4">
            {proofSteps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.status === 'completed' ? 'bg-green-100 text-green-600' :
                      step.status === 'active' ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {step.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : step.status === 'active' ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{step.title}</h3>
                      <p className="text-sm text-gray-600">{step.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {step.duration && (
                      <div className="text-sm text-gray-500">
                        {step.duration.toFixed(0)}ms
                      </div>
                    )}
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStepStatusColor(step.status)}`}>
                      {step.status.toUpperCase()}
                    </div>
                    <button
                      onClick={() => toggleDetails(step.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {showDetails[step.id] ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showDetails[step.id] && step.details && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 pl-11"
                    >
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Step Details:</h4>
                        <ul className="space-y-1">
                          {step.details.map((detail, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-center">
                              <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Privacy Guarantees */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Eye className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Privacy Guarantees</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center space-x-2 mb-3">
                <EyeOff className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">Zero-Knowledge</h3>
              </div>
              <p className="text-sm text-purple-800 mb-3">
                The verifier learns nothing beyond the validity of the statement. No private information is revealed.
              </p>
              <div className="flex items-center space-x-2 text-xs text-purple-700">
                <Info className="w-4 h-4" />
                <span>Private inputs remain hidden throughout the process</span>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center space-x-2 mb-3">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Soundness</h3>
              </div>
              <p className="text-sm text-blue-800 mb-3">
                A malicious prover cannot convince the verifier of a false statement with non-negligible probability.
              </p>
              <div className="flex items-center space-x-2 text-xs text-blue-700">
                <Info className="w-4 h-4" />
                <span>False statements cannot be proven valid</span>
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center space-x-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-green-900">Completeness</h3>
              </div>
              <p className="text-sm text-green-800 mb-3">
                If the statement is true, an honest prover can always convince the verifier.
              </p>
              <div className="flex items-center space-x-2 text-xs text-green-700">
                <Info className="w-4 h-4" />
                <span>True statements can always be proven</span>
              </div>
            </div>

            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center space-x-2 mb-3">
                <Key className="w-5 h-5 text-orange-600" />
                <h3 className="font-semibold text-orange-900">Non-Interactivity</h3>
              </div>
              <p className="text-sm text-orange-800 mb-3">
                Proofs can be verified without interaction between prover and verifier using Fiat-Shamir heuristic.
              </p>
              <div className="flex items-center space-x-2 text-xs text-orange-700">
                <Info className="w-4 h-4" />
                <span>Single-round proof verification</span>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        {metrics && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg border border-gray-200 p-6 mb-6"
          >
            <div className="flex items-center space-x-2 mb-4">
              <Cpu className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Performance Metrics</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Timer className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-600">Proof Generation</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.proofGenerationTime.toFixed(0)}ms
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Clock className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-600">Verification Time</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.verificationTime.toFixed(0)}ms
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span className="text-sm text-gray-600">Proof Size</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.proofSize.toFixed(0)} bytes
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <MemoryStick className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-gray-600">Memory Usage</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.memoryUsage.toFixed(0)} MB
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <CircuitBoard className="w-4 h-4 text-cyan-600" />
                  <span className="text-sm text-gray-600">Circuit Size</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.circuitSize.toFixed(0)} gates
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Network className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-gray-600">Constraints</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.constraints.toLocaleString()}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Proof Type Details */}
        {selectedProofData && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center space-x-2 mb-4">
              <FileText className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedProofData.name} Details
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Features</h3>
                <ul className="space-y-2">
                  {selectedProofData.features.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-600 flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Characteristics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Setup Required:</span>
                    <span className="font-medium text-gray-900">
                      {selectedProofData.setupRequired ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Trusted Setup:</span>
                    <span className="font-medium text-gray-900">
                      {selectedProofData.trustedSetup ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Prover Time:</span>
                    <span className="font-medium text-gray-900">
                      {selectedProofData.proverTime}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Verifier Time:</span>
                    <span className="font-medium text-gray-900">
                      {selectedProofData.verifierTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <a
                href={`https://docs.stellar-privacy-analytics.com/zk-proofs/${selectedProofType}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-sm text-purple-600 hover:text-purple-700"
              >
                <FileText className="w-4 h-4" />
                <span>View Documentation</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* Educational Resources */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Info className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-purple-900">Educational Resources</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="https://docs.stellar-privacy-analytics.com/zk-proofs/introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-medium text-gray-900">Introduction to ZK Proofs</div>
                <div className="text-sm text-gray-600">Learn the basics</div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
            </a>

            <a
              href="https://docs.stellar-privacy-analytics.com/zk-proofs/circuits"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors"
            >
              <CircuitBoard className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-medium text-gray-900">Arithmetic Circuits</div>
                <div className="text-sm text-gray-600">Understanding circuits</div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
            </a>

            <a
              href="https://docs.stellar-privacy-analytics.com/zk-proofs/comparison"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Network className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-medium text-gray-900">Proof System Comparison</div>
                <div className="text-sm text-gray-600">Groth16 vs PLONK vs Bulletproofs</div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
            </a>

            <a
              href="https://docs.stellar-privacy-analytics.com/zk-proofs/best-practices"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Shield className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-medium text-gray-900">Best Practices</div>
                <div className="text-sm text-gray-600">Security considerations</div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZKProofVisualization;
