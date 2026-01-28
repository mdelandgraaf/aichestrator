import {
  Task,
  TaskInput,
  TaskInputSchema,
  TaskResult,
  Subtask,
  SubtaskResult,
  Config
} from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { WorkerPool } from '../workers/worker-pool.js';
import { EventBus } from '../events/event-bus.js';
import { EventTypes } from '../events/event-types.js';
import { HealthMonitor } from './health-monitor.js';
import { ResultAggregator } from './aggregator.js';
import { Remediator } from './remediator.js';
import { createStrategy, StrategyType, DecompositionResult, ResumeContext, CompletedWork, FailedWork } from '../tasks/strategies/index.js';
import { createLogger, Logger } from '../utils/logger.js';
import { TaskError } from '../utils/errors.js';

export interface OrchestratorConfig extends Config {
  decompositionStrategy?: StrategyType;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private memory: SharedMemory;
  private workerPool: WorkerPool;
  private eventBus: EventBus;
  private healthMonitor: HealthMonitor;
  private aggregator: ResultAggregator;
  private remediator: Remediator;
  private logger: Logger;
  private isShuttingDown: boolean = false;
  private isInitialized: boolean = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.logger = createLogger('orchestrator', config.logLevel);

    // Initialize core components
    this.memory = new SharedMemory(config.redis.url);
    this.eventBus = new EventBus(config.redis.url);
    this.aggregator = new ResultAggregator(this.memory);
    this.remediator = new Remediator(config.anthropic.apiKey, config.anthropic.model);

    // Initialize worker pool
    this.workerPool = new WorkerPool(
      {
        maxWorkers: config.orchestrator.maxWorkers,
        workerTimeoutMs: config.orchestrator.defaultTimeoutMs,
        heartbeatIntervalMs: config.orchestrator.heartbeatIntervalMs,
        redisUrl: config.redis.url,
        apiKey: config.anthropic.apiKey,
        model: config.anthropic.model,
        allowInstall: config.orchestrator.allowInstall
      },
      this.memory,
      this.eventBus
    );

    // Initialize health monitor
    this.healthMonitor = new HealthMonitor(this.memory, this.eventBus, {
      heartbeatIntervalMs: config.orchestrator.heartbeatIntervalMs,
      heartbeatTimeoutMs: config.orchestrator.heartbeatTimeoutMs,
      checkIntervalMs: config.orchestrator.heartbeatIntervalMs * 2
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Log task events
    this.eventBus.on({ type: EventTypes.TASK_COMPLETED } as any, (event) => {
      this.logger.info({ taskId: (event as any).taskId, success: (event as any).success }, 'Task completed event');
    });

    this.eventBus.on({ type: EventTypes.SUBTASK_COMPLETED } as any, (event) => {
      this.logger.debug({ subtaskId: (event as any).subtaskId }, 'Subtask completed event');
    });

    this.eventBus.on({ type: EventTypes.AGENT_ERROR } as any, (event) => {
      this.logger.error({ agentId: (event as any).agentId, error: (event as any).error }, 'Agent error event');
    });

    this.eventBus.on({ type: EventTypes.AGENT_OFFLINE } as any, (event) => {
      this.logger.warn({ agentId: (event as any).agentId }, 'Agent went offline');
    });

    // Handle worker pool progress
    this.workerPool.on('progress', (data) => {
      this.logger.debug({ workerId: data.workerId, subtaskId: data.subtaskId }, 'Worker progress');
    });
  }

  /**
   * Initialize the orchestrator (must be called before run)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

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
  async run(input: TaskInput): Promise<TaskResult> {
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

      this.logger.info(
        { taskId: task.id, subtaskCount: subtasks.length },
        'Task decomposed'
      );

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

      this.logger.info(
        { taskId: task.id, totalExecutionMs, status: finalStatus },
        'Task finished'
      );

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
    } catch (error) {
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
  private async decomposeTask(task: Task): Promise<Subtask[]> {
    const strategyType = this.config.decompositionStrategy ?? 'parallel';
    const strategy = createStrategy(
      strategyType,
      this.config.anthropic.apiKey,
      this.config.anthropic.model
    );

    this.logger.debug({ strategy: strategyType }, 'Using decomposition strategy');

    const decomposition = await strategy.decompose(task);
    return this.createSubtasksFromDecomposition(task.id, decomposition);
  }

  /**
   * Create subtask records from decomposition results
   */
  private async createSubtasksFromDecomposition(
    taskId: string,
    decomposition: DecompositionResult[]
  ): Promise<Subtask[]> {
    const subtasks: Subtask[] = [];
    const idMap = new Map<number, string>();

    // First pass: create all subtasks
    for (let i = 0; i < decomposition.length; i++) {
      const item = decomposition[i]!;
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
      const item = decomposition[i]!;
      const subtask = subtasks[i]!;

      if (item.dependencies.length > 0) {
        const depIds = item.dependencies
          .map((depIndex) => idMap.get(depIndex))
          .filter((id): id is string => id !== undefined);

        if (depIds.length > 0) {
          subtask.dependencies = depIds;
          await this.memory.updateSubtaskStatus(subtask.id, 'blocked');
        }
      }
    }

    return subtasks;
  }

  /**
   * Execute subtasks with intelligent remediation for failures
   */
  private async executeSubtasks(task: Task, subtasks: Subtask[]): Promise<void> {
    const maxAttempts = (this.config.orchestrator.maxRetries ?? 2) + 1;
    const attemptCounts = new Map<string, number>();
    let pendingSubtasks = [...subtasks];
    const completedSubtasks: Subtask[] = [];

    this.logger.info(
      { taskId: task.id, subtaskCount: subtasks.length, maxAttempts },
      'Starting intelligent execution'
    );

    while (pendingSubtasks.length > 0) {
      // Build batches from remaining subtasks
      const batches = this.buildExecutionBatches(pendingSubtasks);

      if (batches.length === 0) {
        this.logger.warn({ taskId: task.id }, 'No executable batches, breaking');
        break;
      }

      // Execute first batch (subtasks with satisfied dependencies)
      const batch = batches[0]!;

      this.logger.info(
        { taskId: task.id, batchSize: batch.length, remaining: pendingSubtasks.length },
        'Executing batch'
      );

      // Execute all subtasks in this batch in parallel
      const items = batch.map((subtask) => ({
        subtask,
        taskId: task.id
      }));

      const results = await this.workerPool.executeAll(items);

      // Process results and handle failures intelligently
      const newSubtasksToAdd: Subtask[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const subtask = batch.find((s) => s.id === result.subtaskId)!;
        const attempts = (attemptCounts.get(subtask.id) ?? 0) + 1;
        attemptCounts.set(subtask.id, attempts);

        if (result.success) {
          // Success - store result and mark complete
          await this.memory.storeResult(task.id, result);
          await this.memory.updateSubtaskStatus(subtask.id, 'completed');
          completedSubtasks.push(subtask);
          pendingSubtasks = pendingSubtasks.filter((s) => s.id !== subtask.id);

          this.logger.info(
            { taskId: task.id, subtaskId: subtask.id },
            'Subtask completed successfully'
          );
        } else {
          // Failure - use intelligent remediation
          const decision = await this.remediator.analyzeFailure({
            subtask,
            result,
            attemptNumber: attempts,
            maxAttempts,
            completedSubtasks,
            projectPath: task.projectPath
          });

          this.logger.info(
            { taskId: task.id, subtaskId: subtask.id, action: decision.action, reason: decision.reason },
            'Remediation decision'
          );

          switch (decision.action) {
            case 'retry':
              if (attempts < maxAttempts) {
                // Update description if provided
                if (decision.modifiedDescription) {
                  subtask.description = decision.modifiedDescription;
                  await this.memory.updateSubtaskStatus(subtask.id, 'pending');
                }
                // Keep in pending for retry (already there)
                this.logger.info(
                  { taskId: task.id, subtaskId: subtask.id, attempt: attempts },
                  'Will retry with modified approach'
                );
              } else {
                // Max attempts reached, mark as failed
                await this.memory.storeResult(task.id, result);
                await this.memory.updateSubtaskStatus(subtask.id, 'failed', { error: result.error });
                pendingSubtasks = pendingSubtasks.filter((s) => s.id !== subtask.id);
              }
              break;

            case 'decompose':
              // Create new subtasks from decomposition
              if (decision.newSubtasks && decision.newSubtasks.length > 0) {
                const decomposed = await this.createSubtasksFromDecomposition(
                  task.id,
                  decision.newSubtasks.map((s) => ({
                    description: s.description,
                    agentType: s.agentType as any,
                    dependencies: s.dependencies,
                    priority: 1,
                    estimatedComplexity: 1
                  }))
                );
                newSubtasksToAdd.push(...decomposed);

                this.logger.info(
                  { taskId: task.id, subtaskId: subtask.id, newCount: decomposed.length },
                  'Decomposed into smaller subtasks'
                );
              }
              // Mark original as skipped (replaced by decomposition)
              await this.memory.updateSubtaskStatus(subtask.id, 'completed', { result: 'Decomposed into smaller tasks' });
              pendingSubtasks = pendingSubtasks.filter((s) => s.id !== subtask.id);
              break;

            case 'skip':
              // Mark as skipped and continue
              const skipResult: SubtaskResult = {
                subtaskId: subtask.id,
                success: true,
                output: `Skipped: ${decision.reason}`,
                executionMs: 0
              };
              await this.memory.storeResult(task.id, skipResult);
              await this.memory.updateSubtaskStatus(subtask.id, 'completed', { result: 'Skipped' });
              pendingSubtasks = pendingSubtasks.filter((s) => s.id !== subtask.id);
              break;

            case 'fail':
              // Mark as permanent failure
              await this.memory.storeResult(task.id, result);
              await this.memory.updateSubtaskStatus(subtask.id, 'failed', { error: result.error });
              pendingSubtasks = pendingSubtasks.filter((s) => s.id !== subtask.id);
              break;
          }
        }
      }

      // Add any new subtasks from decomposition
      if (newSubtasksToAdd.length > 0) {
        pendingSubtasks.push(...newSubtasksToAdd);
      }

      // Report progress
      const allSubtasks = await this.memory.getSubtasksForTask(task.id);
      const progress = await this.getProgress(task.id, allSubtasks.length);
      await this.eventBus.emitTaskProgress(
        task.id,
        'executing',
        progress.completed,
        progress.total
      );

      // Small delay between batches to prevent overwhelming
      if (pendingSubtasks.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    this.logger.info(
      { taskId: task.id, completed: completedSubtasks.length },
      'Execution complete'
    );
  }

  /**
   * Build execution batches from subtasks based on dependencies
   */
  private buildExecutionBatches(subtasks: Subtask[]): Subtask[][] {
    const batches: Subtask[][] = [];
    const completed = new Set<string>();
    const remaining = new Map(subtasks.map((s) => [s.id, s]));

    while (remaining.size > 0) {
      const batch: Subtask[] = [];

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
  private async getProgress(
    taskId: string,
    total: number
  ): Promise<{ completed: number; failed: number; total: number }> {
    const results = await this.memory.getResults(taskId);
    const completed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { completed, failed, total };
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<Task | null> {
    return await this.memory.getTask(taskId);
  }

  /**
   * Get worker pool statistics
   */
  getWorkerStats(): { total: number; idle: number; busy: number; pending: number } {
    return this.workerPool.getStats();
  }

  /**
   * Get health report for all agents
   */
  async getHealthReport() {
    return this.healthMonitor.getHealthReport();
  }

  /**
   * Get subtasks for a task
   */
  async getSubtasks(taskId: string) {
    return this.memory.getSubtasksForTask(taskId);
  }

  /**
   * Get the event bus for subscribing to events
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Subscribe to progress events with a callback
   */
  onProgress(callback: (data: { type: string; subtaskId?: string; workerId?: string; message?: string }) => void): void {
    this.workerPool.on('progress', (data) => {
      callback({ type: 'progress', subtaskId: data.subtaskId, workerId: data.workerId });
    });
  }

  /**
   * Resume a failed task by analyzing progress and re-decomposing for remaining work
   */
  async resume(taskId: string): Promise<TaskResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    // Get the existing task
    const task = await this.memory.getTask(taskId);
    if (!task) {
      throw new TaskError(`Task not found: ${taskId}`, taskId);
    }

    this.logger.info({ taskId, status: task.status }, 'Resuming task');

    // Get all subtasks and results
    const allSubtasks = await this.memory.getSubtasksForTask(taskId);
    const existingResults = await this.memory.getResults(taskId);

    // Build context about completed and failed work
    const completedWork: CompletedWork[] = [];
    const failedWork: FailedWork[] = [];

    for (const subtask of allSubtasks) {
      const result = existingResults.find((r) => r.subtaskId === subtask.id);

      if (subtask.status === 'completed' && result?.success) {
        // Extract files created from output (output is unknown, so type guard needed)
        const outputStr = typeof result.output === 'string' ? result.output : undefined;
        const filesMatch = outputStr?.match(/Files created\/modified:\n([\s\S]*?)(?:\n\n|$)/);
        const filesCreated = filesMatch
          ? filesMatch[1]?.split('\n').filter(Boolean)
          : undefined;

        completedWork.push({
          description: subtask.description,
          agentType: subtask.agentType,
          output: outputStr,
          filesCreated
        });
      } else if (subtask.status === 'failed' || (result && !result.success)) {
        const errorStr = result?.error ?? subtask.error;
        failedWork.push({
          description: subtask.description,
          agentType: subtask.agentType,
          error: typeof errorStr === 'string' ? errorStr : undefined
        });
      }
    }

    this.logger.info(
      { taskId, completed: completedWork.length, failed: failedWork.length },
      'Analyzed previous progress'
    );

    // If nothing failed and everything is completed, we're done
    if (failedWork.length === 0 && completedWork.length === allSubtasks.length) {
      this.logger.info({ taskId }, 'Task already completed');
      const aggregated = await this.aggregator.aggregate(taskId);
      return {
        taskId,
        status: 'completed',
        output: {
          aggregated,
          summary: this.aggregator.generateSummary(aggregated),
          mergedOutput: this.aggregator.mergeOutputs(aggregated)
        },
        subtaskResults: existingResults,
        totalExecutionMs: Date.now() - startTime
      };
    }

    try {
      // Re-decompose with context about completed/failed work
      await this.memory.updateTaskStatus(taskId, 'decomposing');

      const resumeContext: ResumeContext = { completedWork, failedWork };
      const strategyType = this.config.decompositionStrategy ?? 'parallel';
      const strategy = createStrategy(
        strategyType,
        this.config.anthropic.apiKey,
        this.config.anthropic.model
      );

      this.logger.info({ taskId, strategy: strategyType }, 'Re-decomposing task with context');
      const newDecomposition = await strategy.decompose(task, resumeContext);

      // If decomposition returns empty, task is complete
      if (newDecomposition.length === 0) {
        this.logger.info({ taskId }, 'No additional work needed');
        await this.memory.updateTaskStatus(taskId, 'completed');
        const aggregated = await this.aggregator.aggregate(taskId);
        return {
          taskId,
          status: 'completed',
          output: {
            aggregated,
            summary: this.aggregator.generateSummary(aggregated),
            mergedOutput: this.aggregator.mergeOutputs(aggregated)
          },
          subtaskResults: existingResults,
          totalExecutionMs: Date.now() - startTime
        };
      }

      // Create new subtasks for remaining work
      const newSubtasks = await this.createSubtasksFromDecomposition(taskId, newDecomposition);

      this.logger.info(
        { taskId, newSubtaskCount: newSubtasks.length },
        'Created new subtasks for remaining work'
      );

      // Emit task started (for progress tracking)
      await this.eventBus.emitTaskStarted(taskId, newSubtasks.length);

      // Update task status
      await this.memory.updateTaskStatus(taskId, 'executing');

      // Execute the new subtasks
      await this.executeSubtasks(task, newSubtasks);

      // Aggregate all results (including previous successes)
      await this.memory.updateTaskStatus(taskId, 'aggregating');
      const aggregated = await this.aggregator.aggregate(taskId);

      // Determine final status
      const hasFailures = aggregated.summary.failed > 0;
      const finalStatus = hasFailures ? 'failed' : 'completed';
      await this.memory.updateTaskStatus(taskId, finalStatus);

      const totalExecutionMs = Date.now() - startTime;

      // Emit completion event
      await this.eventBus.emitTaskCompleted(taskId, !hasFailures, totalExecutionMs);

      this.logger.info(
        { taskId, totalExecutionMs, status: finalStatus },
        'Task resume finished'
      );

      return {
        taskId,
        status: finalStatus,
        output: {
          aggregated,
          summary: this.aggregator.generateSummary(aggregated),
          mergedOutput: this.aggregator.mergeOutputs(aggregated)
        },
        subtaskResults: await this.memory.getResults(taskId),
        totalExecutionMs
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.memory.updateTaskStatus(taskId, 'failed', errorMessage);
      await this.eventBus.emitTaskFailed(taskId, errorMessage);

      this.logger.error({ taskId, error: errorMessage }, 'Task resume failed');

      return {
        taskId,
        status: 'failed',
        subtaskResults: await this.memory.getResults(taskId),
        totalExecutionMs: Date.now() - startTime,
        error: errorMessage
      };
    }
  }

  /**
   * Shutdown the orchestrator gracefully
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
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
