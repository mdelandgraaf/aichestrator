import Anthropic from '@anthropic-ai/sdk';
import { AgentTypeSchema } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
export class TaskDecomposer {
    client;
    memory;
    logger;
    model;
    constructor(apiKey, model, memory) {
        this.client = new Anthropic({ apiKey });
        this.memory = memory;
        this.model = model;
        this.logger = createLogger('decomposer');
    }
    async decompose(task) {
        this.logger.info({ taskId: task.id, type: task.type }, 'Decomposing task');
        const prompt = this.buildDecompositionPrompt(task);
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            system: `You are a task decomposition expert. Break down complex software tasks into smaller, parallelizable subtasks.

Each subtask should be assigned to one of these agent types:
- researcher: For code analysis, file discovery, pattern identification
- implementer: For writing or modifying code
- reviewer: For code review and quality checks
- tester: For writing and running tests
- documenter: For writing documentation

Return ONLY valid JSON in this exact format:
{
  "subtasks": [
    {
      "description": "Clear description of what to do",
      "agentType": "researcher|implementer|reviewer|tester|documenter",
      "dependencies": []
    }
  ]
}

The dependencies array contains indices (0-based) of subtasks that must complete before this one.
Optimize for parallelization - minimize dependencies where possible.
Keep subtasks focused and achievable.`,
            messages: [{ role: 'user', content: prompt }]
        });
        const textContent = response.content.find((block) => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
            throw new Error('No text response from decomposition');
        }
        const parsed = this.parseDecomposition(textContent.text);
        const subtasks = await this.createSubtasks(task.id, parsed);
        this.logger.info({ taskId: task.id, subtaskCount: subtasks.length }, 'Task decomposed');
        return subtasks;
    }
    buildDecompositionPrompt(task) {
        return `Decompose this ${task.type} task into subtasks:

## Task Description
${task.description}

## Project Path
${task.projectPath}

## Constraints
- Maximum parallel agents: ${task.constraints.maxAgents}
- Timeout: ${task.constraints.timeoutMs}ms

## Requirements
1. Start with a researcher subtask to understand the codebase (if needed)
2. Break implementation into logical, independent pieces
3. Include a reviewer subtask at the end to verify changes
4. Include tester subtask if code changes are made
5. Keep each subtask focused on a single responsibility

Return the subtasks as JSON.`;
    }
    parseDecomposition(text) {
        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in decomposition response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate agent types
        for (const subtask of parsed.subtasks) {
            const result = AgentTypeSchema.safeParse(subtask.agentType);
            if (!result.success) {
                this.logger.warn({ agentType: subtask.agentType }, 'Invalid agent type, defaulting to implementer');
                subtask.agentType = 'implementer';
            }
        }
        return parsed.subtasks;
    }
    async createSubtasks(taskId, decomposition) {
        const subtasks = [];
        const idMap = new Map(); // index -> subtask ID
        // First pass: create subtasks without dependencies
        for (let i = 0; i < decomposition.length; i++) {
            const item = decomposition[i];
            const subtask = await this.memory.createSubtask({
                parentTaskId: taskId,
                description: item.description,
                agentType: item.agentType,
                dependencies: [], // Will be filled in second pass
                status: 'pending',
                maxAttempts: 3
            });
            subtasks.push(subtask);
            idMap.set(i, subtask.id);
        }
        // Second pass: resolve dependency indices to IDs
        for (let i = 0; i < decomposition.length; i++) {
            const item = decomposition[i];
            const subtask = subtasks[i];
            if (item.dependencies.length > 0) {
                const depIds = item.dependencies
                    .map((depIndex) => idMap.get(depIndex))
                    .filter((id) => id !== undefined);
                if (depIds.length > 0) {
                    await this.memory.updateSubtaskStatus(subtask.id, 'blocked', {});
                    // Update the subtask in our local array
                    subtask.dependencies = depIds;
                    subtask.status = 'blocked';
                }
            }
        }
        return subtasks;
    }
    /**
     * Build execution batches from subtasks based on dependencies.
     * Returns arrays of subtasks that can be executed in parallel.
     */
    buildExecutionBatches(subtasks) {
        const batches = [];
        const completed = new Set();
        const remaining = new Set(subtasks.map((s) => s.id));
        while (remaining.size > 0) {
            const batch = [];
            for (const subtask of subtasks) {
                if (!remaining.has(subtask.id))
                    continue;
                // Check if all dependencies are completed
                const depsCompleted = subtask.dependencies.every((dep) => completed.has(dep));
                if (depsCompleted) {
                    batch.push(subtask);
                }
            }
            if (batch.length === 0 && remaining.size > 0) {
                // Circular dependency or missing subtasks
                this.logger.error({ remaining: Array.from(remaining) }, 'Circular dependency detected');
                throw new Error('Circular dependency detected in subtasks');
            }
            batches.push(batch);
            // Mark batch subtasks as completed for next iteration
            for (const subtask of batch) {
                completed.add(subtask.id);
                remaining.delete(subtask.id);
            }
        }
        return batches;
    }
}
//# sourceMappingURL=decomposer.js.map