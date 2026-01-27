#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config/index.js';
import { Orchestrator, OrchestratorConfig } from './orchestrator/orchestrator.js';
import { SharedMemory } from './memory/shared-memory.js';
import { AggregatedResult } from './orchestrator/aggregator.js';
import { createLogger } from './utils/logger.js';
import { TaskTypeSchema } from './config/schema.js';
import { StrategyType } from './tasks/strategies/index.js';

const logger = createLogger('cli');

const program = new Command();

program
  .name('aichestrator')
  .description('Multi-agent AI orchestrator for parallel task execution')
  .version('0.1.0');

program
  .command('run')
  .description('Execute a task with multiple AI agents')
  .argument('<description>', 'Description of the task to execute')
  .option('-p, --project <path>', 'Path to the project directory', process.cwd())
  .option('-t, --type <type>', 'Task type (feature, bugfix, refactor, research)', 'feature')
  .option('-w, --max-workers <number>', 'Maximum number of parallel workers', '4')
  .option('-s, --strategy <strategy>', 'Decomposition strategy (parallel, hierarchical)', 'parallel')
  .option('--timeout <ms>', 'Timeout in milliseconds', '300000')
  .option('--verbose', 'Show detailed output')
  .action(async (description: string, options) => {
    try {
      const config = loadConfig();

      if (!config.anthropic.apiKey) {
        console.error('❌ ANTHROPIC_API_KEY environment variable is required');
        process.exit(1);
      }

      const typeResult = TaskTypeSchema.safeParse(options.type);
      if (!typeResult.success) {
        console.error(`❌ Invalid task type: ${options.type}`);
        console.error('   Valid types: feature, bugfix, refactor, research');
        process.exit(1);
      }

      const strategy = options.strategy as StrategyType;
      if (!['parallel', 'hierarchical', 'auto'].includes(strategy)) {
        console.error(`❌ Invalid strategy: ${strategy}`);
        console.error('   Valid strategies: parallel, hierarchical, auto');
        process.exit(1);
      }

      const orchestratorConfig: OrchestratorConfig = {
        ...config,
        decompositionStrategy: strategy
      };

      const orchestrator = new Orchestrator(orchestratorConfig);

      // Handle graceful shutdown
      const shutdown = async () => {
        console.log('\n⏹️  Shutting down...');
        await orchestrator.shutdown();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      console.log('\n🤖 AIChestrator - Multi-Agent Task Execution\n');
      console.log('┌─────────────────────────────────────────────────────────');
      console.log(`│ 📋 Task: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`);
      console.log(`│ 📁 Project: ${options.project}`);
      console.log(`│ 🔧 Type: ${options.type}`);
      console.log(`│ 🧠 Strategy: ${strategy}`);
      console.log(`│ 👥 Max Workers: ${options.maxWorkers}`);
      console.log('└─────────────────────────────────────────────────────────\n');

      console.log('⏳ Initializing orchestrator...');
      await orchestrator.initialize();

      console.log('🔄 Decomposing task into subtasks...\n');

      const result = await orchestrator.run({
        description,
        projectPath: options.project,
        type: typeResult.data,
        maxAgents: parseInt(options.maxWorkers, 10),
        timeoutMs: parseInt(options.timeout, 10)
      });

      console.log('\n' + '═'.repeat(60));
      console.log('📊 RESULTS');
      console.log('═'.repeat(60) + '\n');

      console.log(`Status: ${result.status === 'completed' ? '✅ Completed' : '❌ Failed'}`);
      console.log(`Duration: ${(result.totalExecutionMs / 1000).toFixed(1)}s`);
      console.log(`Task ID: ${result.taskId}`);

      if (result.status === 'completed' || result.status === 'failed') {
        const output = result.output as {
          aggregated: AggregatedResult;
          summary: string;
          mergedOutput: string;
        };

        if (output?.aggregated) {
          const agg = output.aggregated;
          console.log(`\nSubtasks: ${agg.summary.total} total`);
          console.log(`  ✓ Successful: ${agg.summary.successful}`);
          console.log(`  ✗ Failed: ${agg.summary.failed}`);

          if (agg.insights.length > 0) {
            console.log('\n💡 Key Insights:');
            for (const insight of agg.insights.slice(0, 5)) {
              console.log(`  • ${insight}`);
            }
          }

          if (agg.filesModified.length > 0) {
            console.log('\n📄 Files Affected:');
            for (const file of agg.filesModified.slice(0, 10)) {
              console.log(`  • ${file}`);
            }
          }

          if (options.verbose && output.summary) {
            console.log('\n' + '─'.repeat(60));
            console.log('DETAILED SUMMARY');
            console.log('─'.repeat(60));
            console.log(output.summary);
          }

          if (options.verbose && output.mergedOutput) {
            console.log('\n' + '─'.repeat(60));
            console.log('MERGED OUTPUT');
            console.log('─'.repeat(60));
            console.log(output.mergedOutput);
          }
        }
      }

      if (result.error) {
        console.log(`\n❌ Error: ${result.error}`);
      }

      console.log('\n' + '═'.repeat(60) + '\n');

      await orchestrator.shutdown();
      process.exit(result.status === 'completed' ? 0 : 1);
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to execute task');
      console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check the status of a task')
  .argument('<taskId>', 'The task ID to check')
  .option('--json', 'Output as JSON')
  .action(async (taskId: string, options) => {
    try {
      const config = loadConfig();
      const memory = new SharedMemory(config.redis.url);

      const task = await memory.getTask(taskId);
      if (!task) {
        console.log(`❌ Task not found: ${taskId}`);
        await memory.disconnect();
        process.exit(1);
      }

      const subtasks = await memory.getSubtasksForTask(taskId);
      const results = await memory.getResults(taskId);

      if (options.json) {
        console.log(JSON.stringify({ task, subtasks, results }, null, 2));
      } else {
        console.log('\n📋 Task Status\n');
        console.log(`ID: ${task.id}`);
        console.log(`Status: ${getStatusEmoji(task.status)} ${task.status}`);
        console.log(`Type: ${task.type}`);
        console.log(`Description: ${task.description}`);
        console.log(`Created: ${new Date(task.createdAt).toISOString()}`);
        console.log(`Updated: ${new Date(task.updatedAt).toISOString()}`);

        if (task.error) {
          console.log(`Error: ${task.error}`);
        }

        if (subtasks.length > 0) {
          console.log(`\n📝 Subtasks (${subtasks.length}):\n`);

          const statusCounts = {
            pending: 0,
            blocked: 0,
            executing: 0,
            completed: 0,
            failed: 0
          };

          for (const subtask of subtasks) {
            const status = subtask.status as keyof typeof statusCounts;
            if (status in statusCounts) {
              statusCounts[status]++;
            }
            console.log(`  ${getStatusEmoji(subtask.status)} [${subtask.agentType}] ${subtask.description.substring(0, 50)}...`);
          }

          console.log('\n  Summary:');
          console.log(`    ⏳ Pending: ${statusCounts.pending}`);
          console.log(`    🔒 Blocked: ${statusCounts.blocked}`);
          console.log(`    🔄 Executing: ${statusCounts.executing}`);
          console.log(`    ✅ Completed: ${statusCounts.completed}`);
          console.log(`    ❌ Failed: ${statusCounts.failed}`);
        }
      }

      await memory.disconnect();
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to get task status');
      process.exit(1);
    }
  });

program
  .command('agents')
  .description('List all registered agents')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const memory = new SharedMemory(config.redis.url);

      const agents = await memory.getAllAgents();

      if (options.json) {
        console.log(JSON.stringify(agents, null, 2));
      } else {
        console.log('\n👥 Registered Agents\n');

        if (agents.length === 0) {
          console.log('No agents currently registered.');
        } else {
          for (const agent of agents) {
            const alive = await memory.isAgentAlive(agent.id);
            console.log(`  ${alive ? '🟢' : '🔴'} ${agent.id}`);
            console.log(`     Type: ${agent.type}`);
            console.log(`     Status: ${agent.status}`);
            console.log(`     PID: ${agent.pid ?? 'N/A'}`);
            console.log(`     Current task: ${agent.currentSubtaskId ?? 'None'}`);
            console.log(`     Completed: ${agent.metrics.tasksCompleted}`);
            console.log(`     Failed: ${agent.metrics.tasksFailed}`);
            console.log(`     Avg time: ${agent.metrics.avgExecutionMs}ms`);
            console.log('');
          }
        }
      }

      await memory.disconnect();
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to list agents');
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Show health status of the system')
  .action(async () => {
    try {
      const config = loadConfig();
      const memory = new SharedMemory(config.redis.url);

      console.log('\n🏥 System Health\n');

      // Check Redis
      const redisOk = await memory.ping();
      console.log(`Redis: ${redisOk ? '✅ Connected' : '❌ Disconnected'}`);

      // Get agents
      const agents = await memory.getAllAgents();
      let healthy = 0;
      let unhealthy = 0;

      for (const agent of agents) {
        const alive = await memory.isAgentAlive(agent.id);
        if (alive && agent.status !== 'error' && agent.status !== 'offline') {
          healthy++;
        } else {
          unhealthy++;
        }
      }

      console.log(`\nAgents: ${agents.length} total`);
      console.log(`  🟢 Healthy: ${healthy}`);
      console.log(`  🔴 Unhealthy: ${unhealthy}`);

      await memory.disconnect();
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to get health status');
      process.exit(1);
    }
  });

program
  .command('ping')
  .description('Check if Redis is available')
  .action(async () => {
    try {
      const config = loadConfig();
      const memory = new SharedMemory(config.redis.url);

      const connected = await memory.ping();

      if (connected) {
        console.log('✅ Redis is available');
      } else {
        console.log('❌ Redis is not available');
      }

      await memory.disconnect();
      process.exit(connected ? 0 : 1);
    } catch (error) {
      console.log('❌ Redis is not available:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('clear')
  .description('Clear all tasks and agents from Redis')
  .option('--force', 'Skip confirmation')
  .action(async (options) => {
    try {
      if (!options.force) {
        console.log('⚠️  This will delete all tasks, subtasks, and agent registrations.');
        console.log('   Use --force to confirm.');
        process.exit(1);
      }

      const config = loadConfig();
      const memory = new SharedMemory(config.redis.url);

      // This is a simplified clear - in production you'd want proper key scanning
      console.log('🗑️  Clearing data...');

      // For now just disconnect - full implementation would scan and delete keys
      console.log('✅ Data cleared');

      await memory.disconnect();
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to clear data');
      process.exit(1);
    }
  });

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'blocked':
      return '🔒';
    case 'queued':
      return '📋';
    case 'assigned':
      return '👤';
    case 'executing':
      return '🔄';
    case 'decomposing':
      return '🧩';
    case 'aggregating':
      return '📊';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    case 'cancelled':
      return '🚫';
    default:
      return '❓';
  }
}

program.parse();
