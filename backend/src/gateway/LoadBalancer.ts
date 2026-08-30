import { CircuitBreaker } from "./CircuitBreaker";
import crypto from "crypto";
import { logger } from "../utils/logger";

interface ServiceNode {
  url: string;
  isHealthy: boolean;
  circuitBreaker: CircuitBreaker;
  activeRequests: number;
}

interface LoadBalancerOptions {
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
}

export class LoadBalancer {
  private nodes: ServiceNode[] = [];
  private healthCheckTimeout: number;

  private healthCheckIntervalId?: ReturnType<typeof setInterval>;

  constructor(urls: string[], options: LoadBalancerOptions = {}) {
    const { healthCheckInterval = 10000, healthCheckTimeout = 5000 } = options;
    this.healthCheckTimeout = healthCheckTimeout;

    this.nodes = urls.map((url) => ({
      url,
      isHealthy: true,
      circuitBreaker: new CircuitBreaker(),
      activeRequests: 0,
    }));

    // Start routine health check polling
    this.healthCheckIntervalId = setInterval(() => this.healthCheck(), healthCheckInterval);
  }

  public async getServicesHealth(): Promise<
    Array<{ url: string; healthy: boolean; activeRequests: number }>
  > {
    return this.nodes.map((node) => ({
      url: node.url,
      healthy: node.isHealthy,
      activeRequests: node.activeRequests,
    }));
  }

  public async start(): Promise<void> {
    await this.healthCheck();
  }

  public async stop(): Promise<void> {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = undefined;
    }
  }

  private async healthCheck() {
    for (const node of this.nodes) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.healthCheckTimeout,
        );

        try {
          // Active ping to backend /health endpoint to verify service availability
          const response = await fetch(`${node.url}/health`, {
            signal: controller.signal,
          });
          node.isHealthy = response.ok;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        node.isHealthy = false;
      }
    }
  }

  public async routeRequest(
    requestPath: string,
    handlerFn: (url: string) => Promise<any>,
  ): Promise<any> {
    // Optimize routing: Least connections algorithm
    const availableNodes = this.nodes.filter((n) => n.isHealthy);
    if (availableNodes.length === 0) {
      throw new Error("503 Service Unavailable: No healthy backend services");
    }

    availableNodes.sort((a, b) => a.activeRequests - b.activeRequests);
    const selectedNode = availableNodes[0];

    selectedNode.activeRequests++;
    try {
      // Request tracing capability
      logger.debug(
        `[TRACE ${crypto.randomUUID()}] Routing request to ${selectedNode.url}${requestPath}`,
      );
      return await selectedNode.circuitBreaker.execute(() =>
        handlerFn(selectedNode.url),
      );
    } finally {
      selectedNode.activeRequests--;
    }
  }
}
