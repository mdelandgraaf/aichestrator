import Anthropic from '@anthropic-ai/sdk';
import { AgentTypeSchema } from '../../config/schema.js';
import { BaseDecompositionStrategy } from './base-strategy.js';
import { createLogger } from '../../utils/logger.js';
import { projectAnalyzer } from '../../utils/project-analyzer.js';
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
    async decompose(task, resumeContext) {
        this.logger.info({ taskId: task.id, isResume: !!resumeContext }, 'Decomposing with parallel strategy');
        // Analyze the project to detect greenfield and project type
        const projectAnalysis = projectAnalyzer.analyze(task.projectPath);
        // If project is greenfield and type is unknown, try to detect from description
        if (projectAnalysis.isGreenfield && projectAnalysis.projectType === 'unknown') {
            projectAnalysis.projectType = projectAnalyzer.detectTypeFromDescription(task.description);
        }
        this.logger.info({
            taskId: task.id,
            isGreenfield: projectAnalysis.isGreenfield,
            projectType: projectAnalysis.projectType,
            hasBuildSystem: projectAnalysis.hasBuildSystem
        }, 'Project analysis complete');
        const prompt = resumeContext
            ? this.buildResumePrompt(task, resumeContext)
            : this.buildPrompt(task, projectAnalysis);
        const systemPrompt = resumeContext
            ? this.buildResumeSystemPrompt()
            : this.buildSystemPrompt(projectAnalysis);
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
        this.logger.info({ taskId: task.id, subtaskCount: results.length }, 'Parallel decomposition complete');
        return results;
    }
    buildSystemPrompt(projectAnalysis) {
        let prompt = `You are a task decomposition expert specializing in parallel execution.

Your goal is to break down tasks into subtasks that can be executed IN PARALLEL as much as possible.

Agent types available:
- builder: Project setup, initialization, build system configuration, dependency installation, and final build/compile
- researcher: Code analysis, file discovery, pattern identification
- implementer: Writing or modifying code
- reviewer: Code review, quality checks
- tester: Writing and running tests
- documenter: Writing documentation

CRITICAL RULES:
1. Minimize dependencies between subtasks. Only add dependencies when absolutely necessary.
2. The end goal is a WORKING, BUILDABLE product - not just source code files.
3. ALWAYS include build verification as the final step.
`;
        // Add greenfield-specific instructions
        if (projectAnalysis?.isGreenfield) {
            prompt += `
GREENFIELD PROJECT DETECTED:
- This is a new/empty project that needs INITIALIZATION first
- You MUST include a "builder" subtask as the FIRST subtask to set up the project structure
- The builder should: create project scaffolding, initialize build system, set up dependencies
- All implementation subtasks should depend on this initial builder subtask
`;
        }
        // Add build system instructions
        if (projectAnalysis && !projectAnalysis.hasBuildSystem) {
            prompt += `
MISSING BUILD SYSTEM:
- The project does not have a proper build system configured
- Include a builder subtask to set up the build configuration
`;
        }
        // Add project-type specific instructions
        if (projectAnalysis?.projectType && projectAnalysis.projectType !== 'unknown') {
            const buildCommands = projectAnalyzer.getBuildCommands(projectAnalysis.projectType);
            const setupCommands = projectAnalyzer.getSetupCommands(projectAnalysis.projectType);
            prompt += `
PROJECT TYPE: ${projectAnalysis.projectType.toUpperCase()}
- Setup commands: ${setupCommands.join(', ')}
- Build commands: ${buildCommands.join(', ')}
`;
        }
        prompt += `
MANDATORY STRUCTURE:
1. If greenfield: Start with a "builder" subtask for project initialization (priority 1, no dependencies)
2. Research subtasks to understand requirements (can run in parallel with step 1 if not greenfield)
3. Implementation subtasks (depend on research and builder if applicable)
4. Test and review subtasks (depend on implementation)
5. Documentation (can run in parallel with tests)
6. FINAL: A "builder" subtask for build verification that depends on ALL implementation (must verify the project compiles/builds successfully)

Return ONLY valid JSON:
{
  "subtasks": [
    {
      "description": "Clear, actionable description",
      "agentType": "builder|researcher|implementer|reviewer|tester|documenter",
      "dependencies": [],
      "priority": 1,
      "estimatedComplexity": 1
    }
  ]
}

Priority: 1 (highest) to 5 (lowest)
Complexity: 1 (simple) to 5 (complex)
Dependencies: Array of subtask indices (0-based) that MUST complete first`;
        return prompt;
    }
    buildResumeSystemPrompt() {
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
    buildPrompt(task, projectAnalysis) {
        let prompt = `Decompose this task for PARALLEL execution:

## Task
Type: ${task.type}
Description: ${task.description}

## Project
Path: ${task.projectPath}
`;
        // Add project analysis context
        if (projectAnalysis) {
            prompt += `
## Project Analysis
- Is Greenfield (empty/new): ${projectAnalysis.isGreenfield ? 'YES - needs initialization' : 'NO - existing project'}
- Project Type: ${projectAnalysis.projectType}
- Has Build System: ${projectAnalysis.hasBuildSystem ? 'YES' : 'NO - needs setup'}
- Has Package Manager: ${projectAnalysis.hasPackageManager ? 'YES' : 'NO'}
`;
            if (projectAnalysis.missingSetup.length > 0) {
                prompt += `- Missing Setup: ${projectAnalysis.missingSetup.join('; ')}\n`;
            }
            if (projectAnalysis.recommendations.length > 0) {
                prompt += `- Recommendations: ${projectAnalysis.recommendations.join('; ')}\n`;
            }
            if (projectAnalysis.existingFiles.length > 0 && projectAnalysis.existingFiles.length < 20) {
                prompt += `- Existing Files: ${projectAnalysis.existingFiles.join(', ')}\n`;
            }
        }
        prompt += `
## Constraints
- Max parallel agents: ${task.constraints.maxAgents}
- Timeout: ${task.constraints.timeoutMs}ms

## Requirements
1. MAXIMIZE parallelization - minimize dependencies
2. Each subtask should be independently executable when possible
3. Start with research if the codebase needs exploration
4. Group related changes that can be done simultaneously
5. Add review/test subtasks after implementation, but they can run in parallel with each other
6. CRITICAL: The end result must be a WORKING, BUILDABLE product
`;
        // Add specific requirements for greenfield
        if (projectAnalysis?.isGreenfield) {
            prompt += `
## GREENFIELD PROJECT - REQUIRED STRUCTURE:
1. FIRST subtask MUST be a "builder" to initialize the project:
   - Create project structure and scaffolding
   - Set up build system (gradle, npm, cargo, etc.)
   - Initialize package manager and dependencies
   - This subtask has NO dependencies (runs first)

2. All implementation subtasks MUST depend on the initialization builder subtask

3. LAST subtask MUST be a "builder" to verify the build:
   - Run the actual build command to verify everything compiles
   - Generate the final artifact (APK, binary, bundle, etc.)
   - This subtask depends on ALL implementation subtasks
`;
        }
        else if (projectAnalysis && !projectAnalysis.hasBuildSystem) {
            prompt += `
## BUILD SYSTEM MISSING - REQUIRED:
- Include a "builder" subtask early to set up the build system
- Include a final "builder" subtask to verify the build works
`;
        }
        else {
            prompt += `
## BUILD VERIFICATION REQUIRED:
- Include a final "builder" subtask that runs the build/compile step
- This ensures the delivered code actually works, not just exists
`;
        }
        prompt += `
Return JSON with subtasks optimized for parallel execution.`;
        return prompt;
    }
    buildResumePrompt(task, context) {
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