#!/usr/bin/env npx tsx
/**
 * Hierarchical refactoring example
 *
 * This example demonstrates the hierarchical decomposition strategy
 * which creates a tree structure of dependent tasks.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key npx tsx examples/hierarchical-refactor.ts <project-path>
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
    decompositionStrategy: 'hierarchical'
  };

  const orchestrator = new Orchestrator(orchestratorConfig);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await orchestrator.shutdown();
    process.exit(0);
  });

  console.log('=== AIChestrator Hierarchical Refactor Example ===\n');
  console.log(`Project: ${projectPath}`);
  console.log('Strategy: hierarchical (tasks may depend on each other)\n');

  await orchestrator.initialize();

  // Example: Plan a refactoring with dependent phases
  const taskDescription = `
    Plan and document a comprehensive refactoring of the utility modules:

    Phase 1: Analyze current utility code and identify issues
    Phase 2: Design new structure based on analysis
    Phase 3: Create migration plan for each utility
    Phase 4: Document the proposed changes

    This is a planning/research task - do not modify any files.
  `;

  console.log('Starting hierarchical refactoring analysis...\n');

  const result = await orchestrator.run({
    description: taskDescription,
    projectPath,
    type: 'refactor',
    maxAgents: 3,
    timeoutMs: 300000
  });

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60) + '\n');

  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${(result.totalExecutionMs / 1000).toFixed(1)}s`);

  // Show subtask execution order (demonstrates hierarchical dependencies)
  if (result.subtaskResults.length > 0) {
    console.log('\nSubtask Execution Order:');
    for (let i = 0; i < result.subtaskResults.length; i++) {
      const subtask = result.subtaskResults[i]!;
      const status = subtask.success ? 'OK' : 'FAILED';
      console.log(`  ${i + 1}. [${status}] ${subtask.subtaskId.substring(0, 8)}...`);
    }
  }

  if (result.output) {
    const output = result.output as { summary?: string };
    if (output.summary) {
      console.log('\n--- Refactoring Plan ---');
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
