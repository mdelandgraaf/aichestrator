import {
  Task,
  TaskInput,
  TaskInputSchema,
  TaskStatus,
  Subtask,
  SubtaskResult
} from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { TaskQueue } from './task-queue.js';
import { createLogger, Logger } from '../utils/logger.js';
import { TaskError } from '../utils/errors.js';

export interface TaskManagerConfig {
  redisUrl: string;
  defaultMaxAgents: number;
  defaultTimeoutMs: number;
}

export class TaskManager {
  private memory: SharedMemory;
  private queue: TaskQueue;
  private logger: Logger;
  private config: TaskManagerConfig;

  constructor(config: TaskManagerConfig) {
    this.config = config;
    this.memory = new SharedMemory(config.redisUrl);
    this.queue = new TaskQueue({
      redisUrl: config.redisUrl,
      concurrency: config.defaultMaxAgents
    });
    this.logger = createLogger('task-manager');
  }

  /**
   * Create a new task
   */
  async createTask(input: TaskInput): Promise<Task> {
    const validated = TaskInputSchema.parse(input);

    const task = await this.memory.createTask({
      description: validated.description,
      projectPath: validated.projectPath,
      type: validated.type,
      status: 'pending',
      constraints: {
        maxAgents: validated.maxAgents ?? this.config.defaultMaxAgents,
        timeoutMs: validated.timeoutMs ?? this.config.defaultTimeoutMs
      }
    });

    // Initialize shared context for the task
    await this.memory.initContext(task.id, task.projectPath);

    this.logger.info({ taskId: task.id }, 'Task created');
    return task;
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    return await this.memory.getTask(taskId);
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void> {
    await this.memory.updateTaskStatus(taskId, status, error);
  }

  /**
   * Queue subtasks for execution
   */
  async queueSubtasks(subtasks: Subtask[], taskId: string): Promise<void> {
    // Separate subtasks by their readiness (no dependencies = ready)
    const ready = subtasks.filter((s) => s.dependencies.length === 0);
    const blocked = subtasks.filter((s) => s.dependencies.length > 0);

    // Queue ready subtasks immediately
    if (ready.length > 0) {
      await this.queue.enqueueBatch(
        ready.map((subtask, index) => ({
          subtask,
          taskId,
          priority: index // Lower index = higher priority
        }))
      );
      this.logger.info({ count: ready.length }, 'Ready subtasks queued');
    }

    // Mark blocked subtasks
    for (const subtask of blocked) {
      await this.memory.updateSubtaskStatus(subtask.id, 'blocked');
    }

    if (blocked.length > 0) {
      this.logger.info({ count: blocked.length }, 'Subtasks blocked on dependencies');
    }
  }

  /**
   * Check and unblock subtasks whose dependencies are complete
   */
  async checkAndUnblockSubtasks(taskId: string): Promise<Subtask[]> {
    const subtasks = await this.memory.getSubtasksForTask(taskId);
    const unblocked: Subtask[] = [];

    for (const subtask of subtasks) {
      if (subtask.status !== 'blocked') continue;

      // Check if all dependencies are completed
      const allDepsComplete = await this.areAllDependenciesComplete(subtask.dependencies);

      if (allDepsComplete) {
        await this.memory.updateSubtaskStatus(subtask.id, 'pending');
        await this.queue.enqueue(subtask, taskId);
        unblocked.push(subtask);
        this.logger.debug({ subtaskId: subtask.id }, 'Subtask unblocked');
      }
    }

    if (unblocked.length > 0) {
      this.logger.info({ count: unblocked.length }, 'Subtasks unblocked');
    }

    return unblocked;
  }

  private async areAllDependenciesComplete(depIds: string[]): Promise<boolean> {
    for (const depId of depIds) {
      const dep = await this.memory.getSubtask(depId);
      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  /**
   * Handle subtask completion
   */
  async onSubtaskComplete(subtaskId: string, result: SubtaskResult): Promise<void> {
    const subtask = await this.memory.getSubtask(subtaskId);
    if (!subtask) {
      this.logger.error({ subtaskId }, 'Subtask not found');
      return;
    }

    // Store result
    await this.memory.storeResult(subtask.parentTaskId, result);

    // Update subtask status
    await this.memory.updateSubtaskStatus(
      subtaskId,
      result.success ? 'completed' : 'failed',
      {
        result: result.output,
        error: result.error
      }
    );

    // Check if any blocked subtasks can now proceed
    await this.checkAndUnblockSubtasks(subtask.parentTaskId);

    // Check if task is complete
    await this.checkTaskCompletion(subtask.parentTaskId);
  }

  /**
   * Check if a task is complete (all subtasks done)
   */
  async checkTaskCompletion(taskId: string): Promise<boolean> {
    const subtasks = await this.memory.getSubtasksForTask(taskId);

    const allComplete = subtasks.every(
      (s) => s.status === 'completed' || s.status === 'failed'
    );

    if (allComplete) {
      const anyFailed = subtasks.some((s) => s.status === 'failed');
      const status: TaskStatus = anyFailed ? 'failed' : 'completed';

      await this.memory.updateTaskStatus(taskId, status);
      this.logger.info({ taskId, status }, 'Task complete');
      return true;
    }

    return false;
  }

  /**
   * Get task progress
   */
  async getProgress(taskId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    executing: number;
    blocked: number;
  }> {
    const subtasks = await this.memory.getSubtasksForTask(taskId);

    return {
      total: subtasks.length,
      completed: subtasks.filter((s) => s.status === 'completed').length,
      failed: subtasks.filter((s) => s.status === 'failed').length,
      pending: subtasks.filter((s) => s.status === 'pending' || s.status === 'queued').length,
      executing: subtasks.filter((s) => s.status === 'executing' || s.status === 'assigned').length,
      blocked: subtasks.filter((s) => s.status === 'blocked').length
    };
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new TaskError('Task not found', taskId);
    }

    // Update task status
    await this.memory.updateTaskStatus(taskId, 'cancelled');

    // Cancel all pending/queued subtasks
    const subtasks = await this.memory.getSubtasksForTask(taskId);
    for (const subtask of subtasks) {
      if (['pending', 'queued', 'blocked'].includes(subtask.status)) {
        await this.memory.updateSubtaskStatus(subtask.id, 'failed', {
          error: 'Task cancelled'
        });
      }
    }

    this.logger.info({ taskId }, 'Task cancelled');
  }

  /**
   * Retry failed subtasks
   */
  async retryFailedSubtasks(taskId: string): Promise<number> {
    const subtasks = await this.memory.getSubtasksForTask(taskId);
    const failed = subtasks.filter(
      (s) => s.status === 'failed' && s.attempts < s.maxAttempts
    );

    for (const subtask of failed) {
      await this.memory.updateSubtaskStatus(subtask.id, 'pending');
      await this.queue.enqueue(subtask, taskId);
    }

    this.logger.info({ taskId, count: failed.length }, 'Retrying failed subtasks');
    return failed.length;
  }

  /**
   * Get the task queue
   */
  getQueue(): TaskQueue {
    return this.queue;
  }

  /**
   * Get shared memory
   */
  getMemory(): SharedMemory {
    return this.memory;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.memory.disconnect();
    this.logger.info('Task manager closed');
  }
}
