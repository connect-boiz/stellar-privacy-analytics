#!/usr/bin/env ts-node
/**
 * Load Test CLI
 * Run load tests against the message queue system
 */

import { OptimizedAnonymizationWorker } from '../workers/optimizedAnonymizationWorker';
import { LoadTester, runLoadTestScenario, LoadTestConfig } from './loadTest';
import { getWorkerConfig, validateConfig } from '../config/workerConfig';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface CLIOptions {
  scenario?: 'light' | 'moderate' | 'heavy' | 'peak';
  duration?: number;
  jobsPerSecond?: number;
  output?: string;
  help?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--scenario':
      case '-s':
        options.scenario = args[++i] as any;
        break;
      case '--duration':
      case '-d':
        options.duration = parseInt(args[++i]);
        break;
      case '--jobs-per-second':
      case '-j':
        options.jobsPerSecond = parseInt(args[++i]);
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
Load Test CLI - Test message queue performance

Usage:
  npm run test:load [options]

Options:
  -s, --scenario <name>          Predefined scenario: light, moderate, heavy, peak
  -d, --duration <ms>            Test duration in milliseconds
  -j, --jobs-per-second <num>    Target jobs per second
  -o, --output <file>            Output file for results (JSON)
  -h, --help                     Show this help message

Examples:
  # Run predefined scenario
  npm run test:load -- --scenario moderate

  # Run custom test
  npm run test:load -- --duration 300000 --jobs-per-second 50

  # Save results to file
  npm run test:load -- --scenario heavy --output results.json

Predefined Scenarios:
  light     - 10 jobs/s for 5 minutes
  moderate  - 50 jobs/s for 10 minutes
  heavy     - 100 jobs/s for 15 minutes
  peak      - 200 jobs/s for 20 minutes
`);
}

async function runTest(options: CLIOptions): Promise<void> {
  try {
    logger.info('Starting load test...', options);

    // Get worker configuration
    const config = getWorkerConfig();
    validateConfig(config);

    // Create worker instance
    const worker = new OptimizedAnonymizationWorker(config);

    logger.info('Worker initialized, starting load test...');

    let results;

    if (options.scenario) {
      // Run predefined scenario
      logger.info(`Running ${options.scenario} scenario...`);
      results = await runLoadTestScenario(worker, options.scenario);
    } else if (options.duration && options.jobsPerSecond) {
      // Run custom test
      const testConfig: LoadTestConfig = {
        duration: options.duration,
        jobsPerSecond: options.jobsPerSecond,
        priorityDistribution: { critical: 10, high: 20, normal: 50, low: 20 },
        datasetSizes: { small: 50, medium: 40, large: 10 },
        rampUpTime: Math.min(options.duration * 0.1, 60000),
        rampDownTime: Math.min(options.duration * 0.1, 60000),
      };

      const tester = new LoadTester(worker, testConfig);
      results = await tester.run();
    } else {
      logger.error('Either --scenario or both --duration and --jobs-per-second must be specified');
      printHelp();
      process.exit(1);
    }

    // Print results
    console.log('\n' + '='.repeat(80));
    console.log('LOAD TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`\nTest Duration: ${(results.duration / 1000).toFixed(2)}s`);
    console.log(`Jobs Submitted: ${results.totalJobsSubmitted}`);
    console.log(`Jobs Completed: ${results.totalJobsCompleted}`);
    console.log(`Jobs Failed: ${results.totalJobsFailed}`);
    console.log(`\nThroughput: ${results.throughput.toFixed(2)} jobs/second`);
    console.log(`Error Rate: ${results.errorRate.toFixed(2)}%`);
    console.log(`\nProcessing Times:`);
    console.log(`  Average: ${results.averageProcessingTime.toFixed(2)}ms`);
    console.log(`  Min: ${results.minProcessingTime}ms`);
    console.log(`  Max: ${results.maxProcessingTime}ms`);
    console.log(`  P50: ${results.p50ProcessingTime}ms`);
    console.log(`  P95: ${results.p95ProcessingTime}ms`);
    console.log(`  P99: ${results.p99ProcessingTime}ms`);

    if (results.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      results.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(80));

    // Save results to file if specified
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      logger.info(`Results saved to ${outputPath}`);
    }

    // Close worker
    await worker.pause();
    
    logger.info('Load test completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('Load test failed:', error);
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

runTest(options);
