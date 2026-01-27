import { Job } from 'bullmq';
import { Subtask, SubtaskResult } from '../config/schema.js';
export interface QueuedSubtask {
    subtask: Subtask;
    taskId: string;
    priority: number;
}
export interface TaskQueueConfig {
    redisUrl: string;
    concurrency: number;
}
export declare class TaskQueue {
    private queue;
    private worker;
    private events;
    private connection;
    private logger;
    private isProcessing;
    constructor(config: TaskQueueConfig);
    private setupEventListeners;
    /**
     * Add a subtask to the queue
     */
    enqueue(subtask: Subtask, taskId: string, options?: {
        priority?: number;
        delay?: number;
    }): Promise<Job<QueuedSubtask>>;
    /**
     * Add multiple subtasks to the queue
     */
    enqueueBatch(items: Array<{
        subtask: Subtask;
        taskId: string;
        priority?: number;
    }>): Promise<Job<QueuedSubtask>[]>;
    /**
     * Start processing jobs with the given handler
     */
    startProcessing(handler: (job: Job<QueuedSubtask>) => Promise<SubtaskResult>, concurrency: number): void;
    /**
     * Stop processing jobs
     */
    stopProcessing(): Promise<void>;
    /**
     * Get job by ID
     */
    getJob(jobId: string): Promise<Job<QueuedSubtask> | undefined>;
    /**
     * Get queue statistics
     */
    getStats(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
    }>;
    /**
     * Pause the queue
     */
    pause(): Promise<void>;
    /**
     * Resume the queue
     */
    resume(): Promise<void>;
    /**
     * Clear all jobs from the queue
     */
    clear(): Promise<void>;
    /**
     * Wait for a specific job to complete
     */
    waitForJob(jobId: string, timeoutMs?: number): Promise<SubtaskResult | null>;
    /**
     * Clean up and close connections
     */
    close(): Promise<void>;
}
//# sourceMappingURL=task-queue.d.ts.map