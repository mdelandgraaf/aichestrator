import Anthropic from '@anthropic-ai/sdk';
import { AgentTypeSchema } from '../../config/schema.js';
import { BaseDecompositionStrategy } from './base-strategy.js';
import { createLogger } from '../../utils/logger.js';
/**
 * Parallel decomposition strategy
 * Optimizes for maximum parallelization with minimal dependencies
 */
export class ParallelStrategy extends BaseDecompositionStrategy {
    name = 'parallel';
    client;
    model;
    logger;
    constructor(apiKey, model) {
        super();
        this.client = new Anthropic({ apiKey });
        this.model = model;
        this.logger = createLogger('parallel-strategy');
    }
    async decompose(task) {
        this.logger.info({ taskId: task.id }, 'Decomposing with parallel strategy');
        const prompt = this.buildPrompt(task);
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            system: `You are a task decomposition expert specializing in parallel execution.

Your goal is to break down tasks into subtasks that can be executed IN PARALLEL as much as possible.

Agent types available:
- researcher: Code analysis, file discovery, pattern identification
- implementer: Writing or modifying code
- reviewer: Code review, quality checks
- tester: Writing and running tests
- documenter: Writing documentation

CRITICAL: Minimize dependencies between subtasks. Only add dependencies when absolutely necessary.

Return ONLY valid JSON:
{
  "subtasks": [
    {
      "description": "Clear, actionable description",
      "agentType": "researcher|implementer|reviewer|tester|documenter",
      "dependencies": [],
      "priority": 1,
      "estimatedComplexity": 1
    }
  ]
}

Priority: 1 (highest) to 5 (lowest)
Complexity: 1 (simple) to 5 (complex)
Dependencies: Array of subtask indices (0-based) that MUST complete first`,
            messages: [{ role: 'user', content: prompt }]
        });
        const textContent = response.content.find((block) => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
            throw new Error('No text response from decomposition');
        }
        const results = this.parseResponse(textContent.text);
        this.validateResults(results);
        this.logger.info({ taskId: task.id, subtaskCount: results.length }, 'Parallel decomposition complete');
        return results;
    }
    buildPrompt(task) {
        return `Decompose this task for PARALLEL execution:

## Task
Type: ${task.type}
Description: ${task.description}

## Project
Path: ${task.projectPath}

## Constraints
- Max parallel agents: ${task.constraints.maxAgents}
- Timeout: ${task.constraints.timeoutMs}ms

## Requirements
1. MAXIMIZE parallelization - minimize dependencies
2. Each subtask should be independently executable when possible
3. Start with research if the codebase needs exploration
4. Group related changes that can be done simultaneously
5. Add review/test subtasks after implementation, but they can run in parallel with each other

Return JSON with subtasks optimized for parallel execution.`;
    }
    parseResponse(text) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate and normalize agent types
        for (const subtask of parsed.subtasks) {
            const result = AgentTypeSchema.safeParse(subtask.agentType);
            if (!result.success) {
                subtask.agentType = 'implementer';
            }
        }
        return parsed.subtasks;
    }
}
//# sourceMappingURL=parallel-strategy.js.map