import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Play, 
  Save, 
  Share2, 
  Download, 
  Upload, 
  Plus, 
  Trash2, 
  Settings,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  Shield,
  Database,
  Filter,
  BarChart3,
  Users,
  Target
} from 'lucide-react';

import { CollaborationPanel } from '../components/workflow/CollaborationPanel';

interface WorkflowNode {
  id: string;
  type: 'data-source' | 'privacy-filter' | 'aggregation' | 'visualization' | 'export';
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  config?: Record<string, any>;
  position: { x: number; y: number };
}

interface WorkflowConnection {
  id: string;
  sourceId: string;
  targetId: string;
}

const nodeTypes = [
  {
    type: 'data-source' as const,
    name: 'Data Source',
    description: 'Connect to encrypted data sources',
    icon: Database,
    color: 'bg-blue-500',
    category: 'Input'
  },
  {
    type: 'privacy-filter' as const,
    name: 'Privacy Filter',
    description: 'Apply differential privacy and anonymization',
    icon: Shield,
    color: 'bg-purple-500',
    category: 'Privacy'
  },
  {
    type: 'aggregation' as const,
    name: 'Aggregation',
    description: 'Aggregate data with privacy guarantees',
    icon: Filter,
    color: 'bg-green-500',
    category: 'Transform'
  },
  {
    type: 'visualization' as const,
    name: 'Visualization',
    description: 'Create privacy-preserving visualizations',
    icon: BarChart3,
    color: 'bg-orange-500',
    category: 'Output'
  },
  {
    type: 'export' as const,
    name: 'Export',
    description: 'Export results securely',
    icon: Download,
    color: 'bg-gray-500',
    category: 'Output'
  }
];

const templates = [
  {
    id: 'customer-analysis',
    name: 'Customer Behavior Analysis',
    description: 'Analyze customer patterns with differential privacy',
    nodes: [
      { type: 'data-source', name: 'Customer Data', position: { x: 100, y: 100 } },
      { type: 'privacy-filter', name: 'Privacy Filter', position: { x: 300, y: 100 } },
      { type: 'aggregation', name: 'Aggregate Metrics', position: { x: 500, y: 100 } },
      { type: 'visualization', name: 'Dashboard', position: { x: 700, y: 100 } }
    ]
  },
  {
    id: 'sales-forecast',
    name: 'Sales Forecasting',
    description: 'Predict sales trends while protecting data',
    nodes: [
      { type: 'data-source', name: 'Sales Data', position: { x: 100, y: 100 } },
      { type: 'privacy-filter', name: 'Noise Addition', position: { x: 300, y: 100 } },
      { type: 'aggregation', name: 'Time Series', position: { x: 500, y: 100 } },
      { type: 'visualization', name: 'Forecast Chart', position: { x: 700, y: 100 } }
    ]
  },
  {
    id: 'user-segmentation',
    name: 'User Segmentation',
    description: 'Cluster users with privacy protection',
    nodes: [
      { type: 'data-source', name: 'User Data', position: { x: 100, y: 100 } },
      { type: 'privacy-filter', name: 'K-Anonymity', position: { x: 300, y: 100 } },
      { type: 'aggregation', name: 'Clustering', position: { x: 500, y: 100 } },
      { type: 'visualization', name: 'Segment View', position: { x: 700, y: 100 } }
    ]
  }
];

export const WorkflowBuilder: React.FC = () => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggedNodeType, setDraggedNodeType] = useState<typeof nodeTypes[0] | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [isRunning, setIsRunning] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showCollaboration, setShowCollaboration] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  const validateWorkflow = useCallback(() => {
    const errors: string[] = [];
    
    if (nodes.length === 0) {
      errors.push('Workflow must contain at least one node');
    }
    
    const hasDataSource = nodes.some(n => n.type === 'data-source');
    if (!hasDataSource) {
      errors.push('Workflow must include a data source');
    }
    
    const hasOutput = nodes.some(n => n.type === 'visualization' || n.type === 'export');
    if (!hasOutput) {
      errors.push('Workflow must include an output node (visualization or export)');
    }
    
    const dataSourceCount = nodes.filter(n => n.type === 'data-source').length;
    if (dataSourceCount > 1) {
      errors.push('Workflow can only have one data source');
    }
    
    setValidationErrors(errors);
    return errors.length === 0;
  }, [nodes]);

  const handleDragStart = (e: React.DragEvent, nodeType: typeof nodeTypes[0]) => {
    setDraggedNodeType(nodeType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedNodeType || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newNode: WorkflowNode = {
      id: `${draggedNodeType.type}-${Date.now()}`,
      type: draggedNodeType.type,
      name: draggedNodeType.name,
      description: draggedNodeType.description,
      icon: draggedNodeType.icon,
      color: draggedNodeType.color,
      position: { x, y }
    };
    
    setNodes(prev => [...prev, newNode]);
    setDraggedNodeType(null);
    validateWorkflow();
  };

  const handleNodeDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('nodeId', nodeId);
  };

  const handleNodeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    const nodeId = e.dataTransfer.getData('nodeId');
    if (!canvasRef.current || !nodeId) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, position: { x, y } } : node
    ));
  };

  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId));
    if (selectedNode === nodeId) {
      setSelectedNode(null);
    }
    validateWorkflow();
  };

  const loadTemplate = (template: typeof templates[0]) => {
    const newNodes: WorkflowNode[] = template.nodes.map((nodeData, index) => {
      const nodeType = nodeTypes.find(nt => nt.type === nodeData.type);
      return {
        id: `${nodeData.type}-${Date.now()}-${index}`,
        type: nodeData.type,
        name: nodeData.name,
        description: nodeType?.description || '',
        icon: nodeType?.icon || Database,
        color: nodeType?.color || 'bg-gray-500',
        position: nodeData.position
      };
    });
    
    setNodes(newNodes);
    setConnections([]);
    validateWorkflow();
  };

  const runWorkflow = async () => {
    if (!validateWorkflow()) return;
    
    setIsRunning(true);
    // Simulate workflow execution
    setTimeout(() => {
      setIsRunning(false);
      setIsPreviewMode(true);
    }, 3000);
  };

  const exportWorkflow = () => {
    const workflowData = {
      name: workflowName,
      nodes,
      connections,
      createdAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="text-xl font-semibold bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1"
            />
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>Auto-saved 2 min ago</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isPreviewMode 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </button>
            
            <button
              onClick={runWorkflow}
              disabled={isRunning}
              className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run
                </>
              )}
            </button>
            
            <button className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              <Save className="h-4 w-4 mr-2" />
              Save
            </button>
            
            <button 
              onClick={() => setShowCollaboration(!showCollaboration)}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showCollaboration 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </button>
            
            <button
              onClick={exportWorkflow}
              className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Templates */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Templates</h3>
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => loadTemplate(template)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{template.name}</div>
                  <div className="text-sm text-gray-600 mt-1">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Node Palette */}
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-3">Components</h3>
            <div className="space-y-2">
              {nodeTypes.map((nodeType) => {
                const Icon = nodeType.icon;
                return (
                  <div
                    key={nodeType.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, nodeType)}
                    className="flex items-center p-3 rounded-lg border border-gray-200 cursor-move hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className={`p-2 rounded ${nodeType.color}`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="ml-3">
                      <div className="font-medium text-gray-900">{nodeType.name}</div>
                      <div className="text-sm text-gray-600">{nodeType.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation Status */}
          {validationErrors.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-red-50">
              <div className="flex items-center mb-2">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                <h4 className="font-medium text-red-900">Validation Errors</h4>
              </div>
              <ul className="space-y-1 text-sm text-red-700">
                {validationErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col">
          {showCollaboration ? (
            <div className="flex-1 flex">
              <div className="flex-1">
                {isPreviewMode ? (
                  <div className="flex-1 p-6">
                    <div className="bg-white rounded-lg shadow-sm h-full p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview Results</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-2">Output Statistics</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Records Processed:</span>
                              <span className="font-medium">1,247</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Privacy Budget Used:</span>
                              <span className="font-medium text-green-600">0.3</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Noise Added:</span>
                              <span className="font-medium">ε = 0.1</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-2">Visualization</h4>
                          <div className="h-32 bg-blue-100 rounded flex items-center justify-center">
                            <BarChart3 className="h-8 w-8 text-blue-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div 
                    ref={canvasRef}
                    className="flex-1 relative bg-gray-100 overflow-auto"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
                    
                    {/* Render nodes */}
                    {nodes.map((node) => {
                      const Icon = node.icon;
                      return (
                        <motion.div
                          key={node.id}
                          draggable
                          onDragStart={(e) => handleNodeDragStart(e, node.id)}
                          onDragOver={handleDragOver}
                          onDrop={handleNodeDrop}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          whileHover={{ scale: 1.05 }}
                          className={`absolute w-32 p-3 rounded-lg shadow-lg cursor-move border-2 ${
                            selectedNode === node.id 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-white bg-white'
                          }`}
                          style={{ left: node.position.x - 64, top: node.position.y - 40 }}
                          onClick={() => setSelectedNode(node.id)}
                        >
                          <div className="flex flex-col items-center">
                            <div className={`p-2 rounded ${node.color}`}>
                              <Icon className="h-4 w-4 text-white" />
                            </div>
                            <div className="mt-2 text-xs font-medium text-gray-900 text-center">
                              {node.name}
                            </div>
                          </div>
                          
                          {selectedNode === node.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNode(node.id);
                              }}
                              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </motion.div>
                      );
                    })}
                    
                    {nodes.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-gray-400 mb-4">
                            <Target className="h-12 w-12 mx-auto" />
                          </div>
                          <p className="text-gray-600 font-medium">Drag components here to start building</p>
                          <p className="text-gray-500 text-sm mt-1">Or select a template from the sidebar</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Collaboration Panel */}
              <div className="w-80 border-l border-gray-200">
                <CollaborationPanel />
              </div>
            </div>
          ) : (
            <>
              {isPreviewMode ? (
                <div className="flex-1 p-6">
                  <div className="bg-white rounded-lg shadow-sm h-full p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview Results</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Output Statistics</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Records Processed:</span>
                            <span className="font-medium">1,247</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Privacy Budget Used:</span>
                            <span className="font-medium text-green-600">0.3</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Noise Added:</span>
                            <span className="font-medium">ε = 0.1</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Visualization</h4>
                        <div className="h-32 bg-blue-100 rounded flex items-center justify-center">
                          <BarChart3 className="h-8 w-8 text-blue-600" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  ref={canvasRef}
                  className="flex-1 relative bg-gray-100 overflow-auto"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
                  
                  {/* Render nodes */}
                  {nodes.map((node) => {
                    const Icon = node.icon;
                    return (
                      <motion.div
                        key={node.id}
                        draggable
                        onDragStart={(e) => handleNodeDragStart(e, node.id)}
                        onDragOver={handleDragOver}
                        onDrop={handleNodeDrop}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        className={`absolute w-32 p-3 rounded-lg shadow-lg cursor-move border-2 ${
                          selectedNode === node.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-white bg-white'
                        }`}
                        style={{ left: node.position.x - 64, top: node.position.y - 40 }}
                        onClick={() => setSelectedNode(node.id)}
                      >
                        <div className="flex flex-col items-center">
                          <div className={`p-2 rounded ${node.color}`}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <div className="mt-2 text-xs font-medium text-gray-900 text-center">
                            {node.name}
                          </div>
                        </div>
                        
                        {selectedNode === node.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNode(node.id);
                            }}
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                  
                  {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-gray-400 mb-4">
                          <Target className="h-12 w-12 mx-auto" />
                        </div>
                        <p className="text-gray-600 font-medium">Drag components here to start building</p>
                        <p className="text-gray-500 text-sm mt-1">Or select a template from the sidebar</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
