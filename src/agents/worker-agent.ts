import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { BaseAgent, AgentConfig, AgentProgress } from './base-agent.js';
import { Subtask, SubtaskResult, SharedContext } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { createLogger } from '../utils/logger.js';
import { AgentError, TimeoutError } from '../utils/errors.js';

/**
 * Read CLAUDE.md from a project directory if it exists
 */
function readClaudeMd(projectPath: string): string | null {
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    try {
      return readFileSync(claudeMdPath, 'utf-8');
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Read the shared knowledge file from the project directory
 * This file contains discoveries and insights from all agents
 */
function readSharedKnowledge(projectPath: string): string | null {
  const knowledgeFile = join(projectPath, '.aichestrator', 'shared-knowledge.md');
  if (existsSync(knowledgeFile)) {
    try {
      return readFileSync(knowledgeFile, 'utf-8');
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Append an entry to the shared knowledge file
 * This allows agents to share discoveries with future agents
 */
function appendSharedKnowledge(
  projectPath: string,
  agentType: string,
  category: 'file' | 'pattern' | 'insight' | 'architecture' | 'dependency' | 'issue',
  content: string
): void {
  const knowledgeDir = join(projectPath, '.aichestrator');
  const knowledgeFile = join(knowledgeDir, 'shared-knowledge.md');

  if (!existsSync(knowledgeDir)) {
    mkdirSync(knowledgeDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const categoryEmoji: Record<string, string> = {
    file: '📄',
    pattern: '🔄',
    insight: '💡',
    architecture: '🏗️',
    dependency: '📦',
    issue: '⚠️'
  };

  // Initialize file if it doesn't exist
  if (!existsSync(knowledgeFile)) {
    writeFileSync(knowledgeFile, `# Shared Knowledge Base

This file contains discoveries and insights gathered by all agents during task execution.
Agents can read this file for context and add new entries as they discover important information.

---

`);
  }

  const entry = `### ${categoryEmoji[category] || '📝'} [${category.toUpperCase()}] from ${agentType}
*${timestamp}*

${content}

---

`;

  appendFileSync(knowledgeFile, entry);
}

/**
 * Update the shared status file with worker progress
 */
function updateStatusFile(
  projectPath: string,
  workerId: string,
  agentType: string,
  status: 'started' | 'completed' | 'failed',
  description: string,
  details?: string
): void {
  const statusDir = join(projectPath, '.aichestrator');
  const statusFile = join(statusDir, 'status.md');

  if (!existsSync(statusDir)) {
    mkdirSync(statusDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '🚀';

  let entry = `\n### ${statusEmoji} [${timestamp}] ${agentType.toUpperCase()} (${workerId.substring(0, 8)})\n`;
  entry += `**Status:** ${status}\n`;
  entry += `**Task:** ${description}\n`;
  if (details) {
    entry += `**Details:**\n${details}\n`;
  }
  entry += `---\n`;

  // Initialize file if it doesn't exist
  if (!existsSync(statusFile)) {
    writeFileSync(statusFile, `# AIChestrator Status Report\n\nThis file tracks the progress of all worker agents.\n\n---\n`);
  }

  appendFileSync(statusFile, entry);
}

// Tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Path to the file to read' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating directories if needed',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'run_command',
    description: 'Run a shell command and return the output',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The command to run' },
        cwd: { type: 'string', description: 'Working directory for the command' }
      },
      required: ['command']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        pattern: { type: 'string', description: 'Optional glob pattern to filter files' }
      },
      required: ['path']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for information. Use this to find documentation, examples, APIs, or any information needed to complete the task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'fetch_url',
    description: 'Fetch content from a URL. Use this to read documentation pages, API references, or code examples from the web.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to fetch' }
      },
      required: ['url']
    }
  },
  {
    name: 'share_knowledge',
    description: 'Share important discoveries with other agents. Use this to document: architectural decisions, discovered patterns, dependencies, issues found, or any insights that would help other agents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['file', 'pattern', 'insight', 'architecture', 'dependency', 'issue'],
          description: 'Category of knowledge: file (important file discovered), pattern (code pattern found), insight (useful information), architecture (structural decision), dependency (external dependency), issue (problem found)'
        },
        content: {
          type: 'string',
          description: 'The knowledge to share. Be specific and include relevant details like file paths, code examples, or configuration values.'
        }
      },
      required: ['category', 'content']
    }
  }
];

interface WorkerAgentConfig extends AgentConfig {
  apiKey: string;
  maxTokens: number;
  timeoutMs: number;
}

export class WorkerAgent extends BaseAgent {
  private client: Anthropic;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(config: WorkerAgentConfig, memory: SharedMemory) {
    const logger = createLogger(`worker-${config.type}`);
    super(config, memory, logger);

    this.client = new Anthropic({ apiKey: config.apiKey });
    this.maxTokens = config.maxTokens;
    this.timeoutMs = config.timeoutMs;
  }

  async *execute(subtask: Subtask): AsyncGenerator<AgentProgress, SubtaskResult> {
    const startTime = Date.now();
    const filesModified: string[] = [];

    this.logger.info(
      { subtaskId: subtask.id, agentType: this.config.type },
      'Starting subtask execution'
    );

    try {
      // Get shared context from other agents
      const context = await this.memory.getContext(subtask.parentTaskId);
      const projectPath = context?.projectPath ?? process.cwd();

      // Read CLAUDE.md for extra project context
      const claudeMdContent = readClaudeMd(projectPath);

      // Update status file - started
      updateStatusFile(
        projectPath,
        this.config.id,
        this.config.type,
        'started',
        subtask.description
      );

      // Build the prompt with context
      const prompt = this.buildPrompt(subtask, context, claudeMdContent);

      yield this.createProgress('thinking', 'Analyzing task...');

      // Create timeout promise
      const createTimeout = () => new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new TimeoutError('Agent execution timed out', this.timeoutMs)),
          this.timeoutMs
        );
      });

      // Execute with Claude using tools
      let messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
      let output = '';
      let iterations = 0;
      const maxIterations = 20;

      while (iterations < maxIterations) {
        iterations++;

        const response = await Promise.race([
          this.client.messages.create({
            model: this.config.model,
            max_tokens: this.maxTokens,
            system: this.config.systemPrompt,
            tools: TOOLS,
            messages
          }),
          createTimeout()
        ]);

        if (this.aborted) {
          throw new AgentError('Agent was aborted', this.config.id);
        }

        // Process response content
        const assistantContent: Anthropic.ContentBlock[] = [];
        let hasToolUse = false;

        for (const block of response.content) {
          assistantContent.push(block);

          if (block.type === 'text') {
            output += block.text + '\n';
            yield this.createProgress('text', block.text);
          } else if (block.type === 'tool_use') {
            hasToolUse = true;
            yield this.createProgress('tool_use', `Using tool: ${block.name}`);
          }
        }

        // Add assistant message
        messages.push({ role: 'assistant', content: assistantContent });

        // If no tool use, we're done
        if (!hasToolUse || response.stop_reason === 'end_turn') {
          break;
        }

        // Process tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await this.executeTool(block.name, block.input as Record<string, unknown>, context?.projectPath);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.content,
              is_error: result.isError
            });

            if (block.name === 'write_file' && !result.isError) {
              const path = (block.input as { path: string }).path;
              filesModified.push(path);
              yield this.createProgress('file', `Wrote: ${path}`);
            } else if (block.name === 'web_search' && !result.isError) {
              const query = (block.input as { query: string }).query;
              yield this.createProgress('web', `Searched: ${query}`);
            } else if (block.name === 'fetch_url' && !result.isError) {
              const url = (block.input as { url: string }).url;
              yield this.createProgress('web', `Fetched: ${url}`);
            }
          }
        }

        // Add tool results
        messages.push({ role: 'user', content: toolResults });
      }

      // Share key discoveries with other agents (Redis + file-based)
      await this.extractAndShareDiscoveries(subtask.parentTaskId, projectPath, output, filesModified);

      yield this.createProgress('complete', `Task completed. Files modified: ${filesModified.length}`);

      const executionMs = Date.now() - startTime;
      this.logger.info({ subtaskId: subtask.id, executionMs, filesModified: filesModified.length }, 'Subtask completed');

      // Update status file - completed
      const summaryLines = output.split('\n').slice(0, 5).join('\n');
      updateStatusFile(
        projectPath,
        this.config.id,
        this.config.type,
        'completed',
        subtask.description,
        `Duration: ${(executionMs / 1000).toFixed(1)}s\nFiles: ${filesModified.join(', ') || 'none'}\nSummary:\n${summaryLines}`
      );

      return {
        subtaskId: subtask.id,
        success: true,
        output: output + (filesModified.length > 0 ? `\n\nFiles created/modified:\n${filesModified.join('\n')}` : ''),
        executionMs
      };
    } catch (error) {
      const executionMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error({ subtaskId: subtask.id, error: errorMessage }, 'Subtask failed');

      yield this.createProgress('error', errorMessage);

      // Update status file - failed
      const projectPath = (await this.memory.getContext(subtask.parentTaskId))?.projectPath ?? process.cwd();
      updateStatusFile(
        projectPath,
        this.config.id,
        this.config.type,
        'failed',
        subtask.description,
        `Duration: ${(executionMs / 1000).toFixed(1)}s\nError: ${errorMessage}`
      );

      return {
        subtaskId: subtask.id,
        success: false,
        error: errorMessage,
        executionMs
      };
    }
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    projectPath?: string
  ): Promise<{ content: string; isError: boolean }> {
    const basePath = projectPath ?? process.cwd();

    try {
      switch (name) {
        case 'read_file': {
          const path = resolve(basePath, input['path'] as string);
          if (!existsSync(path)) {
            return { content: `File not found: ${path}`, isError: true };
          }
          const content = readFileSync(path, 'utf-8');
          return { content: content.substring(0, 50000), isError: false };
        }

        case 'write_file': {
          const path = resolve(basePath, input['path'] as string);
          const content = input['content'] as string;
          const dir = dirname(path);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(path, content, 'utf-8');
          this.logger.info({ path }, 'File written');
          return { content: `Successfully wrote ${content.length} bytes to ${path}`, isError: false };
        }

        case 'run_command': {
          const command = input['command'] as string;
          const cwd = input['cwd'] ? resolve(basePath, input['cwd'] as string) : basePath;
          const allowInstall = process.env['ALLOW_INSTALL'] === '1';

          // Always block destructive commands
          if (command.includes('rm -rf /') || command.includes('rm -rf ~')) {
            return { content: 'Command not allowed: destructive system-wide operations are blocked', isError: true };
          }

          // Block sudo unless --allow-install is enabled
          if (command.includes('sudo') && !allowInstall) {
            return { content: 'Command not allowed: sudo requires --allow-install flag', isError: true };
          }

          const output = execSync(command, { cwd, timeout: 60000, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
          return { content: output.substring(0, 10000), isError: false };
        }

        case 'list_files': {
          const path = resolve(basePath, input['path'] as string);
          if (!existsSync(path)) {
            return { content: `Directory not found: ${path}`, isError: true };
          }
          const pattern = input['pattern'] as string | undefined;
          const cmd = pattern ? `find . -name "${pattern}" -type f | head -100` : 'ls -la';
          const output = execSync(cmd, { cwd: path, timeout: 10000, encoding: 'utf-8' });
          return { content: output, isError: false };
        }

        case 'web_search': {
          const query = input['query'] as string;
          try {
            // Use DuckDuckGo HTML search (no API key needed)
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const response = await fetch(searchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AIChestrator/1.0)'
              }
            });
            const html = await response.text();
            // Extract search results from HTML
            const results: string[] = [];
            const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            let match;
            while ((match = regex.exec(html)) !== null && results.length < 10) {
              results.push(`${match[2]}: ${match[1]}`);
            }
            if (results.length === 0) {
              // Fallback: extract any links with titles
              const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{10,})<\/a>/g;
              while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
                const href = match[1];
                const text = match[2];
                if (href && text && !href.includes('duckduckgo.com')) {
                  results.push(`${text.trim()}: ${href}`);
                }
              }
            }
            return {
              content: results.length > 0
                ? `Search results for "${query}":\n${results.join('\n')}`
                : `No results found for "${query}"`,
              isError: false
            };
          } catch (error) {
            return { content: `Search failed: ${error instanceof Error ? error.message : String(error)}`, isError: true };
          }
        }

        case 'fetch_url': {
          const url = input['url'] as string;
          try {
            const response = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AIChestrator/1.0)'
              },
              signal: AbortSignal.timeout(30000)
            });
            if (!response.ok) {
              return { content: `HTTP ${response.status}: ${response.statusText}`, isError: true };
            }
            const contentType = response.headers.get('content-type') ?? '';
            let content: string;
            if (contentType.includes('application/json')) {
              content = JSON.stringify(await response.json(), null, 2);
            } else {
              content = await response.text();
              // Strip HTML tags for readability if it's HTML
              if (contentType.includes('text/html')) {
                content = content
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
              }
            }
            // Limit content size
            return { content: content.substring(0, 50000), isError: false };
          } catch (error) {
            return { content: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`, isError: true };
          }
        }

        case 'share_knowledge': {
          const category = input['category'] as 'file' | 'pattern' | 'insight' | 'architecture' | 'dependency' | 'issue';
          const content = input['content'] as string;
          try {
            appendSharedKnowledge(basePath, this.config.type, category, content);
            this.logger.info({ category }, 'Knowledge shared to file');
            return { content: `Knowledge shared successfully: [${category}] ${content.substring(0, 100)}...`, isError: false };
          } catch (error) {
            return { content: `Failed to share knowledge: ${error instanceof Error ? error.message : String(error)}`, isError: true };
          }
        }

        default:
          return { content: `Unknown tool: ${name}`, isError: true };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: `Tool error: ${msg}`, isError: true };
    }
  }

  private buildPrompt(subtask: Subtask, context: SharedContext | null, claudeMdContent: string | null): string {
    let prompt = '';

    // Include CLAUDE.md content for project context
    if (claudeMdContent) {
      prompt += `## Project Context (from CLAUDE.md)\n${claudeMdContent}\n\n`;
    }

    // Include shared knowledge from other agents (file-based, persistent)
    const projectPath = context?.projectPath;
    if (projectPath) {
      const sharedKnowledge = readSharedKnowledge(projectPath);
      if (sharedKnowledge) {
        // Extract just the entries (skip the header)
        const entries = sharedKnowledge.split('---\n').slice(2).join('---\n');
        if (entries.trim()) {
          prompt += `## Shared Knowledge Base\nThe following discoveries have been made by other agents:\n\n${entries}\n`;
        }
      }
    }

    prompt += `## Task\n${subtask.description}\n\n`;

    if (context && context.discoveries.length > 0) {
      prompt += `## Recent discoveries (from Redis)\n`;
      prompt += `Project path: ${context.projectPath}\n\n`;

      const recentDiscoveries = context.discoveries.slice(-10);
      for (const discovery of recentDiscoveries) {
        prompt += `- [${discovery.type}] ${JSON.stringify(discovery.data)}\n`;
      }
      prompt += '\n';
    }

    prompt += `## Instructions\n`;
    prompt += `Complete the task above. Be thorough and precise.\n`;
    prompt += `If you discover important information (files, patterns, architecture decisions, dependencies, or issues), use the share_knowledge tool to document them for other agents.\n`;

    return prompt;
  }

  private async extractAndShareDiscoveries(taskId: string, projectPath: string, output: string, filesModified: string[]): Promise<void> {
    // Share actual files that were modified by this agent (to Redis and file)
    if (filesModified.length > 0) {
      for (const file of filesModified) {
        await this.shareDiscovery(taskId, 'file', { path: file });
      }
      // Write to shared knowledge file
      appendSharedKnowledge(
        projectPath,
        this.config.type,
        'file',
        `Files created/modified:\n${filesModified.map(f => `- ${f}`).join('\n')}`
      );
    }

    // Extract file paths mentioned in output - require path-like patterns
    // Must contain path separator (/) or start with common path prefixes, and end with file extension
    const filePattern = /(?:^|[\s'"`])((\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|py|json|md|yml|yaml|css|scss|html|go|rs|java|c|cpp|h|hpp))\b/gi;
    const matches = output.matchAll(filePattern);
    const seenPaths = new Set(filesModified);

    for (const match of matches) {
      if (match[1]) {
        const path = match[1].trim();
        // Avoid duplicates and filter out obviously wrong matches
        if (!seenPaths.has(path) && path.length > 3 && path.includes('/')) {
          seenPaths.add(path);
          await this.shareDiscovery(taskId, 'file', { path });
        }
      }
    }

    // Extract any explicitly marked insights
    const insightPattern = /(?:insight|important|note|key finding):\s*([^\n]+)/gi;
    const insights = output.matchAll(insightPattern);
    const extractedInsights: string[] = [];

    for (const insight of insights) {
      if (insight[1]) {
        extractedInsights.push(insight[1].trim());
        await this.shareDiscovery(taskId, 'insight', { text: insight[1].trim() });
      }
    }

    // Write insights to shared knowledge file
    if (extractedInsights.length > 0) {
      appendSharedKnowledge(
        projectPath,
        this.config.type,
        'insight',
        extractedInsights.join('\n')
      );
    }
  }
}

export function createWorkerAgent(
  type: WorkerAgentConfig['type'],
  apiKey: string,
  model: string,
  memory: SharedMemory,
  options?: { maxTokens?: number; timeoutMs?: number; allowInstall?: boolean }
): WorkerAgent {
  const allowInstall = options?.allowInstall ?? process.env['ALLOW_INSTALL'] === '1';

  // Common context about the orchestration system
  const orchestrationContext = `## ORCHESTRATION CONTEXT

You are part of AIChestrator, a multi-agent orchestration system. Multiple specialized agents work together in parallel to complete complex tasks.

**How it works:**
- Tasks are decomposed into subtasks that can run in PARALLEL where possible
- Independent work (e.g., frontend + backend) runs simultaneously
- Dependent work (e.g., testing after implementation) waits for prerequisites
- You may receive context from other agents who have already completed their work

**Failure handling:**
- If you fail, an intelligent remediation system will analyze WHY and decide:
  - RETRY: You'll get another attempt with a modified approach
  - DECOMPOSE: Your task may be split into smaller pieces
  - SKIP: If non-critical, your task may be skipped
  - FAIL: Only if truly unrecoverable
- Don't give up easily - try multiple approaches before declaring failure

**Shared context:**
- Check the "Shared Knowledge Base" section for discoveries from other agents
- Other agents may have found relevant files, patterns, architecture decisions, or insights
- Use the share_knowledge tool to document important discoveries for future agents
- Categories: file, pattern, insight, architecture, dependency, issue

**Goal orientation:**
- The ultimate goal is a WORKING, FUNCTIONAL end result
- Write code that compiles and runs, not just code that looks right
- If you're implementing, make sure imports, dependencies, and integrations work
- If something is broken, fix it - don't just document the problem

**Project context:**
- Check for CLAUDE.md in the project root for project-specific guidelines
- Follow existing patterns and conventions in the codebase
- Status is tracked in .aichestrator/status.md
- Shared knowledge is stored in .aichestrator/shared-knowledge.md

---

`;

  const installPermissions = allowInstall
    ? `\n\nINSTALLATION PERMISSIONS: You ARE allowed to install software and dependencies. You can run:
- npm install, yarn add, pnpm add (Node.js packages)
- pip install (Python packages)
- sudo apt-get install, sudo yum install (system packages)
- cargo add (Rust packages)
- go get (Go packages)
Use these commands when dependencies are missing or need to be installed.`
    : `\n\nINSTALLATION RESTRICTIONS: You are NOT allowed to install software. Do not attempt to run sudo, npm install, pip install, or similar installation commands.`;

  const systemPrompts: Record<WorkerAgentConfig['type'], string> = {
    researcher: `You are a code researcher agent. Your job is to analyze codebases thoroughly.
You have access to tools: read_file, list_files, run_command, web_search, fetch_url.

Your workflow:
1. Use list_files to explore the project structure
2. Use read_file to examine relevant source files
3. Use web_search and fetch_url to find documentation, examples, or best practices
4. Document your findings clearly with file paths and line numbers
5. Note any dependencies, patterns, or potential issues

Always use the tools to actually read and explore - don't guess!`,

    implementer: `You are a code implementer agent. Your job is to write high-quality code.
You have access to tools: read_file, write_file, list_files, run_command, web_search, fetch_url.

Your workflow:
1. Use read_file to understand existing code patterns
2. Use web_search and fetch_url to find documentation, APIs, and best practices for technologies you're using
3. Use write_file to create or modify files with your implementation
4. Follow existing patterns in the codebase
5. Include appropriate error handling

IMPORTANT: You MUST use the write_file tool to actually create files. Don't just describe what to write - write it!
Use web_search to find documentation when implementing unfamiliar APIs or libraries.`,

    reviewer: `You are a code reviewer agent. Your job is to review code changes.
You have access to tools: read_file, list_files, web_search, fetch_url.

Your workflow:
1. Use read_file to examine the code being reviewed
2. Use web_search to verify best practices and security guidelines
3. Check for bugs, security issues, and best practices
4. Verify error handling is adequate
5. Provide specific feedback with file paths and line numbers`,

    tester: `You are a test engineer agent. Your job is to write and verify tests.
You have access to tools: read_file, write_file, list_files, run_command, web_search, fetch_url.

Your workflow:
1. Use read_file to understand the code being tested
2. Use web_search to find testing patterns and frameworks documentation
3. Use write_file to create comprehensive test files
4. Use run_command to execute tests if possible
5. Cover edge cases and error conditions

IMPORTANT: You MUST use the write_file tool to create test files. Don't just describe tests - write them!`,

    documenter: `You are a documentation agent. Your job is to write clear documentation.
You have access to tools: read_file, write_file, list_files, web_search, fetch_url.

Your workflow:
1. Use read_file to understand the code being documented
2. Use web_search to find similar documentation examples and best practices
3. Use write_file to create or update documentation files
4. Include usage examples and API documentation
5. Keep documentation concise but complete

IMPORTANT: You MUST use the write_file tool to create documentation files.`,

    builder: `You are a project builder agent. Your job is to set up projects, configure build systems, and verify builds.
You have access to tools: read_file, write_file, list_files, run_command, web_search, fetch_url.

Your responsibilities include:
1. PROJECT INITIALIZATION (for greenfield projects):
   - Create proper project directory structure
   - Initialize build systems (gradle, npm, cargo, go mod, etc.)
   - Set up package managers and dependency files
   - Create essential configuration files

2. BUILD SYSTEM SETUP:
   - Configure build tools appropriately for the project type
   - Set up proper dependency management
   - Create build scripts and configuration files

3. BUILD VERIFICATION (as final step):
   - Run the actual build/compile commands
   - Verify the build succeeds without errors
   - Check that expected artifacts are generated (APK, binary, bundle, etc.)
   - Report any build failures with specific error details

Your workflow:
1. Use list_files to understand current project state
2. Use web_search to find proper setup commands and configuration for the project type
3. Use run_command to execute initialization and build commands
4. Use write_file to create necessary configuration files
5. ALWAYS run the actual build command to verify everything works

CRITICAL COMMANDS BY PROJECT TYPE:
- Android: gradle wrapper, ./gradlew assembleDebug
- Node.js: npm init -y, npm install, npm run build
- Python: pip install -r requirements.txt, python -m build
- Rust: cargo init, cargo build --release
- Go: go mod init, go build
- Flutter: flutter create ., flutter pub get, flutter build apk

ANDROID PROJECT SPECIFICS:
When setting up Android projects, use CORRECT plugin IDs in build.gradle.kts:
- Use "com.android.application" NOT "android"
- Use "org.jetbrains.kotlin.android" NOT "kotlin-android"
- Use "org.jetbrains.kotlin.kapt" NOT "kotlin-kapt"
- Use "com.google.dagger.hilt.android" NOT "hilt"
- Use "com.google.devtools.ksp" NOT "ksp"

Example root build.gradle.kts:
\`\`\`kotlin
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
    id("org.jetbrains.kotlin.kapt") version "1.9.20" apply false
    id("com.google.dagger.hilt.android") version "2.48" apply false
}
\`\`\`

IMPORTANT: You MUST actually run commands to initialize and build the project. Don't just write files - execute the build!
If a build fails, analyze the error and try to fix it. The goal is a WORKING build.`
  };

  return new WorkerAgent(
    {
      id: nanoid(),
      type,
      model,
      apiKey,
      systemPrompt: orchestrationContext + systemPrompts[type] + installPermissions,
      maxTokens: options?.maxTokens ?? 4096,
      timeoutMs: options?.timeoutMs ?? 300000
    },
    memory
  );
}
