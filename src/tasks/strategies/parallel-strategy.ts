import Anthropic from '@anthropic-ai/sdk';
import { Task, AgentTypeSchema } from '../../config/schema.js';
import { BaseDecompositionStrategy, DecompositionResult, ResumeContext } from './base-strategy.js';
import { createLogger, Logger } from '../../utils/logger.js';

/**
 * Parallel decomposition strategy
 * Optimizes for maximum parallelization with minimal dependencies
 */
export class ParallelStrategy extends BaseDecompositionStrategy {
  name = 'parallel';
  private client: Anthropic;
  private model: string;
  private logger: Logger;

  constructor(apiKey: string, model: string) {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.logger = createLogger('parallel-strategy');
  }

  async decompose(task: Task, resumeContext?: ResumeContext): Promise<DecompositionResult[]> {
    this.logger.info({ taskId: task.id, isResume: !!resumeContext }, 'Decomposing with parallel strategy');

    const prompt = resumeContext
      ? this.buildResumePrompt(task, resumeContext)
      : this.buildPrompt(task);

    const systemPrompt = resumeContext
      ? this.buildResumeSystemPrompt()
      : this.buildSystemPrompt();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from decomposition');
    }

    const results = this.parseResponse(textContent.text);
    this.validateResults(results);

    this.logger.info(
      { taskId: task.id, subtaskCount: results.length },
      'Parallel decomposition complete'
    );

    return results;
  }

  private buildSystemPrompt(): string {
    return `You are a task decomposition expert specializing in parallel execution.

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
Dependencies: Array of subtask indices (0-based) that MUST complete first`;
  }

  private buildResumeSystemPrompt(): string {
    return `You are a task decomposition expert. You are being asked to CONTINUE a task that was partially completed.

Your goal is to analyze what work has been done and determine what ADDITIONAL subtasks are needed to complete the original task.

Agent types available:
- researcher: Code analysis, file discovery, pattern identification
- implementer: Writing or modifying code
- reviewer: Code review, quality checks
- tester: Writing and running tests
- documenter: Writing documentation

IMPORTANT:
1. DO NOT repeat work that has already been completed successfully
2. Consider what the failed subtasks were trying to do and either retry with a better approach or break into smaller tasks
3. Check if the completed work has gaps or issues that need addressing
4. Only create subtasks for work that STILL NEEDS TO BE DONE
5. If the task is essentially complete, return an empty subtasks array

Return ONLY valid JSON:
{
  "analysis": "Brief explanation of what's done and what's needed",
  "subtasks": [
    {
      "description": "Clear, actionable description",
      "agentType": "researcher|implementer|reviewer|tester|documenter",
      "dependencies": [],
      "priority": 1,
      "estimatedComplexity": 1
    }
  ]
}`;
  }

  private buildPrompt(task: Task): string {
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

  private buildResumePrompt(task: Task, context: ResumeContext): string {
    let prompt = `Continue this PARTIALLY COMPLETED task:

## Original Task
Type: ${task.type}
Description: ${task.description}

## Project
Path: ${task.projectPath}

`;

    if (context.completedWork.length > 0) {
      prompt += `## Completed Work (DO NOT REPEAT)\n`;
      for (const work of context.completedWork) {
        prompt += `- [${work.agentType}] ${work.description}\n`;
        if (work.filesCreated && work.filesCreated.length > 0) {
          prompt += `  Files created: ${work.filesCreated.join(', ')}\n`;
        }
        if (work.output) {
          const shortOutput = work.output.substring(0, 500);
          prompt += `  Result: ${shortOutput}${work.output.length > 500 ? '...' : ''}\n`;
        }
      }
      prompt += '\n';
    }

    if (context.failedWork.length > 0) {
      prompt += `## Failed Work (needs different approach)\n`;
      for (const work of context.failedWork) {
        prompt += `- [${work.agentType}] ${work.description}\n`;
        if (work.error) {
          prompt += `  Error: ${work.error}\n`;
        }
      }
      prompt += '\n';
    }

    prompt += `## Your Task
1. Analyze what has been completed and what failed
2. Determine what ADDITIONAL work is needed to complete the original task
3. For failed work, consider if the approach should be different
4. DO NOT create subtasks for work that's already done
5. If everything is essentially done, return empty subtasks

Return JSON with only the REMAINING subtasks needed.`;

    return prompt;
  }

  private parseResponse(text: string): DecompositionResult[] {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { subtasks: DecompositionResult[] };

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
