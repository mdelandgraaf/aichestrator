#!/usr/bin/env npx tsx
/**
 * Simple example: Run a single research task
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key npx tsx examples/simple-task.ts
 */

import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { loadConfig } from '../src/config/index.js';

async function main() {
  const config = loadConfig();

  if (!config.anthropic.apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const orchestrator = new Orchestrator(config);

  console.log('Initializing orchestrator...');
  await orchestrator.initialize();

  console.log('Running task...\n');

  const result = await orchestrator.run({
    description: 'Analyze the project structure and list all TypeScript files with their purpose',
    projectPath: process.cwd(),
    type: 'research',
    maxAgents: 2,
    timeoutMs: 120000
  });

  console.log('\n--- Results ---');
  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${(result.totalExecutionMs / 1000).toFixed(1)}s`);

  if (result.output) {
    const output = result.output as { summary?: string };
    if (output.summary) {
      console.log('\nSummary:');
      console.log(output.summary);
    }
  }

  if (result.error) {
    console.error(`Error: ${result.error}`);
  }

  await orchestrator.shutdown();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
