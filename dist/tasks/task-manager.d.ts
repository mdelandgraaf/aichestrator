import { Task, TaskInput, TaskStatus, Subtask, SubtaskResult } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { TaskQueue } from './task-queue.js';
export interface TaskManagerConfig {
    redisUrl: string;
    defaultMaxAgents: number;
    defaultTimeoutMs: number;
}
export declare class TaskManager {
    private memory;
    private queue;
    private logger;
    private config;
    constructor(config: TaskManagerConfig);
    /**
     * Create a new task
     */
    createTask(input: TaskInput): Promise<Task>;
    /**
     * Get a task by ID
     */
    getTask(taskId: string): Promise<Task | null>;
    /**
     * Update task status
     */
    updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void>;
    /**
     * Queue subtasks for execution
     */
    queueSubtasks(subtasks: Subtask[], taskId: string): Promise<void>;
    /**
     * Check and unblock subtasks whose dependencies are complete
     */
    checkAndUnblockSubtasks(taskId: string): Promise<Subtask[]>;
    private areAllDependenciesComplete;
    /**
     * Handle subtask completion
     */
    onSubtaskComplete(subtaskId: string, result: SubtaskResult): Promise<void>;
    /**
     * Check if a task is complete (all subtasks done)
     */
    checkTaskCompletion(taskId: string): Promise<boolean>;
    /**
     * Get task progress
     */
    getProgress(taskId: string): Promise<{
        total: number;
        completed: number;
        failed: number;
        pending: number;
        executing: number;
        blocked: number;
    }>;
    /**
     * Cancel a task
     */
    cancelTask(taskId: string): Promise<void>;
    /**
     * Retry failed subtasks
     */
    retryFailedSubtasks(taskId: string): Promise<number>;
    /**
     * Get the task queue
     */
    getQueue(): TaskQueue;
    /**
     * Get shared memory
     */
    getMemory(): SharedMemory;
    /**
     * Close connections
     */
    close(): Promise<void>;
}
//# sourceMappingURL=task-manager.d.ts.map