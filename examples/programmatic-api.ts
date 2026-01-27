#!/usr/bin/env npx tsx
/**
 * Programmatic API example
 *
 * This example shows how to use AIChestrator as a library in your
 * own Node.js application with event handling and progress tracking.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key npx tsx examples/programmatic-api.ts
 */

import { Orchestrator, OrchestratorConfig } from '../src/orchestrator/orchestrator.js';
import { loadConfig } from '../src/config/index.js';
import { EventBus } from '../src/events/event-bus.js';
import { EventTypes } from '../src/events/event-types.js';

async function main() {
  const config = loadConfig();

  if (!config.anthropic.apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  // Create event bus for monitoring
  const eventBus = new EventBus(config.redis.url);

  // Subscribe to events
  eventBus.on(EventTypes.TASK_STARTED, (event) => {
    console.log(`[EVENT] Task started: ${(event as any).subtaskCount} subtasks`);
  });

  eventBus.on(EventTypes.TASK_PROGRESS, (event) => {
    const e = event as any;
    console.log(`[EVENT] Progress: ${e.completed}/${e.total} (${e.status})`);
  });

  eventBus.on(EventTypes.SUBTASK_COMPLETED, (event) => {
    const e = event as any;
    console.log(`[EVENT] Subtask completed: ${e.subtaskId.substring(0, 8)}... (${e.success ? 'success' : 'failed'})`);
  });

  eventBus.on(EventTypes.AGENT_ERROR, (event) => {
    const e = event as any;
    console.error(`[EVENT] Agent error: ${e.error}`);
  });

  // Create orchestrator
  const orchestratorConfig: OrchestratorConfig = {
    ...config,
    decompositionStrategy: 'parallel'
  };

  const orchestrator = new Orchestrator(orchestratorConfig);

  try {
    console.log('=== AIChestrator Programmatic API Example ===\n');

    await orchestrator.initialize();

    // Run a task
    const result = await orchestrator.run({
      description: 'List all exported functions in this project and their signatures',
      projectPath: process.cwd(),
      type: 'research',
      maxAgents: 2,
      timeoutMs: 120000
    });

    // Process result programmatically
    console.log('\n--- Processing Results ---');

    if (result.status === 'completed') {
      console.log('Task completed successfully!');

      // Access aggregated data
      const output = result.output as {
        aggregated?: {
          insights?: string[];
          filesModified?: string[];
          summary?: { total: number; successful: number; failed: number };
        };
        mergedOutput?: string;
      };

      if (output?.aggregated) {
        console.log(`\nSubtask Summary:`);
        console.log(`  Total: ${output.aggregated.summary?.total ?? 0}`);
        console.log(`  Successful: ${output.aggregated.summary?.successful ?? 0}`);
        console.log(`  Failed: ${output.aggregated.summary?.failed ?? 0}`);

        if (output.aggregated.insights && output.aggregated.insights.length > 0) {
          console.log('\nKey Insights:');
          output.aggregated.insights.slice(0, 5).forEach((insight, i) => {
            console.log(`  ${i + 1}. ${insight}`);
          });
        }
      }

      // Get worker statistics
      const stats = orchestrator.getWorkerStats();
      console.log('\nWorker Stats:');
      console.log(`  Total: ${stats.total}`);
      console.log(`  Idle: ${stats.idle}`);
      console.log(`  Busy: ${stats.busy}`);
      console.log(`  Pending: ${stats.pending}`);

    } else {
      console.error('Task failed:', result.error);
    }

    // Get health report
    const health = await orchestrator.getHealthReport();
    console.log('\nHealth Report:');
    console.log(`  Total Agents: ${health.totalAgents}`);
    console.log(`  Healthy: ${health.healthyAgents}`);
    console.log(`  Unhealthy: ${health.unhealthyAgents}`);

  } finally {
    await orchestrator.shutdown();
    await eventBus.close();
  }
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
