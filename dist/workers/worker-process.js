#!/usr/bin/env node
/**
 * Worker process entry point.
 * This file is forked by the worker pool to execute subtasks in parallel.
 * Communicates with the parent process via IPC.
 */
import 'dotenv/config';
import { SharedMemory } from '../memory/shared-memory.js';
import { createWorkerAgent } from '../agents/worker-agent.js';
import { AgentTypeSchema } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('worker-process');
// Environment variables
const workerId = process.env['WORKER_ID'] ?? 'unknown';
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
const model = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514';
const timeoutMs = parseInt(process.env['TIMEOUT_MS'] ?? '300000', 10);
const heartbeatIntervalMs = parseInt(process.env['HEARTBEAT_INTERVAL_MS'] ?? '5000', 10);
let memory = null;
let heartbeatTimer = null;
let shouldAbort = false;
/**
 * Send a message to the parent process
 */
function send(msg) {
    if (process.send) {
        process.send(msg);
    }
}
/**
 * Start sending heartbeats - both IPC and Redis
 */
function startHeartbeat() {
    heartbeatTimer = setInterval(async () => {
        send({
            type: 'heartbeat',
            workerId
        });
        // Also update Redis heartbeat to keep health monitor happy
        if (memory) {
            try {
                await memory.updateHeartbeat(workerId);
            }
            catch {
                // Ignore heartbeat update errors
            }
        }
    }, heartbeatIntervalMs);
}
/**
 * Stop heartbeats
 */
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}
/**
 * Execute a subtask
 */
async function executeSubtask(subtask, _taskId) {
    if (!memory) {
        memory = new SharedMemory(redisUrl);
    }
    const startTime = Date.now();
    shouldAbort = false;
    logger.info({ workerId, subtaskId: subtask.id }, 'Executing subtask');
    try {
        // Validate agent type
        const agentTypeResult = AgentTypeSchema.safeParse(subtask.agentType);
        if (!agentTypeResult.success) {
            throw new Error(`Invalid agent type: ${subtask.agentType}`);
        }
        const agentType = agentTypeResult.data;
        // Register as agent
        await memory.registerAgent({
            id: workerId,
            type: agentType,
            pid: process.pid,
            status: 'busy',
            currentSubtaskId: subtask.id
        });
        // Update subtask status
        await memory.updateSubtaskStatus(subtask.id, 'executing');
        // Create the agent
        const agent = createWorkerAgent(agentType, apiKey, model, memory, { timeoutMs });
        // Execute and collect result
        let result = null;
        const generator = agent.execute(subtask);
        let iterResult = await generator.next();
        while (!iterResult.done) {
            if (shouldAbort) {
                await agent.abort();
                throw new Error('Execution aborted');
            }
            const progress = iterResult.value;
            // Send progress to parent
            send({
                type: 'progress',
                workerId,
                subtaskId: subtask.id,
                data: progress
            });
            // Update heartbeat
            await memory.updateHeartbeat(workerId);
            iterResult = await generator.next();
        }
        result = iterResult.value;
        // Update subtask in memory
        await memory.updateSubtaskStatus(subtask.id, result.success ? 'completed' : 'failed', {
            result: result.output,
            error: result.error
        });
        // Update agent status
        await memory.updateAgentStatus(workerId, 'idle');
        // Send result to parent
        send({
            type: 'result',
            workerId,
            subtaskId: subtask.id,
            data: result
        });
        logger.info({ workerId, subtaskId: subtask.id, success: result.success, durationMs: Date.now() - startTime }, 'Subtask completed');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ workerId, subtaskId: subtask.id, error: errorMessage }, 'Subtask execution failed');
        // Update subtask status
        try {
            await memory?.updateSubtaskStatus(subtask.id, 'failed', {
                error: errorMessage
            });
            await memory?.updateAgentStatus(workerId, 'error');
        }
        catch {
            // Ignore cleanup errors
        }
        // Send error to parent
        send({
            type: 'error',
            workerId,
            subtaskId: subtask.id,
            data: errorMessage
        });
    }
}
/**
 * Handle commands from parent process
 */
function handleCommand(command) {
    switch (command.type) {
        case 'execute':
            if (command.subtask && command.taskId) {
                executeSubtask(command.subtask, command.taskId).catch((error) => {
                    logger.error({ error: String(error) }, 'Unhandled execution error');
                });
            }
            break;
        case 'abort':
            logger.info({ workerId }, 'Abort requested');
            shouldAbort = true;
            break;
        case 'shutdown':
            logger.info({ workerId }, 'Shutdown requested');
            shutdown().catch(() => {
                process.exit(0);
            });
            break;
    }
}
/**
 * Clean shutdown
 */
async function shutdown() {
    logger.info({ workerId }, 'Shutting down worker');
    stopHeartbeat();
    if (memory) {
        try {
            await memory.removeAgent(workerId);
            await memory.disconnect();
        }
        catch {
            // Ignore cleanup errors
        }
    }
    process.exit(0);
}
/**
 * Main initialization
 */
async function main() {
    logger.info({ workerId, pid: process.pid }, 'Worker starting');
    // Initialize memory connection
    memory = new SharedMemory(redisUrl);
    // Start heartbeat
    startHeartbeat();
    // Listen for commands from parent
    process.on('message', (msg) => {
        handleCommand(msg);
    });
    // Handle termination signals
    process.on('SIGTERM', () => {
        logger.info({ workerId }, 'Received SIGTERM');
        shutdown();
    });
    process.on('SIGINT', () => {
        logger.info({ workerId }, 'Received SIGINT');
        shutdown();
    });
    // Notify parent we're ready
    send({
        type: 'ready',
        workerId
    });
    logger.info({ workerId }, 'Worker ready');
}
// Start the worker
main().catch((error) => {
    logger.error({ error: String(error) }, 'Worker failed to start');
    process.exit(1);
});
//# sourceMappingURL=worker-process.js.map