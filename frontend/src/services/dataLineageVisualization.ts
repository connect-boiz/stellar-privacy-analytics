/**
 * Data Lineage Visualization Service
 */

import {
  DatasetMetadata,
  LineageMetadata,
  LineageNode,
  LineageTransformation,
  LineageGraph,
  LineageGraphNode,
  LineageGraphEdge,
  GraphLayout,
  GraphPosition,
  NodeStyle,
  EdgeStyle
} from '../types/dataCatalog';

export interface LineageVisualizationConfig {
  maxNodes: number;
  maxDepth: number;
  layoutAlgorithm: 'force' | 'hierarchical' | 'circular' | 'grid' | 'tree';
  animationEnabled: boolean;
  interactionEnabled: boolean;
  clusteringEnabled: boolean;
  filteringEnabled: boolean;
  privacyMode: boolean;
}

export interface VisualizationTheme {
  name: string;
  colors: {
    background: string;
    nodes: Record<string, string>;
    edges: Record<string, string>;
    text: string;
    highlight: string;
  };
  fonts: {
    node: string;
    edge: string;
    label: string;
  };
  sizes: {
    node: {
      min: number;
      max: number;
    };
    edge: {
      min: number;
      max: number;
    };
  };
  styles: {
    borderRadius: number;
    shadow: boolean;
    gradient: boolean;
  };
}

export interface LineageFilter {
  type: 'node' | 'edge' | 'transformation' | 'time' | 'privacy' | 'custom';
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'between';
  value: any;
  active: boolean;
}

export interface LineageCluster {
  id: string;
  name: string;
  type: 'department' | 'domain' | 'system' | 'process' | 'custom';
  nodes: string[];
  color: string;
  style: ClusterStyle;
}

export interface ClusterStyle {
  border: string;
  background: string;
  opacity: number;
    borderRadius: number;
  padding: number;
}

export interface LineageInteraction {
  type: 'click' | 'hover' | 'select' | 'expand' | 'collapse' | 'filter' | 'highlight';
  target: string;
  action: string;
  parameters: Record<string, any>;
}

export interface LineageAnimation {
  type: 'flow' | 'pulse' | 'highlight' | 'transition' | 'growth';
  target: string;
  duration: number;
  easing: string;
  delay: number;
  loop: boolean;
}

export interface LineageLayout {
  algorithm: 'force' | 'hierarchical' | 'circular' | 'grid' | 'tree' | 'custom';
  parameters: Record<string, any>;
  clusters: LineageCluster[];
  constraints: LayoutConstraint[];
}

export interface LayoutConstraint {
  type: 'fixed_position' | 'distance' | 'alignment' | 'avoidance' | 'custom';
  source: string;
  target?: string;
  parameters: Record<string, any>;
  strength: number;
}

export class DataLineageVisualization {
  private static instance: DataLineageVisualization;
  private config: LineageVisualizationConfig;
  private themes: Map<string, VisualizationTheme> = new Map();
  private currentTheme: string = 'default';
  private lineageCache: Map<string, LineageGraph> = new Map();
  private filters: LineageFilter[] = [];
  private clusters: LineageCluster[] = [];
  private interactions: LineageInteraction[] = [];
  private animations: LineageAnimation[] = [];

  private constructor(config: LineageVisualizationConfig) {
    this.config = config;
    this.initializeThemes();
    this.initializeDefaultFilters();
    this.initializeDefaultClusters();
  }

  static getInstance(config?: LineageVisualizationConfig): DataLineageVisualization {
    if (!DataLineageVisualization.instance) {
      if (!config) {
        config = {
          maxNodes: 1000,
          maxDepth: 10,
          layoutAlgorithm: 'force',
          animationEnabled: true,
          interactionEnabled: true,
          clusteringEnabled: true,
          filteringEnabled: true,
          privacyMode: true
        };
      }
      DataLineageVisualization.instance = new DataLineageVisualization(config);
    }
    return DataLineageVisualization.instance;
  }

  private initializeThemes(): void {
    const themes: VisualizationTheme[] = [
      {
        name: 'default',
        colors: {
          background: '#ffffff',
          nodes: {
            dataset: '#3b82f6',
            transformation: '#10b981',
            source: '#f59e0b',
            sink: '#ef4444',
            reference: '#8b5cf6'
          },
          edges: {
            data_flow: '#64748b',
            dependency: '#94a3b8',
            reference: '#cbd5e1'
          },
          text: '#1e293b',
          highlight: '#fbbf24'
        },
        fonts: {
          node: 'Arial, sans-serif',
          edge: 'Arial, sans-serif',
          label: 'Arial, sans-serif'
        },
        sizes: {
          node: { min: 20, max: 60 },
          edge: { min: 1, max: 5 }
        },
        styles: {
          borderRadius: 8,
          shadow: true,
          gradient: false
        }
      },
      {
        name: 'dark',
        colors: {
          background: '#1e293b',
          nodes: {
            dataset: '#60a5fa',
            transformation: '#34d399',
            source: '#fbbf24',
            sink: '#f87171',
            reference: '#a78bfa'
          },
          edges: {
            data_flow: '#475569',
            dependency: '#64748b',
            reference: '#94a3b8'
          },
          text: '#f1f5f9',
          highlight: '#fbbf24'
        },
        fonts: {
          node: 'Arial, sans-serif',
          edge: 'Arial, sans-serif',
          label: 'Arial, sans-serif'
        },
        sizes: {
          node: { min: 20, max: 60 },
          edge: { min: 1, max: 5 }
        },
        styles: {
          borderRadius: 8,
          shadow: true,
          gradient: true
        }
      },
      {
        name: 'privacy',
        colors: {
          background: '#fef3c7',
          nodes: {
            dataset: '#dc2626',
            transformation: '#059669',
            source: '#d97706',
            sink: '#7c2d12',
            reference: '#4c1d95'
          },
          edges: {
            data_flow: '#92400e',
            dependency: '#a16207',
            reference: '#b45309'
          },
          text: '#451a03',
          highlight: '#dc2626'
        },
        fonts: {
          node: 'Arial, sans-serif',
          edge: 'Arial, sans-serif',
          label: 'Arial, sans-serif'
        },
        sizes: {
          node: { min: 20, max: 60 },
          edge: { min: 1, max: 5 }
        },
        styles: {
          borderRadius: 12,
          shadow: true,
          gradient: true
        }
      }
    ];

    themes.forEach(theme => {
      this.themes.set(theme.name, theme);
    });
  }

  private initializeDefaultFilters(): void {
    this.filters = [
      {
        type: 'privacy',
        field: 'privacy.level',
        operator: 'in',
        value: ['public', 'internal'],
        active: this.config.privacyMode
      },
      {
        type: 'node',
        field: 'type',
        operator: 'in',
        value: ['dataset', 'transformation'],
        active: true
      }
    ];
  }

  private initializeDefaultClusters(): void {
    this.clusters = [
      {
        id: 'department_clusters',
        name: 'Department Clusters',
        type: 'department',
        nodes: [],
        color: '#e0e7ff',
        style: {
          border: '#6366f1',
          background: '#e0e7ff',
          opacity: 0.3,
          borderRadius: 16,
          padding: 20
        }
      },
      {
        id: 'system_clusters',
        name: 'System Clusters',
        type: 'system',
        nodes: [],
        color: '#dcfce7',
        style: {
          border: '#22c55e',
          background: '#dcfce7',
          opacity: 0.3,
          borderRadius: 16,
          padding: 20
        }
      }
    ];
  }

  // Main visualization methods
  public async generateLineageGraph(
    datasetId: string,
    metadata: DatasetMetadata,
    options: {
      includeUpstream?: boolean;
      includeDownstream?: boolean;
      maxDepth?: number;
      filters?: LineageFilter[];
    } = {}
  ): Promise<LineageGraph> {
    const cacheKey = this.generateCacheKey(datasetId, options);
    
    // Check cache first
    const cached = this.lineageCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build lineage graph
    const graph = await this.buildLineageGraph(datasetId, metadata, options);

    // Apply privacy filtering
    const privacyFilteredGraph = this.applyPrivacyFiltering(graph);

    // Apply clustering
    const clusteredGraph = this.applyClustering(privacyFilteredGraph);

    // Apply layout
    const layoutedGraph = this.applyLayout(clusteredGraph);

    // Apply styling
    const styledGraph = this.applyStyling(layoutedGraph);

    // Cache result
    this.lineageCache.set(cacheKey, styledGraph);

    return styledGraph;
  }

  private async buildLineageGraph(
    datasetId: string,
    metadata: DatasetMetadata,
    options: any
  ): Promise<LineageGraph> {
    const nodes: LineageGraphNode[] = [];
    const edges: LineageGraphEdge[] = [];
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();

    // Add root node
    const rootNode = this.createDatasetNode(metadata);
    nodes.push(rootNode);
    visitedNodes.add(datasetId);

    // Build upstream lineage
    if (options.includeUpstream !== false) {
      await this.buildUpstreamLineage(
        metadata,
        nodes,
        edges,
        visitedNodes,
        visitedEdges,
        0,
        options.maxDepth || this.config.maxDepth
      );
    }

    // Build downstream lineage
    if (options.includeDownstream !== false) {
      await this.buildDownstreamLineage(
        metadata,
        nodes,
        edges,
        visitedNodes,
        visitedEdges,
        0,
        options.maxDepth || this.config.maxDepth
      );
    }

    // Add transformations
    const transformations = this.extractTransformations(metadata);
    transformations.forEach(transformation => {
      const transformationNode = this.createTransformationNode(transformation);
      if (!visitedNodes.has(transformation.id)) {
        nodes.push(transformationNode);
        visitedNodes.add(transformation.id);
      }

      // Add edges for transformations
      transformation.sourceDatasets.forEach(sourceId => {
        const edgeId = `${sourceId}-${transformation.id}`;
        if (!visitedEdges.has(edgeId) && visitedNodes.has(sourceId)) {
          edges.push({
            source: sourceId,
            target: transformation.id,
            type: 'data_flow',
            weight: 0.8,
            style: this.getEdgeStyle('data_flow'),
            metadata: { transformation: transformation.id }
          });
          visitedEdges.add(edgeId);
        }
      });

      transformation.targetDatasets.forEach(targetId => {
        const edgeId = `${transformation.id}-${targetId}`;
        if (!visitedEdges.has(edgeId) && visitedNodes.has(targetId)) {
          edges.push({
            source: transformation.id,
            target: targetId,
            type: 'data_flow',
            weight: 0.8,
            style: this.getEdgeStyle('data_flow'),
            metadata: { transformation: transformation.id }
          });
          visitedEdges.add(edgeId);
        }
      });
    });

    return {
      nodes,
      edges,
      layout: {
        algorithm: this.config.layoutAlgorithm,
        parameters: this.getLayoutParameters(this.config.layoutAlgorithm),
        optimized: false
      },
      metadata: {
        generatedAt: Date.now(),
        version: '1.0',
        nodeCount: nodes.length,
        edgeCount: edges.length,
        depth: this.calculateGraphDepth(nodes, edges),
        cycles: this.detectCycles(nodes, edges)
      }
    };
  }

  private async buildUpstreamLineage(
    metadata: DatasetMetadata,
    nodes: LineageGraphNode[],
    edges: LineageGraphEdge[],
    visitedNodes: Set<string>,
    visitedEdges: Set<string>,
    currentDepth: number,
    maxDepth: number
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    for (const upstream of metadata.lineage.upstream) {
      if (!visitedNodes.has(upstream.datasetId)) {
        // Get upstream metadata (would fetch from data catalog)
        const upstreamMetadata = await this.getDatasetMetadata(upstream.datasetId);
        if (upstreamMetadata) {
          const upstreamNode = this.createDatasetNode(upstreamMetadata);
          nodes.push(upstreamNode);
          visitedNodes.add(upstream.datasetId);

          // Add edge
          const edgeId = `${upstream.datasetId}-${metadata.id}`;
          if (!visitedEdges.has(edgeId)) {
            edges.push({
              source: upstream.datasetId,
              target: metadata.id,
              type: upstream.connectionType === 'direct' ? 'data_flow' : 'dependency',
              weight: upstream.strength,
              style: this.getEdgeStyle(upstream.connectionType === 'direct' ? 'data_flow' : 'dependency'),
              metadata: upstream.metadata
            });
            visitedEdges.add(edgeId);
          }

          // Recursively build upstream
          await this.buildUpstreamLineage(
            upstreamMetadata,
            nodes,
            edges,
            visitedNodes,
            visitedEdges,
            currentDepth + 1,
            maxDepth
          );
        }
      }
    }
  }

  private async buildDownstreamLineage(
    metadata: DatasetMetadata,
    nodes: LineageGraphNode[],
    edges: LineageGraphEdge[],
    visitedNodes: Set<string>,
    visitedEdges: Set<string>,
    currentDepth: number,
    maxDepth: number
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    for (const downstream of metadata.lineage.downstream) {
      if (!visitedNodes.has(downstream.datasetId)) {
        // Get downstream metadata (would fetch from data catalog)
        const downstreamMetadata = await this.getDatasetMetadata(downstream.datasetId);
        if (downstreamMetadata) {
          const downstreamNode = this.createDatasetNode(downstreamMetadata);
          nodes.push(downstreamNode);
          visitedNodes.add(downstream.datasetId);

          // Add edge
          const edgeId = `${metadata.id}-${downstream.datasetId}`;
          if (!visitedEdges.has(edgeId)) {
            edges.push({
              source: metadata.id,
              target: downstream.datasetId,
              type: downstream.connectionType === 'direct' ? 'data_flow' : 'dependency',
              weight: downstream.strength,
              style: this.getEdgeStyle(downstream.connectionType === 'direct' ? 'data_flow' : 'dependency'),
              metadata: downstream.metadata
            });
            visitedEdges.add(edgeId);
          }

          // Recursively build downstream
          await this.buildDownstreamLineage(
            downstreamMetadata,
            nodes,
            edges,
            visitedNodes,
            visitedEdges,
            currentDepth + 1,
            maxDepth
          );
        }
      }
    }
  }

  private createDatasetNode(metadata: DatasetMetadata): LineageGraphNode {
    const theme = this.themes.get(this.currentTheme)!;
    const nodeType = this.getNodeType(metadata);
    const nodeColor = theme.colors.nodes[nodeType];
    const nodeSize = this.calculateNodeSize(metadata);

    return {
      id: metadata.id,
      label: metadata.name,
      type: 'dataset',
      position: { x: 0, y: 0 }, // Will be set by layout algorithm
      style: {
        color: nodeColor,
        size: nodeSize,
        shape: 'rectangle',
        border: theme.colors.text,
        icon: this.getNodeIcon(nodeType)
      },
      metadata: {
        dataset: metadata,
        privacy: metadata.privacy.level,
        quality: metadata.quality.overall.value,
        usage: metadata.usage.statistics.totalQueries
      }
    };
  }

  private createTransformationNode(transformation: LineageTransformation): LineageGraphNode {
    const theme = this.themes.get(this.currentTheme)!;

    return {
      id: transformation.id,
      label: transformation.name,
      type: 'transformation',
      position: { x: 0, y: 0 }, // Will be set by layout algorithm
      style: {
        color: theme.colors.nodes.transformation,
        size: 40,
        shape: 'diamond',
        border: theme.colors.text,
        icon: this.getTransformationIcon(transformation.type)
      },
      metadata: {
        transformation: transformation,
        type: transformation.type,
        timestamp: transformation.timestamp
      }
    };
  }

  private getNodeType(metadata: DatasetMetadata): string {
    // Determine node type based on metadata characteristics
    if (metadata.lineage.upstream.length === 0 && metadata.lineage.downstream.length > 0) {
      return 'source';
    } else if (metadata.lineage.upstream.length > 0 && metadata.lineage.downstream.length === 0) {
      return 'sink';
    } else if (metadata.lineage.upstream.length === 0 && metadata.lineage.downstream.length === 0) {
      return 'reference';
    }
    return 'dataset';
  }

  private getNodeIcon(nodeType: string): string {
    const iconMap: Record<string, string> = {
      dataset: '📊',
      source: '📥',
      sink: '📤',
      reference: '🔗',
      transformation: '⚙️'
    };
    return iconMap[nodeType] || '📊';
  }

  private getTransformationIcon(type: string): string {
    const iconMap: Record<string, string> = {
      filter: '🔍',
      join: '🔗',
      aggregate: '📊',
      transform: '🔄',
      enrich: '➕',
      cleanse: '🧹',
      anonymize: '🔒'
    };
    return iconMap[type] || '⚙️';
  }

  private calculateNodeSize(metadata: DatasetMetadata): number {
    const theme = this.themes.get(this.currentTheme)!;
    const { min, max } = theme.sizes.node;
    
    // Calculate size based on usage and importance
    const usageScore = Math.min(metadata.usage.statistics.totalQueries / 1000, 1);
    const qualityScore = metadata.quality.overall.value / 100;
    const importanceScore = (usageScore + qualityScore) / 2;
    
    return min + (max - min) * importanceScore;
  }

  private getEdgeStyle(edgeType: string): EdgeStyle {
    const theme = this.themes.get(this.currentTheme)!;
    const edgeColor = theme.colors.edges[edgeType] || theme.colors.edges.data_flow;
    
    return {
      color: edgeColor,
      width: 2,
      style: 'solid',
      arrow: edgeType === 'data_flow'
    };
  }

  private extractTransformations(metadata: DatasetMetadata): LineageTransformation[] {
    // Extract transformations from processing metadata
    return metadata.processing.pipelines.map(pipeline => ({
      id: pipeline.id,
      name: pipeline.name,
      type: pipeline.type as any,
      description: pipeline.description,
      sourceDatasets: pipeline.sources,
      targetDatasets: pipeline.targets,
      logic: '',
      parameters: pipeline.parameters,
      timestamp: pipeline.lastRun,
      owner: pipeline.createdBy
    }));
  }

  private async getDatasetMetadata(datasetId: string): Promise<DatasetMetadata | null> {
    // This would fetch metadata from the data catalog
    // For now, return null
    return null;
  }

  private applyPrivacyFiltering(graph: LineageGraph): LineageGraph {
    if (!this.config.privacyMode) {
      return graph;
    }

    const privacyFilter = this.filters.find(f => f.type === 'privacy' && f.active);
    if (!privacyFilter) {
      return graph;
    }

    // Filter nodes based on privacy level
    const filteredNodes = graph.nodes.filter(node => {
      const privacyLevel = node.metadata?.privacy;
      if (!privacyLevel) return true;
      
      return Array.isArray(privacyFilter.value) 
        ? privacyFilter.value.includes(privacyLevel)
        : privacyFilter.value === privacyLevel;
    });

    // Filter edges to only include filtered nodes
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graph.edges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    return {
      ...graph,
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        ...graph.metadata,
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length
      }
    };
  }

  private applyClustering(graph: LineageGraph): LineageGraph {
    if (!this.config.clusteringEnabled) {
      return graph;
    }

    const clusteredGraph = { ...graph };
    
    // Apply existing clusters
    this.clusters.forEach(cluster => {
      cluster.nodes = [];
      
      // Assign nodes to clusters based on metadata
      graph.nodes.forEach(node => {
        if (this.shouldAssignToCluster(node, cluster)) {
          cluster.nodes.push(node.id);
        }
      });
    });

    return clusteredGraph;
  }

  private shouldAssignToCluster(node: LineageGraphNode, cluster: LineageCluster): boolean {
    switch (cluster.type) {
      case 'department':
        return node.metadata?.dataset?.department === cluster.name;
      case 'system':
        return node.metadata?.dataset?.location?.source?.name === cluster.name;
      default:
        return false;
    }
  }

  private applyLayout(graph: LineageGraph): LineageGraph {
    const layoutedGraph = { ...graph };
    
    switch (this.config.layoutAlgorithm) {
      case 'force':
        layoutedGraph.nodes = this.applyForceLayout(graph);
        break;
      case 'hierarchical':
        layoutedGraph.nodes = this.applyHierarchicalLayout(graph);
        break;
      case 'circular':
        layoutedGraph.nodes = this.applyCircularLayout(graph);
        break;
      case 'grid':
        layoutedGraph.nodes = this.applyGridLayout(graph);
        break;
      case 'tree':
        layoutedGraph.nodes = this.applyTreeLayout(graph);
        break;
      default:
        layoutedGraph.nodes = this.applyForceLayout(graph);
    }

    layoutedGraph.layout.optimized = true;
    return layoutedGraph;
  }

  private applyForceLayout(graph: LineageGraph): LineageGraphNode[] {
    const nodes = [...graph.nodes];
    const edges = [...graph.edges];
    
    // Initialize positions randomly
    nodes.forEach(node => {
      node.position = {
        x: Math.random() * 800 - 400,
        y: Math.random() * 600 - 300
      };
    });

    // Apply force-directed layout algorithm
    const iterations = 100;
    const k = Math.sqrt((800 * 600) / nodes.length);
    const temperature = 0.1;

    for (let iter = 0; iter < iterations; iter++) {
      // Calculate repulsive forces between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].position.x - nodes[i].position.x;
          const dy = nodes[j].position.y - nodes[i].position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const force = (k * k) / distance;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          nodes[i].position.x -= fx;
          nodes[i].position.y -= fy;
          nodes[j].position.x += fx;
          nodes[j].position.y += fy;
        }
      }

      // Calculate attractive forces for connected nodes
      edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
          const dx = targetNode.position.x - sourceNode.position.x;
          const dy = targetNode.position.y - sourceNode.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const force = (distance * distance) / k;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          sourceNode.position.x += fx;
          sourceNode.position.y += fy;
          targetNode.position.x -= fx;
          targetNode.position.y -= fy;
        }
      });

      // Apply temperature cooling
      if (iter < iterations / 2) {
        nodes.forEach(node => {
          node.position.x += (Math.random() - 0.5) * temperature * (1 - iter / iterations);
          node.position.y += (Math.random() - 0.5) * temperature * (1 - iter / iterations);
        });
      }
    }

    // Center the graph
    const centerX = nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length;
    const centerY = nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length;
    
    nodes.forEach(node => {
      node.position.x -= centerX;
      node.position.y -= centerY;
    });

    return nodes;
  }

  private applyHierarchicalLayout(graph: LineageGraph): LineageGraphNode[] {
    const nodes = [...graph.nodes];
    const edges = [...graph.edges];
    
    // Build hierarchy levels
    const levels = this.calculateHierarchyLevels(nodes, edges);
    
    // Position nodes by level
    const levelHeight = 100;
    nodes.forEach((node, index) => {
      const level = levels.get(node.id) || 0;
      const nodesInLevel = Array.from(levels.values()).filter(l => l === level).length;
      const positionInLevel = Array.from(levels.entries()).filter(([id, l]) => l === level).findIndex(([id]) => id === node.id);
      
      node.position = {
        x: (positionInLevel - nodesInLevel / 2) * 150,
        y: level * levelHeight
      };
    });

    return nodes;
  }

  private applyCircularLayout(graph: LineageGraph): LineageGraphNode[] {
    const nodes = [...graph.nodes];
    const centerX = 0;
    const centerY = 0;
    const radius = Math.min(300, 800 / (2 * Math.PI));
    
    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / nodes.length;
      node.position = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    return nodes;
  }

  private applyGridLayout(graph: LineageGraph): LineageGraphNode[] {
    const nodes = [...graph.nodes];
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const spacing = 150;
    
    nodes.forEach((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      node.position = {
        x: (col - cols / 2) * spacing,
        y: (row - nodes.length / cols / 2) * spacing
      };
    });

    return nodes;
  }

  private applyTreeLayout(graph: LineageGraph): LineageGraphNode[] {
    const nodes = [...graph.nodes];
    const edges = [...graph.edges];
    
    // Find root nodes (nodes with no incoming edges)
    const incomingEdges = new Map<string, number>();
    edges.forEach(edge => {
      incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
    });
    
    const rootNodes = nodes.filter(node => !incomingEdges.has(node.id));
    
    // Position root nodes at the top
    const levelHeight = 120;
    const nodeSpacing = 100;
    
    rootNodes.forEach((root, index) => {
      root.position = {
        x: (index - rootNodes.length / 2) * nodeSpacing,
        y: 0
      };
      
      // Position children recursively
      this.positionChildren(root, nodes, edges, 1, levelHeight, nodeSpacing, new Set());
    });

    return nodes;
  }

  private positionChildren(
    parent: LineageGraphNode,
    nodes: LineageGraphNode[],
    edges: LineageGraphEdge[],
    level: number,
    levelHeight: number,
    nodeSpacing: number,
    visited: Set<string>
  ): void {
    if (visited.has(parent.id)) return;
    visited.add(parent.id);

    // Find child nodes
    const childEdges = edges.filter(edge => edge.source === parent.id);
    const children = childEdges.map(edge => nodes.find(n => n.id === edge.target)).filter(Boolean) as LineageGraphNode[];
    
    children.forEach((child, index) => {
      child.position = {
        x: parent.position.x + (index - children.length / 2) * nodeSpacing,
        y: parent.position.y + levelHeight
      };
      
      // Recursively position grandchildren
      this.positionChildren(child, nodes, edges, level + 1, levelHeight, nodeSpacing, visited);
    });
  }

  private calculateHierarchyLevels(nodes: LineageGraphNode[], edges: LineageGraphEdge[]): Map<string, number> {
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    
    // Find root nodes
    const incomingEdges = new Map<string, number>();
    edges.forEach(edge => {
      incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
    });
    
    const rootNodes = nodes.filter(node => !incomingEdges.has(node.id));
    
    // BFS to calculate levels
    const queue: { node: LineageGraphNode; level: number }[] = [];
    rootNodes.forEach(root => queue.push({ node: root, level: 0 }));
    
    while (queue.length > 0) {
      const { node, level } = queue.shift()!;
      
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      levels.set(node.id, level);
      
      // Add children to queue
      const childEdges = edges.filter(edge => edge.source === node.id);
      childEdges.forEach(edge => {
        const child = nodes.find(n => n.id === edge.target);
        if (child && !visited.has(child.id)) {
          queue.push({ node: child, level: level + 1 });
        }
      });
    }
    
    return levels;
  }

  private applyStyling(graph: LineageGraph): LineageGraph {
    const theme = this.themes.get(this.currentTheme)!;
    
    // Apply theme-based styling to nodes and edges
    graph.nodes.forEach(node => {
      // Apply privacy-based styling
      if (this.config.privacyMode && node.metadata?.privacy) {
        const privacyLevel = node.metadata.privacy;
        if (privacyLevel === 'restricted') {
          node.style.border = '#dc2626';
          node.style.color = theme.colors.nodes.dataset;
        } else if (privacyLevel === 'confidential') {
          node.style.border = '#f59e0b';
        }
      }
      
      // Apply quality-based styling
      if (node.metadata?.quality) {
        const quality = node.metadata.quality;
        if (quality < 60) {
          node.style.color = theme.colors.nodes.sink; // Red tint for low quality
        } else if (quality > 80) {
          node.style.color = theme.colors.nodes.source; // Green tint for high quality
        }
      }
    });

    // Apply edge styling based on weight and type
    graph.edges.forEach(edge => {
      if (edge.weight > 0.8) {
        edge.style.width = 3;
      } else if (edge.weight < 0.3) {
        edge.style.width = 1;
        edge.style.style = 'dashed';
      }
    });

    return graph;
  }

  private getLayoutParameters(algorithm: string): Record<string, any> {
    const parameters: Record<string, any> = {
      force: {
        iterations: 100,
        temperature: 0.1,
        gravity: 0.1,
        charge: -100
      },
      hierarchical: {
        levelSeparation: 100,
        nodeSpacing: 150,
        direction: 'TB'
      },
      circular: {
        radius: 300,
        startAngle: 0
      },
      grid: {
        spacing: 150,
        columns: 'auto'
      },
      tree: {
        levelSeparation: 120,
        nodeSpacing: 100,
        direction: 'TB'
      }
    };

    return parameters[algorithm] || {};
  }

  private calculateGraphDepth(nodes: LineageGraphNode[], edges: LineageGraphEdge[]): number {
    const levels = this.calculateHierarchyLevels(nodes, edges);
    return Math.max(...Array.from(levels.values())) + 1;
  }

  private detectCycles(nodes: LineageGraphNode[], edges: LineageGraphEdge[]): number {
    let cycleCount = 0;
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        cycleCount++;
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingEdges = edges.filter(edge => edge.source === nodeId);
      for (const edge of outgoingEdges) {
        if (dfs(edge.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    });

    return cycleCount;
  }

  private generateCacheKey(datasetId: string, options: any): string {
    const key = {
      datasetId,
      options,
      filters: this.filters.filter(f => f.active),
      clusters: this.clusters,
      theme: this.currentTheme
    };
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  // Interaction methods
  public addInteraction(interaction: LineageInteraction): void {
    this.interactions.push(interaction);
  }

  public removeInteraction(interactionId: string): boolean {
    const index = this.interactions.findIndex(i => i.target === interactionId);
    if (index >= 0) {
      this.interactions.splice(index, 1);
      return true;
    }
    return false;
  }

  public getInteractions(): LineageInteraction[] {
    return [...this.interactions];
  }

  // Animation methods
  public addAnimation(animation: LineageAnimation): void {
    this.animations.push(animation);
  }

  public removeAnimation(animationId: string): boolean {
    const index = this.animations.findIndex(a => a.target === animationId);
    if (index >= 0) {
      this.animations.splice(index, 1);
      return true;
    }
    return false;
  }

  public getAnimations(): LineageAnimation[] {
    return [...this.animations];
  }

  // Filter methods
  public addFilter(filter: LineageFilter): void {
    this.filters.push(filter);
  }

  public removeFilter(filterId: string): boolean {
    const index = this.filters.findIndex(f => f.field === filterId);
    if (index >= 0) {
      this.filters.splice(index, 1);
      return true;
    }
    return false;
  }

  public toggleFilter(filterId: string): boolean {
    const filter = this.filters.find(f => f.field === filterId);
    if (filter) {
      filter.active = !filter.active;
      return true;
    }
    return false;
  }

  public getFilters(): LineageFilter[] {
    return [...this.filters];
  }

  // Cluster methods
  public addCluster(cluster: LineageCluster): void {
    this.clusters.push(cluster);
  }

  public removeCluster(clusterId: string): boolean {
    const index = this.clusters.findIndex(c => c.id === clusterId);
    if (index >= 0) {
      this.clusters.splice(index, 1);
      return true;
    }
    return false;
  }

  public getClusters(): LineageCluster[] {
    return [...this.clusters];
  }

  // Theme methods
  public setTheme(themeName: string): boolean {
    if (this.themes.has(themeName)) {
      this.currentTheme = themeName;
      return true;
    }
    return false;
  }

  public getCurrentTheme(): string {
    return this.currentTheme;
  }

  public getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  public addTheme(theme: VisualizationTheme): void {
    this.themes.set(theme.name, theme);
  }

  // Configuration methods
  public updateConfig(config: Partial<LineageVisualizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): LineageVisualizationConfig {
    return { ...this.config };
  }

  // Cache management
  public clearCache(): void {
    this.lineageCache.clear();
  }

  public getCacheStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.lineageCache.size,
      keys: Array.from(this.lineageCache.keys())
    };
  }
}

export default DataLineageVisualization;
