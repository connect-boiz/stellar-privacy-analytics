import { logger } from '../utils/logger';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SandboxConfig {
  enableSandbox: boolean;
  memoryLimit: number; // MB
  timeoutMs: number;
  cpuLimit: number; // percentage
  diskLimit: number; // MB
  networkAccess: boolean;
  allowedPaths: string[];
  blockedCommands: string[];
}

export interface SandboxResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  executionTime: number;
  memoryUsed: number;
  cpuUsed: number;
}

export interface SandboxMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  averageMemoryUsage: number;
  peakMemoryUsage: number;
  timeouts: number;
  memoryErrors: number;
}

export class SandboxManager {
  private config: SandboxConfig;
  private metrics: SandboxMetrics;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private tempDir: string;
  private isShuttingDown: boolean = false;

  constructor(config: {
    enableSandbox: boolean;
    memoryLimit: number;
    timeoutMs: number;
    cpuLimit?: number;
    diskLimit?: number;
    networkAccess?: boolean;
    allowedPaths?: string[];
    blockedCommands?: string[];
  }) {
    this.config = {
      cpuLimit: 50,
      diskLimit: 100,
      networkAccess: false,
      allowedPaths: ['/tmp', '/var/tmp'],
      blockedCommands: ['rm', 'dd', 'mkfs', 'fdisk', 'kill', 'killall'],
      ...config,
    };

    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      averageMemoryUsage: 0,
      peakMemoryUsage: 0,
      timeouts: 0,
      memoryErrors: 0,
    };

    this.tempDir = this.createTempDirectory();
    this.setupGracefulShutdown();

    logger.info('Sandbox Manager initialized', {
      enableSandbox: this.config.enableSandbox,
      memoryLimit: this.config.memoryLimit,
      timeoutMs: this.config.timeoutMs,
      tempDir: this.tempDir,
    });
  }

  private createTempDirectory(): string {
    const tempDir = path.join(os.tmpdir(), 'sandbox-temp-' + Date.now());
    
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      fs.chmodSync(tempDir, 0o700); // Restrict permissions
      
      logger.info('Created sandbox temp directory', { tempDir });
      return tempDir;
    } catch (error) {
      logger.error('Failed to create sandbox temp directory:', error);
      throw error;
    }
  }

  /**
   * Execute a function in a sandboxed environment
   */
  async execute<T>(fn: () => Promise<T>): Promise<SandboxResult<T>> {
    if (!this.config.enableSandbox) {
      // If sandboxing is disabled, execute directly
      return this.executeDirectly(fn);
    }

    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    try {
      logger.info('Starting sandboxed execution', { executionId });

      // Create sandbox script
      const scriptPath = await this.createSandboxScript(fn, executionId);
      
      // Execute in sandbox
      const result = await this.executeInSandbox<T>(scriptPath, executionId);
      
      // Update metrics
      this.updateMetrics(startTime, result.success, result.memoryUsed);
      
      logger.info('Sandboxed execution completed', {
        executionId,
        success: result.success,
        executionTime: result.executionTime,
        memoryUsed: result.memoryUsed,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.updateMetrics(startTime, false, 0);
      
      logger.error('Sandboxed execution failed', {
        executionId,
        error: error.message,
        executionTime,
      });

      return {
        success: false,
        error: error.message,
        executionTime,
        memoryUsed: 0,
        cpuUsed: 0,
      };
    }
  }

  /**
   * Execute function directly (no sandboxing)
   */
  private async executeDirectly<T>(fn: () => Promise<T>): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        result,
        executionTime,
        memoryUsed: 0,
        cpuUsed: 0,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        executionTime,
        memoryUsed: 0,
        cpuUsed: 0,
      };
    }
  }

  /**
   * Create sandbox script for execution
   */
  private async createSandboxScript<T>(fn: () => Promise<T>, executionId: string): Promise<string> {
    const scriptPath = path.join(this.tempDir, `script-${executionId}.js`);
    
    // Serialize the function to execute
    const serializedFunction = fn.toString();
    
    // Create sandbox script
    const sandboxScript = `
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Set up resource limits
const v8 = require('v8');
const heapStatistics = v8.getHeapStatistics();

// Function to execute
const userFunction = ${serializedFunction};

// Execute and capture result
async function execute() {
  try {
    const result = await userFunction();
    
    // Get memory usage
    const finalHeapStats = v8.getHeapStatistics();
    const memoryUsed = Math.round((finalHeapStats.used_heap_size - heapStatistics.used_heap_size) / 1024 / 1024);
    
    return {
      success: true,
      result: result,
      memoryUsed: memoryUsed,
      cpuUsed: process.cpuUsage().user
    };
  } catch (error) {
    const finalHeapStats = v8.getHeapStatistics();
    const memoryUsed = Math.round((finalHeapStats.used_heap_size - heapStatistics.used_heap_size) / 1024 / 1024);
    
    return {
      success: false,
      error: error.message,
      memoryUsed: memoryUsed,
      cpuUsed: process.cpuUsage().user
    };
  }
}

// Execute and write result
execute().then(result => {
  fs.writeFileSync('${scriptPath}.result', JSON.stringify(result));
  process.exit(0);
}).catch(error => {
  fs.writeFileSync('${scriptPath}.error', error.message);
  process.exit(1);
});
`;

    try {
      fs.writeFileSync(scriptPath, sandboxScript);
      fs.chmodSync(scriptPath, 0o700); // Restrict permissions
      
      logger.debug('Created sandbox script', { scriptPath, executionId });
      return scriptPath;
    } catch (error) {
      logger.error('Failed to create sandbox script:', error);
      throw error;
    }
  }

  /**
   * Execute script in sandbox
   */
  private async executeInSandbox<T>(scriptPath: string, executionId: string): Promise<SandboxResult<T>> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // Set up resource limits
      const resourceLimits = {
        memory: this.config.memoryLimit * 1024 * 1024, // Convert MB to bytes
        cpu: this.config.cpuLimit,
        timeout: this.config.timeoutMs,
      };

      // Create child process with resource limits
      const child = spawn('node', [scriptPath], {
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${this.config.memoryLimit}`,
        },
        detached: false,
      });

      this.activeProcesses.set(executionId, child);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set up timeout
      const timeout = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
          this.metrics.timeouts++;
          
          resolve({
            success: false,
            error: 'Execution timeout',
            executionTime: this.config.timeoutMs,
            memoryUsed: 0,
            cpuUsed: 0,
          });
        }
      }, this.config.timeoutMs);

      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(executionId);

        const executionTime = Date.now() - startTime;

        if (signal === 'SIGKILL') {
          // Process was killed (likely due to timeout)
          resolve({
            success: false,
            error: 'Process killed (timeout or memory limit)',
            executionTime,
            memoryUsed: 0,
            cpuUsed: 0,
          });
        } else if (code === 0) {
          // Success - read result file
          try {
            const resultPath = `${scriptPath}.result`;
            if (fs.existsSync(resultPath)) {
              const resultData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
              fs.unlinkSync(resultPath);
              
              resolve({
                ...resultData,
                executionTime,
              });
            } else {
              resolve({
                success: false,
                error: 'Result file not found',
                executionTime,
                memoryUsed: 0,
                cpuUsed: 0,
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: `Failed to read result: ${error.message}`,
              executionTime,
              memoryUsed: 0,
              cpuUsed: 0,
            });
          }
        } else {
          // Error - read error file
          try {
            const errorPath = `${scriptPath}.error`;
            let errorMessage = 'Unknown error';
            
            if (fs.existsSync(errorPath)) {
              errorMessage = fs.readFileSync(errorPath, 'utf8');
              fs.unlinkSync(errorPath);
            }
            
            resolve({
              success: false,
              error: errorMessage,
              executionTime,
              memoryUsed: 0,
              cpuUsed: 0,
            });
          } catch (error) {
            resolve({
              success: false,
              error: `Process failed with code ${code}`,
              executionTime,
              memoryUsed: 0,
              cpuUsed: 0,
            });
          }
        }

        // Clean up script file
        try {
          fs.unlinkSync(scriptPath);
        } catch (error) {
          logger.warn('Failed to clean up script file:', error);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(executionId);
        
        resolve({
          success: false,
          error: `Process error: ${error.message}`,
          executionTime: Date.now() - startTime,
          memoryUsed: 0,
          cpuUsed: 0,
        });
      });
    });
  }

  /**
   * Update execution metrics
   */
  private updateMetrics(startTime: number, success: boolean, memoryUsed: number): void {
    const executionTime = Date.now() - startTime;
    
    this.metrics.totalExecutions++;
    
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    // Update averages
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime) / 
      this.metrics.totalExecutions;
    
    this.metrics.averageMemoryUsage = 
      (this.metrics.averageMemoryUsage * (this.metrics.totalExecutions - 1) + memoryUsed) / 
      this.metrics.totalExecutions;
    
    // Update peak memory
    if (memoryUsed > this.metrics.peakMemoryUsage) {
      this.metrics.peakMemoryUsage = memoryUsed;
    }
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Check if sandboxing is enabled
   */
  isEnabled(): boolean {
    return this.config.enableSandbox;
  }

  /**
   * Get current metrics
   */
  getMetrics(): SandboxMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active processes count
   */
  getActiveProcessesCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Kill active process
   */
  killProcess(executionId: string): boolean {
    const process = this.activeProcesses.get(executionId);
    
    if (process && !process.killed) {
      process.kill('SIGKILL');
      this.activeProcesses.delete(executionId);
      
      logger.info('Killed sandbox process', { executionId });
      return true;
    }
    
    return false;
  }

  /**
   * Kill all active processes
   */
  killAllProcesses(): number {
    let killedCount = 0;
    
    for (const [executionId, process] of this.activeProcesses) {
      if (!process.killed) {
        process.kill('SIGKILL');
        killedCount++;
      }
    }
    
    this.activeProcesses.clear();
    
    logger.info('Killed all sandbox processes', { killedCount });
    return killedCount;
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    try {
      // Check temp directory
      if (!fs.existsSync(this.tempDir)) {
        return false;
      }

      // Check if we can write to temp directory
      const testFile = path.join(this.tempDir, 'health-check');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      return true;
    } catch (error) {
      logger.error('Sandbox health check failed:', error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
    
    logger.info('Sandbox configuration updated', {
      enableSandbox: this.config.enableSandbox,
      memoryLimit: this.config.memoryLimit,
      timeoutMs: this.config.timeoutMs,
    });
  }

  /**
   * Get configuration
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    
    // Kill all active processes
    this.killAllProcesses();
    
    // Clean up temp directory
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        
        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            logger.warn('Failed to delete temp file:', { filePath, error });
          }
        }
        
        fs.rmdirSync(this.tempDir);
        logger.info('Cleaned up sandbox temp directory');
      }
    } catch (error) {
      logger.error('Failed to clean up sandbox temp directory:', error);
    }
    
    logger.info('Sandbox Manager cleaned up');
  }

  /**
   * Set up graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      logger.info(`Received ${signal}, shutting down sandbox manager...`);
      
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Get system resource usage
   */
  getSystemResourceUsage(): {
    memory: {
      total: number;
      free: number;
      used: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
  } {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      memory: {
        total: Math.round(totalMem / 1024 / 1024), // MB
        free: Math.round(freeMem / 1024 / 1024), // MB
        used: Math.round(usedMem / 1024 / 1024), // MB
        percentage: Math.round((usedMem / totalMem) * 100),
      },
      cpu: {
        usage: os.loadavg()[0] * 100, // Approximate CPU usage
        loadAverage: os.loadavg(),
      },
    };
  }

  /**
   * Check if system has enough resources for sandbox
   */
  hasEnoughResources(): boolean {
    const usage = this.getSystemResourceUsage();
    
    // Check if we have enough memory
    if (usage.memory.percentage > 80) {
      return false;
    }
    
    // Check if CPU is not overloaded
    if (usage.cpu.usage > 90) {
      return false;
    }
    
    // Check if we have enough memory for the sandbox
    const requiredMemory = this.config.memoryLimit;
    const availableMemory = usage.memory.free;
    
    if (availableMemory < requiredMemory * 2) { // Keep 2x margin
      return false;
    }
    
    return true;
  }
}

export default SandboxManager;
