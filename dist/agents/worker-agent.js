import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';
import { AgentError, TimeoutError } from '../utils/errors.js';
/**
 * Read CLAUDE.md from a project directory if it exists
 */
function readClaudeMd(projectPath) {
    const claudeMdPath = join(projectPath, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
        try {
            return readFileSync(claudeMdPath, 'utf-8');
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Update the shared status file with worker progress
 */
function updateStatusFile(projectPath, workerId, agentType, status, description, details) {
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
const TOOLS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file',
        input_schema: {
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to fetch' }
            },
            required: ['url']
        }
    }
];
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
        const filesModified = [];
        this.logger.info({ subtaskId: subtask.id, agentType: this.config.type }, 'Starting subtask execution');
        try {
            // Get shared context from other agents
            const context = await this.memory.getContext(subtask.parentTaskId);
            const projectPath = context?.projectPath ?? process.cwd();
            // Read CLAUDE.md for extra project context
            const claudeMdContent = readClaudeMd(projectPath);
            // Update status file - started
            updateStatusFile(projectPath, this.config.id, this.config.type, 'started', subtask.description);
            // Build the prompt with context
            const prompt = this.buildPrompt(subtask, context, claudeMdContent);
            yield this.createProgress('thinking', 'Analyzing task...');
            // Create timeout promise
            const createTimeout = () => new Promise((_, reject) => {
                setTimeout(() => reject(new TimeoutError('Agent execution timed out', this.timeoutMs)), this.timeoutMs);
            });
            // Execute with Claude using tools
            let messages = [{ role: 'user', content: prompt }];
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
                const assistantContent = [];
                let hasToolUse = false;
                for (const block of response.content) {
                    assistantContent.push(block);
                    if (block.type === 'text') {
                        output += block.text + '\n';
                        yield this.createProgress('text', block.text);
                    }
                    else if (block.type === 'tool_use') {
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
                const toolResults = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        const result = await this.executeTool(block.name, block.input, context?.projectPath);
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: result.content,
                            is_error: result.isError
                        });
                        if (block.name === 'write_file' && !result.isError) {
                            const path = block.input.path;
                            filesModified.push(path);
                            yield this.createProgress('file', `Wrote: ${path}`);
                        }
                        else if (block.name === 'web_search' && !result.isError) {
                            const query = block.input.query;
                            yield this.createProgress('web', `Searched: ${query}`);
                        }
                        else if (block.name === 'fetch_url' && !result.isError) {
                            const url = block.input.url;
                            yield this.createProgress('web', `Fetched: ${url}`);
                        }
                    }
                }
                // Add tool results
                messages.push({ role: 'user', content: toolResults });
            }
            // Share key discoveries with other agents
            await this.extractAndShareDiscoveries(subtask.parentTaskId, output, filesModified);
            yield this.createProgress('complete', `Task completed. Files modified: ${filesModified.length}`);
            const executionMs = Date.now() - startTime;
            this.logger.info({ subtaskId: subtask.id, executionMs, filesModified: filesModified.length }, 'Subtask completed');
            // Update status file - completed
            const summaryLines = output.split('\n').slice(0, 5).join('\n');
            updateStatusFile(projectPath, this.config.id, this.config.type, 'completed', subtask.description, `Duration: ${(executionMs / 1000).toFixed(1)}s\nFiles: ${filesModified.join(', ') || 'none'}\nSummary:\n${summaryLines}`);
            return {
                subtaskId: subtask.id,
                success: true,
                output: output + (filesModified.length > 0 ? `\n\nFiles created/modified:\n${filesModified.join('\n')}` : ''),
                executionMs
            };
        }
        catch (error) {
            const executionMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error({ subtaskId: subtask.id, error: errorMessage }, 'Subtask failed');
            yield this.createProgress('error', errorMessage);
            // Update status file - failed
            const projectPath = (await this.memory.getContext(subtask.parentTaskId))?.projectPath ?? process.cwd();
            updateStatusFile(projectPath, this.config.id, this.config.type, 'failed', subtask.description, `Duration: ${(executionMs / 1000).toFixed(1)}s\nError: ${errorMessage}`);
            return {
                subtaskId: subtask.id,
                success: false,
                error: errorMessage,
                executionMs
            };
        }
    }
    async executeTool(name, input, projectPath) {
        const basePath = projectPath ?? process.cwd();
        try {
            switch (name) {
                case 'read_file': {
                    const path = resolve(basePath, input['path']);
                    if (!existsSync(path)) {
                        return { content: `File not found: ${path}`, isError: true };
                    }
                    const content = readFileSync(path, 'utf-8');
                    return { content: content.substring(0, 50000), isError: false };
                }
                case 'write_file': {
                    const path = resolve(basePath, input['path']);
                    const content = input['content'];
                    const dir = dirname(path);
                    if (!existsSync(dir)) {
                        mkdirSync(dir, { recursive: true });
                    }
                    writeFileSync(path, content, 'utf-8');
                    this.logger.info({ path }, 'File written');
                    return { content: `Successfully wrote ${content.length} bytes to ${path}`, isError: false };
                }
                case 'run_command': {
                    const command = input['command'];
                    const cwd = input['cwd'] ? resolve(basePath, input['cwd']) : basePath;
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
                    const path = resolve(basePath, input['path']);
                    if (!existsSync(path)) {
                        return { content: `Directory not found: ${path}`, isError: true };
                    }
                    const pattern = input['pattern'];
                    const cmd = pattern ? `find . -name "${pattern}" -type f | head -100` : 'ls -la';
                    const output = execSync(cmd, { cwd: path, timeout: 10000, encoding: 'utf-8' });
                    return { content: output, isError: false };
                }
                case 'web_search': {
                    const query = input['query'];
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
                        const results = [];
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
                    }
                    catch (error) {
                        return { content: `Search failed: ${error instanceof Error ? error.message : String(error)}`, isError: true };
                    }
                }
                case 'fetch_url': {
                    const url = input['url'];
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
                        let content;
                        if (contentType.includes('application/json')) {
                            content = JSON.stringify(await response.json(), null, 2);
                        }
                        else {
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
                    }
                    catch (error) {
                        return { content: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`, isError: true };
                    }
                }
                default:
                    return { content: `Unknown tool: ${name}`, isError: true };
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { content: `Tool error: ${msg}`, isError: true };
        }
    }
    buildPrompt(subtask, context, claudeMdContent) {
        let prompt = '';
        // Include CLAUDE.md content for project context
        if (claudeMdContent) {
            prompt += `## Project Context (from CLAUDE.md)\n${claudeMdContent}\n\n`;
        }
        prompt += `## Task\n${subtask.description}\n\n`;
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
    async extractAndShareDiscoveries(taskId, output, filesModified) {
        // Share actual files that were modified by this agent
        for (const file of filesModified) {
            await this.shareDiscovery(taskId, 'file', { path: file });
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

IMPORTANT: You MUST use the write_file tool to create documentation files.`
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