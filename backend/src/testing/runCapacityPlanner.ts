#!/usr/bin/env ts-node
/**
 * Capacity Planning CLI
 * Generate capacity recommendations based on load test results
 */

import { CapacityPlanner, CapacityRequirements } from './capacityPlanner';
import { LoadTestResults } from './loadTest';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface CLIOptions {
  results?: string;
  expectedJobsPerSecond?: number;
  peakJobsPerSecond?: number;
  output?: string;
  help?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--results':
      case '-r':
        options.results = args[++i];
        break;
      case '--expected-jobs':
      case '-e':
        options.expectedJobsPerSecond = parseInt(args[++i]);
        break;
      case '--peak-jobs':
      case '-p':
        options.peakJobsPerSecond = parseInt(args[++i]);
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Capacity Planning CLI - Generate infrastructure recommendations

Usage:
  npm run capacity:plan [options]

Options:
  -r, --results <file>           Load test results file (JSON)
  -e, --expected-jobs <num>      Expected jobs per second
  -p, --peak-jobs <num>          Peak jobs per second
  -o, --output <file>            Output file for recommendations
  -h, --help                     Show this help message

Examples:
  # Generate plan from load test results
  npm run capacity:plan -- --results load-test-results.json

  # Generate plan with custom requirements
  npm run capacity:plan -- --expected-jobs 100 --peak-jobs 200

  # Save recommendations to file
  npm run capacity:plan -- --results results.json --output capacity-plan.txt
`);
}

async function generatePlan(options: CLIOptions): Promise<void> {
  try {
    logger.info('Generating capacity plan...', options);

    let loadTestResults: LoadTestResults;
    let requirements: CapacityRequirements;

    // Load test results if provided
    if (options.results) {
      const resultsPath = path.resolve(options.results);
      
      if (!fs.existsSync(resultsPath)) {
        throw new Error(`Results file not found: ${resultsPath}`);
      }

      const resultsData = fs.readFileSync(resultsPath, 'utf-8');
      loadTestResults = JSON.parse(resultsData);

      logger.info('Loaded load test results', {
        duration: loadTestResults.duration,
        throughput: loadTestResults.throughput,
      });

      // Extract requirements from load test
      requirements = {
        expectedJobsPerSecond: options.expectedJobsPerSecond || loadTestResults.throughput,
        peakJobsPerSecond: options.peakJobsPerSecond || loadTestResults.throughput * 1.5,
        averageJobSize: 'medium',
        priorityDistribution: {
          critical: 10,
          high: 20,
          normal: 50,
          low: 20,
        },
        slaRequirements: {
          maxProcessingTime: 60000, // 60 seconds
          maxQueueDepth: 1000,
          minThroughput: loadTestResults.throughput * 0.8,
          maxErrorRate: 5,
        },
      };
    } else if (options.expectedJobsPerSecond && options.peakJobsPerSecond) {
      // Use provided requirements
      requirements = {
        expectedJobsPerSecond: options.expectedJobsPerSecond,
        peakJobsPerSecond: options.peakJobsPerSecond,
        averageJobSize: 'medium',
        priorityDistribution: {
          critical: 10,
          high: 20,
          normal: 50,
          low: 20,
        },
        slaRequirements: {
          maxProcessingTime: 60000,
          maxQueueDepth: 1000,
          minThroughput: options.expectedJobsPerSecond * 0.8,
          maxErrorRate: 5,
        },
      };

      // Create mock load test results for analysis
      loadTestResults = {
        testConfig: {
          duration: 600000,
          jobsPerSecond: options.expectedJobsPerSecond,
          priorityDistribution: requirements.priorityDistribution,
          datasetSizes: { small: 50, medium: 40, large: 10 },
          rampUpTime: 60000,
          rampDownTime: 60000,
        },
        startTime: new Date(),
        endTime: new Date(),
        duration: 600000,
        totalJobsSubmitted: options.expectedJobsPerSecond * 600,
        totalJobsCompleted: options.expectedJobsPerSecond * 600 * 0.95,
        totalJobsFailed: options.expectedJobsPerSecond * 600 * 0.05,
        averageProcessingTime: 5000,
        minProcessingTime: 1000,
        maxProcessingTime: 30000,
        p50ProcessingTime: 4000,
        p95ProcessingTime: 15000,
        p99ProcessingTime: 25000,
        throughput: options.expectedJobsPerSecond,
        errorRate: 5,
        queueDepthOverTime: [],
        workerMetrics: {
          averageConcurrency: 10,
          maxConcurrency: 20,
          scalingEvents: 5,
        },
        recommendations: [],
      };
    } else {
      logger.error('Either --results or both --expected-jobs and --peak-jobs must be specified');
      printHelp();
      process.exit(1);
    }

    // Generate capacity recommendations
    logger.info('Analyzing requirements and generating recommendations...');
    const recommendations = CapacityPlanner.analyzeLoadTest(loadTestResults, requirements);

    // Generate report
    const report = CapacityPlanner.generateReport(recommendations);

    // Print report
    console.log('\n' + report);

    // Save to file if specified
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, report);
      logger.info(`Capacity plan saved to ${outputPath}`);

      // Also save JSON version
      const jsonPath = outputPath.replace(/\\.txt$/, '.json');
      fs.writeFileSync(jsonPath, JSON.stringify(recommendations, null, 2));
      logger.info(`JSON recommendations saved to ${jsonPath}`);
    }

    logger.info('Capacity planning completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('Capacity planning failed:', error);
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

// Main execution
const options = parseArgs();

if (options.help) {
  printHelp();
  process.exit(0);
}

generatePlan(options);
