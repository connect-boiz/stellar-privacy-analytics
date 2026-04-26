import { CircuitBreaker } from './CircuitBreaker';
import crypto from 'crypto';

interface ServiceNode {
  url: string;
  isHealthy: boolean;
  circuitBreaker: CircuitBreaker;
  activeRequests: number;
}

export class LoadBalancer {
  private nodes: ServiceNode[] = [];

  constructor(urls: string[]) {
    this.nodes = urls.map(url => ({
      url,
      isHealthy: true,
      circuitBreaker: new CircuitBreaker(),
      activeRequests: 0
    }));
    
    // Start routine health check polling
    setInterval(() => this.healthCheck(), 10000);
  }

  private async healthCheck() {
    for (const node of this.nodes) {
      try {
        // Active ping to backend /health endpoint to verify service availability
        const response = await fetch(`${node.url}/health`);
        node.isHealthy = response.ok;
      } catch (error) {
        node.isHealthy = false;
      }
    }
  }

  public async routeRequest(requestPath: string, handlerFn: (url: string) => Promise<any>): Promise<any> {
    // Optimize routing: Least connections algorithm
    const availableNodes = this.nodes.filter(n => n.isHealthy);
    if (availableNodes.length === 0) {
      throw new Error('503 Service Unavailable: No healthy backend services');
    }

    availableNodes.sort((a, b) => a.activeRequests - b.activeRequests);
    const selectedNode = availableNodes[0];

    selectedNode.activeRequests++;
    try {
      // Request tracing capability
      console.log(`[TRACE ${crypto.randomUUID()}] Routing request to ${selectedNode.url}${requestPath}`);
      return await selectedNode.circuitBreaker.execute(() => handlerFn(selectedNode.url));
    } finally {
      selectedNode.activeRequests--;
    }
  }
}