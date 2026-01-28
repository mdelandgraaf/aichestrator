import Anthropic from '@anthropic-ai/sdk';
import { AgentTypeSchema } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
export class Remediator {
    client;
    model;
    logger;
    constructor(apiKey, model) {
        this.client = new Anthropic({ apiKey });
        this.model = model;
        this.logger = createLogger('remediator');
    }
    /**
     * Analyze a failed subtask and decide how to remediate
     */
    async analyzeFailure(context) {
        this.logger.info({ subtaskId: context.subtask.id, attempt: context.attemptNumber, error: context.result.error }, 'Analyzing failure for remediation');
        const prompt = this.buildAnalysisPrompt(context);
        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 2048,
                system: this.buildSystemPrompt(),
                messages: [{ role: 'user', content: prompt }]
            });
            const textContent = response.content.find((block) => block.type === 'text');
            if (!textContent || textContent.type !== 'text') {
                throw new Error('No text response from remediation analysis');
            }
            const decision = this.parseDecision(textContent.text);
            this.logger.info({ subtaskId: context.subtask.id, action: decision.action, reason: decision.reason }, 'Remediation decision made');
            return decision;
        }
        catch (error) {
            this.logger.error({ subtaskId: context.subtask.id, error: String(error) }, 'Remediation analysis failed, defaulting to retry');
            // Default to simple retry if analysis fails
            return {
                action: 'retry',
                reason: 'Remediation analysis failed, attempting simple retry'
            };
        }
    }
    buildSystemPrompt() {
        return `You are an intelligent task remediation system. When a subtask fails, you analyze the failure and decide the best course of action.

Your options are:
1. **retry** - Retry the same task with a modified approach/description
2. **decompose** - Break the task into smaller, more manageable subtasks
3. **skip** - Skip this task if it's not critical and the main goal can still be achieved
4. **fail** - Mark as permanent failure if it cannot be recovered

Consider:
- The error message and what it indicates
- Whether the task is too complex and needs breaking down
- Whether a different approach might succeed
- Whether retrying would likely produce the same error
- What work has already been completed successfully

Return ONLY valid JSON:
{
  "action": "retry|decompose|skip|fail",
  "reason": "Brief explanation of your decision",
  "modifiedDescription": "Only for retry - improved task description",
  "newSubtasks": [
    {
      "description": "Only for decompose - subtask description",
      "agentType": "researcher|implementer|reviewer|tester|documenter",
      "dependencies": []
    }
  ]
}`;
    }
    buildAnalysisPrompt(context) {
        let prompt = `## Failed Subtask Analysis

**Task Description:** ${context.subtask.description}
**Agent Type:** ${context.subtask.agentType}
**Attempt:** ${context.attemptNumber} of ${context.maxAttempts}
**Error:** ${context.result.error || 'Unknown error'}

**Project Path:** ${context.projectPath}

`;
        if (context.completedSubtasks.length > 0) {
            prompt += `## Already Completed Work\n`;
            for (const completed of context.completedSubtasks) {
                prompt += `- [${completed.agentType}] ${completed.description}\n`;
            }
            prompt += '\n';
        }
        prompt += `## Analysis Request
Based on the error and context:
1. Is this a transient error that might succeed on retry?
2. Is the task too complex and needs to be broken into smaller pieces?
3. Can we skip this task without affecting the overall goal?
4. Is this a permanent failure that cannot be recovered?

Decide the best remediation action.`;
        return prompt;
    }
    parseDecision(text) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in remediation response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate action
        if (!['retry', 'decompose', 'skip', 'fail'].includes(parsed.action)) {
            parsed.action = 'retry';
        }
        // Validate newSubtasks agent types if decomposing
        if (parsed.action === 'decompose' && parsed.newSubtasks) {
            for (const subtask of parsed.newSubtasks) {
                const result = AgentTypeSchema.safeParse(subtask.agentType);
                if (!result.success) {
                    subtask.agentType = 'implementer';
                }
            }
        }
        return parsed;
    }
}
//# sourceMappingURL=remediator.js.map