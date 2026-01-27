import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';
import { AgentError, TimeoutError } from '../utils/errors.js';
export class WorkerAgent extends BaseAgent {
    client;
    maxTokens;
    timeoutMs;
    constructor(config, memory) {
        const logger = createLogger(`worker-${config.type}`);
        super(config, memory, logger);
        this.client = new Anthropic({ apiKey: config.apiKey });
        this.maxTokens = config.maxTokens;
        this.timeoutMs = config.timeoutMs;
    }
    async *execute(subtask) {
        const startTime = Date.now();
        this.logger.info({ subtaskId: subtask.id, agentType: this.config.type }, 'Starting subtask execution');
        try {
            // Get shared context from other agents
            const context = await this.memory.getContext(subtask.parentTaskId);
            // Build the prompt with context
            const prompt = this.buildPrompt(subtask, context);
            yield this.createProgress('thinking', 'Analyzing task...');
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new TimeoutError('Agent execution timed out', this.timeoutMs)), this.timeoutMs);
            });
            // Execute with Claude
            const response = await Promise.race([
                this.client.messages.create({
                    model: this.config.model,
                    max_tokens: this.maxTokens,
                    system: this.config.systemPrompt,
                    messages: [{ role: 'user', content: prompt }]
                }),
                timeoutPromise
            ]);
            if (this.aborted) {
                throw new AgentError('Agent was aborted', this.config.id);
            }
            // Process response
            let output = '';
            for (const block of response.content) {
                if (block.type === 'text') {
                    output += block.text;
                    yield this.createProgress('text', block.text);
                }
            }
            // Share key discoveries with other agents
            await this.extractAndShareDiscoveries(subtask.parentTaskId, output);
            yield this.createProgress('complete', 'Task completed');
            const executionMs = Date.now() - startTime;
            this.logger.info({ subtaskId: subtask.id, executionMs }, 'Subtask completed');
            return {
                subtaskId: subtask.id,
                success: true,
                output,
                executionMs
            };
        }
        catch (error) {
            const executionMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error({ subtaskId: subtask.id, error: errorMessage }, 'Subtask failed');
            yield this.createProgress('error', errorMessage);
            return {
                subtaskId: subtask.id,
                success: false,
                error: errorMessage,
                executionMs
            };
        }
    }
    buildPrompt(subtask, context) {
        let prompt = `## Task\n${subtask.description}\n\n`;
        if (context && context.discoveries.length > 0) {
            prompt += `## Context from other agents\n`;
            prompt += `Project path: ${context.projectPath}\n\n`;
            const recentDiscoveries = context.discoveries.slice(-10);
            for (const discovery of recentDiscoveries) {
                prompt += `- [${discovery.type}] ${JSON.stringify(discovery.data)}\n`;
            }
            prompt += '\n';
        }
        prompt += `## Instructions\n`;
        prompt += `Complete the task above. Be thorough and precise.\n`;
        prompt += `If you discover important information (files, patterns, insights), note them clearly.\n`;
        return prompt;
    }
    async extractAndShareDiscoveries(taskId, output) {
        // Simple pattern matching to extract discoveries
        // In a production system, this could be more sophisticated
        const filePattern = /(?:found|discovered|located|file[s]?:?\s*)([^\n,]+\.(?:ts|js|py|json|md))/gi;
        const matches = output.matchAll(filePattern);
        for (const match of matches) {
            if (match[1]) {
                await this.shareDiscovery(taskId, 'file', { path: match[1].trim() });
            }
        }
        // Extract any explicitly marked insights
        const insightPattern = /(?:insight|important|note|key finding):\s*([^\n]+)/gi;
        const insights = output.matchAll(insightPattern);
        for (const insight of insights) {
            if (insight[1]) {
                await this.shareDiscovery(taskId, 'insight', { text: insight[1].trim() });
            }
        }
    }
}
export function createWorkerAgent(type, apiKey, model, memory, options) {
    const systemPrompts = {
        researcher: `You are a code researcher agent. Your job is to analyze codebases thoroughly.
- Identify file structures, patterns, and architectures
- Find relevant code sections for the task at hand
- Document your findings clearly
- Note any dependencies or potential issues`,
        implementer: `You are a code implementer agent. Your job is to write high-quality code.
- Write clean, well-structured code
- Follow existing patterns in the codebase
- Include appropriate error handling
- Document complex logic with comments`,
        reviewer: `You are a code reviewer agent. Your job is to review code changes.
- Check for bugs and potential issues
- Verify code follows best practices
- Ensure adequate error handling
- Look for security vulnerabilities`,
        tester: `You are a test engineer agent. Your job is to write and verify tests.
- Write comprehensive test cases
- Cover edge cases and error conditions
- Ensure tests are maintainable
- Verify existing tests pass`,
        documenter: `You are a documentation agent. Your job is to write clear documentation.
- Document APIs and functions
- Write clear README content
- Create usage examples
- Keep documentation concise but complete`
    };
    return new WorkerAgent({
        id: nanoid(),
        type,
        model,
        apiKey,
        systemPrompt: systemPrompts[type],
        maxTokens: options?.maxTokens ?? 4096,
        timeoutMs: options?.timeoutMs ?? 300000
    }, memory);
}
//# sourceMappingURL=worker-agent.js.map