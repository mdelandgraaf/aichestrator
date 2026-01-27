#!/usr/bin/env npx tsx
/**
 * Parallel feature implementation example
 *
 * This example shows how to run a complex task that gets decomposed
 * into multiple subtasks and executed in parallel by multiple agents.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key npx tsx examples/parallel-feature.ts <project-path>
 */

import { Orchestrator, OrchestratorConfig } from '../src/orchestrator/orchestrator.js';
import { loadConfig } from '../src/config/index.js';

async function main() {
  const projectPath = process.argv[2] || process.cwd();

  const config = loadConfig();

  if (!config.anthropic.apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const orchestratorConfig: OrchestratorConfig = {
    ...config,
    decompositionStrategy: 'parallel'
  };

  const orchestrator = new Orchestrator(orchestratorConfig);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await orchestrator.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('=== AIChestrator Parallel Feature Example ===\n');
  console.log(`Project: ${projectPath}`);
  console.log(`Max Workers: ${config.orchestrator.maxWorkers}`);
  console.log('');

  await orchestrator.initialize();

  // Example: Implement a new feature with multiple agents working in parallel
  const taskDescription = `
    Analyze this codebase and provide a comprehensive report including:
    1. Project structure and main components
    2. Key dependencies and their purposes
    3. Code quality assessment
    4. Potential improvements or issues
  `;

  console.log('Starting parallel analysis task...\n');

  const result = await orchestrator.run({
    description: taskDescription,
    projectPath,
    type: 'research',
    maxAgents: 4,
    timeoutMs: 300000
  });

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60) + '\n');

  console.log(`Status: ${result.status}`);
  console.log(`Task ID: ${result.taskId}`);
  console.log(`Duration: ${(result.totalExecutionMs / 1000).toFixed(1)}s`);
  console.log(`Subtasks: ${result.subtaskResults.length}`);

  const successful = result.subtaskResults.filter((r) => r.success).length;
  const failed = result.subtaskResults.filter((r) => !r.success).length;

  console.log(`  Successful: ${successful}`);
  console.log(`  Failed: ${failed}`);

  if (result.output) {
    const output = result.output as {
      aggregated?: { insights?: string[]; filesModified?: string[] };
      summary?: string;
    };

    if (output.aggregated?.insights && output.aggregated.insights.length > 0) {
      console.log('\nKey Insights:');
      for (const insight of output.aggregated.insights.slice(0, 10)) {
        console.log(`  - ${insight}`);
      }
    }

    if (output.summary) {
      console.log('\n--- Summary ---');
      console.log(output.summary);
    }
  }

  if (result.error) {
    console.error(`\nError: ${result.error}`);
  }

  await orchestrator.shutdown();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
