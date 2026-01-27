import { TaskInputSchema } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { WorkerPool } from '../workers/worker-pool.js';
import { EventBus } from '../events/event-bus.js';
import { EventTypes } from '../events/event-types.js';
import { HealthMonitor } from './health-monitor.js';
import { ResultAggregator } from './aggregator.js';
import { createStrategy } from '../tasks/strategies/index.js';
import { createLogger } from '../utils/logger.js';
import { TaskError } from '../utils/errors.js';
export class Orchestrator {
    config;
    memory;
    workerPool;
    eventBus;
    healthMonitor;
    aggregator;
    logger;
    isShuttingDown = false;
    isInitialized = false;
    constructor(config) {
        this.config = config;
        this.logger = createLogger('orchestrator', config.logLevel);
        // Initialize core components
        this.memory = new SharedMemory(config.redis.url);
        this.eventBus = new EventBus(config.redis.url);
        this.aggregator = new ResultAggregator(this.memory);
        // Initialize worker pool
        this.workerPool = new WorkerPool({
            maxWorkers: config.orchestrator.maxWorkers,
            workerTimeoutMs: config.orchestrator.defaultTimeoutMs,
            heartbeatIntervalMs: config.orchestrator.heartbeatIntervalMs,
            redisUrl: config.redis.url,
            apiKey: config.anthropic.apiKey,
            model: config.anthropic.model
        }, this.memory, this.eventBus);
        // Initialize health monitor
        this.healthMonitor = new HealthMonitor(this.memory, this.eventBus, {
            heartbeatIntervalMs: config.orchestrator.heartbeatIntervalMs,
            heartbeatTimeoutMs: config.orchestrator.heartbeatTimeoutMs,
            checkIntervalMs: config.orchestrator.heartbeatIntervalMs * 2
        });
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        // Log task events
        this.eventBus.on({ type: EventTypes.TASK_COMPLETED }, (event) => {
            this.logger.info({ taskId: event.taskId, success: event.success }, 'Task completed event');
        });
        this.eventBus.on({ type: EventTypes.SUBTASK_COMPLETED }, (event) => {
            this.logger.debug({ subtaskId: event.subtaskId }, 'Subtask completed event');
        });
        this.eventBus.on({ type: EventTypes.AGENT_ERROR }, (event) => {
            this.logger.error({ agentId: event.agentId, error: event.error }, 'Agent error event');
        });
        this.eventBus.on({ type: EventTypes.AGENT_OFFLINE }, (event) => {
            this.logger.warn({ agentId: event.agentId }, 'Agent went offline');
        });
        // Handle worker pool progress
        this.workerPool.on('progress', (data) => {
            this.logger.debug({ workerId: data.workerId, subtaskId: data.subtaskId }, 'Worker progress');
        });
    }
    /**
     * Initialize the orchestrator (must be called before run)
     */
    async initialize() {
        if (this.isInitialized)
            return;
        // Check Redis connection
        const connected = await this.memory.ping();
        if (!connected) {
            throw new TaskError('Cannot connect to Redis', 'unknown');
        }
        // Start health monitoring
        this.healthMonitor.start();
        // Pre-warm worker pool (optional)
        await this.workerPool.initialize(0);
        this.isInitialized = true;
        this.logger.info('Orchestrator initialized');
    }
    /**
     * Run a task with multi-agent orchestration
     */
    async run(input) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const startTime = Date.now();
        const validated = TaskInputSchema.parse(input);
        this.logger.info({ description: validated.description }, 'Starting task');
        // Create the task
        const task = await this.memory.createTask({
            description: validated.description,
            projectPath: validated.projectPath,
            type: validated.type,
            status: 'pending',
            constraints: {
                maxAgents: validated.maxAgents ?? this.config.orchestrator.maxWorkers,
                timeoutMs: validated.timeoutMs ?? this.config.orchestrator.defaultTimeoutMs
            }
        });
        // Emit task created event
        await this.eventBus.emitTaskCreated(task.id, task.description, task.projectPath);
        try {
            // Initialize shared context
            await this.memory.initContext(task.id, task.projectPath);
            // Decompose task
            await this.memory.updateTaskStatus(task.id, 'decomposing');
            const subtasks = await this.decomposeTask(task);
            if (subtasks.length === 0) {
                throw new TaskError('Decomposition produced no subtasks', task.id);
            }
            this.logger.info({ taskId: task.id, subtaskCount: subtasks.length }, 'Task decomposed');
            // Emit task started
            await this.eventBus.emitTaskStarted(task.id, subtasks.length);
            // Execute subtasks
            await this.memory.updateTaskStatus(task.id, 'executing');
            await this.executeSubtasks(task, subtasks);
            // Aggregate results
            await this.memory.updateTaskStatus(task.id, 'aggregating');
            const aggregated = await this.aggregator.aggregate(task.id);
            // Determine final status
            const hasFailures = aggregated.summary.failed > 0;
            const finalStatus = hasFailures ? 'failed' : 'completed';
            await this.memory.updateTaskStatus(task.id, finalStatus);
            const totalExecutionMs = Date.now() - startTime;
            // Emit completion event
            await this.eventBus.emitTaskCompleted(task.id, !hasFailures, totalExecutionMs);
            this.logger.info({ taskId: task.id, totalExecutionMs, status: finalStatus }, 'Task finished');
            // Build result
            const subtaskResults = await this.memory.getResults(task.id);
            return {
                taskId: task.id,
                status: finalStatus,
                output: {
                    aggregated,
                    summary: this.aggregator.generateSummary(aggregated),
                    mergedOutput: this.aggregator.mergeOutputs(aggregated)
                },
                subtaskResults,
                totalExecutionMs
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.memory.updateTaskStatus(task.id, 'failed', errorMessage);
            await this.eventBus.emitTaskFailed(task.id, errorMessage);
            this.logger.error({ taskId: task.id, error: errorMessage }, 'Task failed');
            return {
                taskId: task.id,
                status: 'failed',
                subtaskResults: [],
                totalExecutionMs: Date.now() - startTime,
                error: errorMessage
            };
        }
    }
    /**
     * Decompose a task into subtasks using the configured strategy
     */
    async decomposeTask(task) {
        const strategyType = this.config.decompositionStrategy ?? 'parallel';
        const strategy = createStrategy(strategyType, this.config.anthropic.apiKey, this.config.anthropic.model);
        this.logger.debug({ strategy: strategyType }, 'Using decomposition strategy');
        const decomposition = await strategy.decompose(task);
        return this.createSubtasksFromDecomposition(task.id, decomposition);
    }
    /**
     * Create subtask records from decomposition results
     */
    async createSubtasksFromDecomposition(taskId, decomposition) {
        const subtasks = [];
        const idMap = new Map();
        // First pass: create all subtasks
        for (let i = 0; i < decomposition.length; i++) {
            const item = decomposition[i];
            const subtask = await this.memory.createSubtask({
                parentTaskId: taskId,
                description: item.description,
                agentType: item.agentType,
                dependencies: [],
                status: 'pending',
                maxAttempts: 3
            });
            subtasks.push(subtask);
            idMap.set(i, subtask.id);
        }
        // Second pass: resolve dependencies
        for (let i = 0; i < decomposition.length; i++) {
            const item = decomposition[i];
            const subtask = subtasks[i];
            if (item.dependencies.length > 0) {
                const depIds = item.dependencies
                    .map((depIndex) => idMap.get(depIndex))
                    .filter((id) => id !== undefined);
                if (depIds.length > 0) {
                    subtask.dependencies = depIds;
                    await this.memory.updateSubtaskStatus(subtask.id, 'blocked');
                }
            }
        }
        return subtasks;
    }
    /**
     * Execute subtasks respecting dependencies
     */
    async executeSubtasks(task, subtasks) {
        const batches = this.buildExecutionBatches(subtasks);
        this.logger.info({ taskId: task.id, batchCount: batches.length }, 'Executing in batches');
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            this.logger.info({ taskId: task.id, batch: i + 1, count: batch.length }, 'Starting batch');
            // Execute all subtasks in this batch in parallel
            const items = batch.map((subtask) => ({
                subtask,
                taskId: task.id
            }));
            const results = await this.workerPool.executeAll(items);
            // Store results
            for (const result of results) {
                await this.memory.storeResult(task.id, result);
            }
            // Report progress
            const progress = await this.getProgress(task.id, subtasks.length);
            await this.eventBus.emitTaskProgress(task.id, 'executing', progress.completed, progress.total);
            // Check if we should continue
            const failedCount = results.filter((r) => !r.success).length;
            if (failedCount > 0) {
                this.logger.warn({ taskId: task.id, failedCount }, 'Some subtasks failed');
            }
        }
    }
    /**
     * Build execution batches from subtasks based on dependencies
     */
    buildExecutionBatches(subtasks) {
        const batches = [];
        const completed = new Set();
        const remaining = new Map(subtasks.map((s) => [s.id, s]));
        while (remaining.size > 0) {
            const batch = [];
            for (const [, subtask] of remaining) {
                const depsCompleted = subtask.dependencies.every((dep) => completed.has(dep));
                if (depsCompleted) {
                    batch.push(subtask);
                }
            }
            if (batch.length === 0 && remaining.size > 0) {
                this.logger.error('Circular dependency or missing subtasks detected');
                throw new Error('Cannot resolve subtask dependencies');
            }
            batches.push(batch);
            for (const subtask of batch) {
                completed.add(subtask.id);
                remaining.delete(subtask.id);
            }
        }
        return batches;
    }
    /**
     * Get current task progress
     */
    async getProgress(taskId, total) {
        const results = await this.memory.getResults(taskId);
        const completed = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        return { completed, failed, total };
    }
    /**
     * Get task status
     */
    async getTaskStatus(taskId) {
        return await this.memory.getTask(taskId);
    }
    /**
     * Get worker pool statistics
     */
    getWorkerStats() {
        return this.workerPool.getStats();
    }
    /**
     * Get health report for all agents
     */
    async getHealthReport() {
        return this.healthMonitor.getHealthReport();
    }
    /**
     * Shutdown the orchestrator gracefully
     */
    async shutdown() {
        if (this.isShuttingDown)
            return;
        this.isShuttingDown = true;
        this.logger.info('Shutting down orchestrator');
        // Emit shutdown event
        await this.eventBus.emitSystemShutdown('Orchestrator shutdown requested');
        // Stop health monitoring
        this.healthMonitor.stop();
        // Shutdown worker pool
        await this.workerPool.shutdown();
        // Close event bus
        await this.eventBus.close();
        // Disconnect from Redis
        await this.memory.disconnect();
        this.logger.info('Orchestrator shutdown complete');
    }
}
//# sourceMappingURL=orchestrator.js.map