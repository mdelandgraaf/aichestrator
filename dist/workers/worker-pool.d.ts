import { EventEmitter } from 'events';
import { Subtask, SubtaskResult } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { EventBus } from '../events/event-bus.js';
export interface WorkerMessage {
    type: 'ready' | 'progress' | 'heartbeat' | 'result' | 'error' | 'discovery';
    workerId: string;
    subtaskId?: string;
    data?: unknown;
}
export interface WorkerCommand {
    type: 'execute' | 'abort' | 'shutdown';
    subtask?: Subtask;
    taskId?: string;
}
export interface WorkerPoolConfig {
    maxWorkers: number;
    workerTimeoutMs: number;
    heartbeatIntervalMs: number;
    redisUrl: string;
    apiKey: string;
    model: string;
    allowInstall: boolean;
}
export declare class WorkerPool extends EventEmitter {
    private workers;
    private idleWorkers;
    private pendingTasks;
    private config;
    private memory;
    private eventBus;
    private logger;
    private isShuttingDown;
    private healthCheckInterval;
    constructor(config: WorkerPoolConfig, memory: SharedMemory, eventBus: EventBus);
    /**
     * Initialize the worker pool with minimum workers
     */
    initialize(minWorkers?: number): Promise<void>;
    /**
     * Execute a subtask using an available worker
     */
    execute(subtask: Subtask, taskId: string): Promise<SubtaskResult>;
    /**
     * Execute multiple subtasks in parallel
     * Uses allSettled to handle crashes gracefully - converts rejections to failure results
     */
    executeAll(items: Array<{
        subtask: Subtask;
        taskId: string;
    }>): Promise<SubtaskResult[]>;
    private spawnWorker;
    private setupWorkerHandlers;
    private waitForWorkerReady;
    private assignTask;
    private handleHeartbeat;
    private handleProgress;
    private handleResult;
    private handleDiscovery;
    private handleWorkerError;
    private handleWorkerExit;
    private returnWorkerToPool;
    private recoverWorker;
    private startHealthCheck;
    private checkWorkerHealth;
    /**
     * Get pool statistics
     */
    getStats(): {
        total: number;
        idle: number;
        busy: number;
        pending: number;
    };
    /**
     * Shutdown the worker pool
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=worker-pool.d.ts.map