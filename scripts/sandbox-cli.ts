#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';

const program = new Command();

// Configuration
const API_BASE_URL = process.env.STELLAR_API_URL || 'http://localhost:3001/api/v1';

// Utility functions
const log = {
  success: (message: string) => console.log(chalk.green('✓'), message),
  error: (message: string) => console.log(chalk.red('✗'), message),
  info: (message: string) => console.log(chalk.blue('ℹ'), message),
  warn: (message: string) => console.log(chalk.yellow('⚠'), message)
};

const makeRequest = async (method: string, endpoint: string, data?: any) => {
  try {
    const response = await axios({
      method,
      url: `${API_BASE_URL}${endpoint}`,
      data,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`API Error: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`);
    }
    throw new Error(`Network Error: ${error.message}`);
  }
};

// Commands
program
  .name('sandbox-cli')
  .description('Stellar Sandbox CLI for developer testing')
  .version('1.0.0');

program
  .command('status')
  .description('Check sandbox status and configuration')
  .action(async () => {
    try {
      log.info('Fetching sandbox status...');
      const response = await makeRequest('GET', '/sandbox/status');
      
      console.log('\n' + chalk.bold('Sandbox Status'));
      console.log('='.repeat(50));
      console.log(`Environment: ${chalk.cyan(response.data.environment)}`);
      console.log(`Sandbox Mode: ${response.data.sandboxEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
      console.log(`Database Schema: ${chalk.yellow(response.data.database.schemaPrefix || 'default')}`);
      console.log(`Isolation: ${response.data.database.isolationEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
      
      console.log('\n' + chalk.bold('Features'));
      console.log('='.repeat(50));
      Object.entries(response.data.features).forEach(([key, value]) => {
        console.log(`${key}: ${value ? chalk.green('✓') : chalk.red('✗')}`);
      });
      
      console.log('\n' + chalk.bold('Stellar Network'));
      console.log('='.repeat(50));
      console.log(`RPC URL: ${chalk.cyan(response.data.stellarNetwork.rpcUrl)}`);
      console.log(`Horizon URL: ${chalk.cyan(response.data.stellarNetwork.horizonUrl)}`);
      console.log(`Network Type: ${chalk.yellow(response.data.stellarNetwork.networkType)}`);
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('enable')
  .description('Enable sandbox mode')
  .action(async () => {
    try {
      log.info('Enabling sandbox mode...');
      const response = await makeRequest('POST', '/sandbox/toggle', { enabled: true });
      log.success('Sandbox mode enabled');
      console.log(`Environment: ${response.data.environment}`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('disable')
  .description('Disable sandbox mode')
  .action(async () => {
    try {
      log.info('Disabling sandbox mode...');
      const response = await makeRequest('POST', '/sandbox/toggle', { enabled: false });
      log.success('Sandbox mode disabled');
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('env')
  .description('Switch Stellar environment')
  .argument('<environment>', 'Environment (mainnet, testnet, sandbox)')
  .action(async (environment) => {
    try {
      if (!['mainnet', 'testnet', 'sandbox'].includes(environment)) {
        log.error('Invalid environment. Use: mainnet, testnet, or sandbox');
        process.exit(1);
      }
      
      log.info(`Switching to ${environment} environment...`);
      const response = await makeRequest('POST', '/sandbox/environment', { environment });
      log.success(`Switched to ${environment} environment`);
      console.log(`RPC URL: ${response.data.stellarConfig.rpcUrl}`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('payment')
  .description('Create mock payment')
  .option('-s, --subscription <id>', 'Subscription ID')
  .option('-a, --amount <amount>', 'Payment amount', '10.00')
  .option('-c, --currency <currency>', 'Currency code', 'USD')
  .option('-f, --fail', 'Simulate payment failure')
  .option('-t, --failure-type <type>', 'Failure type (insufficient_funds, network_error, timeout, invalid_signature)', 'insufficient_funds')
  .action(async (options) => {
    try {
      const answers = options.subscription ? {} : await inquirer.prompt([
        {
          type: 'input',
          name: 'subscriptionId',
          message: 'Subscription ID:',
          validate: (input) => input.length > 0 || 'Subscription ID is required'
        }
      ]);

      const paymentData = {
        subscriptionId: options.subscription || answers.subscriptionId,
        amount: parseFloat(options.amount),
        currency: options.currency,
        shouldFail: options.fail || false,
        failureType: options.fail ? options.failureType : undefined
      };

      log.info('Creating mock payment...');
      const response = await makeRequest('POST', '/sandbox/mock-payment', paymentData);
      
      log.success('Mock payment created');
      console.log(`Payment ID: ${chalk.cyan(response.data.paymentId)}`);
      console.log(`Status: ${response.data.status === 'success' ? chalk.green('Success') : chalk.red('Failed')}`);
      console.log(`Amount: ${paymentData.amount} ${paymentData.currency}`);
      
      if (response.data.failureType) {
        console.log(`Failure Type: ${chalk.yellow(response.data.failureType)}`);
      }
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('payments')
  .description('List mock payments')
  .option('-s, --subscription <id>', 'Filter by subscription ID')
  .option('-l, --limit <limit>', 'Number of payments to show', '10')
  .action(async (options) => {
    try {
      const params = new URLSearchParams({
        limit: options.limit
      });
      
      if (options.subscription) {
        params.append('subscriptionId', options.subscription);
      }

      log.info('Fetching mock payments...');
      const response = await makeRequest('GET', `/sandbox/mock-payments?${params}`);
      
      if (response.data.payments.length === 0) {
        log.warn('No mock payments found');
        return;
      }

      console.log('\n' + chalk.bold('Mock Payments'));
      console.log('='.repeat(80));
      
      response.data.payments.forEach((payment: any) => {
        const status = payment.status === 'success' ? chalk.green('✓') : 
                     payment.status === 'failed' ? chalk.red('✗') : chalk.yellow('⏳');
        
        console.log(`${status} ${chalk.cyan(payment.paymentId)}`);
        console.log(`   Amount: ${payment.amount} ${payment.currency}`);
        console.log(`   Status: ${payment.status}${payment.failureType ? ` (${payment.failureType})` : ''}`);
        console.log(`   Time: ${new Date(payment.timestamp).toLocaleString()}`);
        console.log(`   Subscription: ${payment.subscriptionId}`);
        console.log('');
      });
      
      console.log(`Total: ${response.data.totalCount} payments`);
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('event')
  .description('Simulate subscription events')
  .argument('<type>', 'Event type (billed, grace-period, dunning)')
  .option('-s, --subscription <id>', 'Subscription ID')
  .action(async (type, options) => {
    try {
      if (!['billed', 'grace-period', 'dunning'].includes(type)) {
        log.error('Invalid event type. Use: billed, grace-period, or dunning');
        process.exit(1);
      }

      const answers = options.subscription ? {} : await inquirer.prompt([
        {
          type: 'input',
          name: 'subscriptionId',
          message: 'Subscription ID:',
          validate: (input) => input.length > 0 || 'Subscription ID is required'
        }
      ]);

      let endpoint = '';
      let eventData: any = {
        subscriptionId: options.subscription || answers.subscriptionId
      };

      switch (type) {
        case 'billed':
          endpoint = '/sandbox/mock-subscription-billed';
          Object.assign(eventData, {
            amount: 10.00,
            currency: 'USD',
            billingPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            billingPeriodEnd: new Date().toISOString(),
            paymentStatus: 'success'
          });
          break;
        case 'grace-period':
          endpoint = '/sandbox/mock-grace-period';
          Object.assign(eventData, {
            gracePeriodDays: 7,
            reason: 'Payment failure'
          });
          break;
        case 'dunning':
          endpoint = '/sandbox/mock-dunning';
          Object.assign(eventData, {
            dunningLevel: 1,
            contactMethod: 'email',
            message: 'Payment reminder'
          });
          break;
      }

      log.info(`Simulating ${type} event...`);
      const response = await makeRequest('POST', endpoint, eventData);
      
      log.success(`${type} event simulated`);
      console.log(`Event ID: ${chalk.cyan(response.data.eventId || response.data.gracePeriodId || response.data.dunningId)}`);
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize sandbox environment')
  .action(async () => {
    try {
      log.info('Initializing sandbox environment...');
      
      // Enable sandbox mode
      await makeRequest('POST', '/sandbox/toggle', { enabled: true });
      log.success('Sandbox mode enabled');
      
      // Switch to testnet
      await makeRequest('POST', '/sandbox/environment', { environment: 'testnet' });
      log.success('Switched to testnet environment');
      
      // Create a sample mock payment
      const paymentData = {
        subscriptionId: '00000000-0000-0000-0000-000000000000',
        amount: 10.00,
        currency: 'USD',
        shouldFail: false
      };
      
      await makeRequest('POST', '/sandbox/mock-payment', paymentData);
      log.success('Sample mock payment created');
      
      log.success('Sandbox environment initialized!');
      log.info('You can now start testing with the sandbox CLI');
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    try {
      const response = await makeRequest('GET', '/sandbox/config');
      
      console.log(JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('clean')
  .description('Clean sandbox data')
  .option('-s, --subscription <id>', 'Clean data for specific subscription')
  .action(async (options) => {
    try {
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: options.subscription 
            ? `Clean all sandbox data for subscription ${options.subscription}?`
            : 'Clean ALL sandbox data? This action cannot be undone.',
          default: false
        }
      ]);

      if (!confirm.confirmed) {
        log.info('Operation cancelled');
        return;
      }

      log.info('Cleaning sandbox data...');
      
      // This would call a cleanup endpoint (not implemented yet)
      log.warn('Cleanup endpoint not yet implemented');
      log.info('Manual cleanup required through database or Redis');
      
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Error handling
process.on('uncaughtException', (error) => {
  log.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Parse command line arguments
program.parse();
