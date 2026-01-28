import { Task, TaskInput, TaskResult, Config } from '../config/schema.js';
import { EventBus } from '../events/event-bus.js';
import { StrategyType } from '../tasks/strategies/index.js';
export interface OrchestratorConfig extends Config {
    decompositionStrategy?: StrategyType;
}
export declare class Orchestrator {
    private config;
    private memory;
    private workerPool;
    private eventBus;
    private healthMonitor;
    private aggregator;
    private remediator;
    private logger;
    private isShuttingDown;
    private isInitialized;
    constructor(config: OrchestratorConfig);
    private setupEventHandlers;
    /**
     * Initialize the orchestrator (must be called before run)
     */
    initialize(): Promise<void>;
    /**
     * Run a task with multi-agent orchestration
     */
    run(input: TaskInput): Promise<TaskResult>;
    /**
     * Decompose a task into subtasks using the configured strategy
     */
    private decomposeTask;
    /**
     * Create subtask records from decomposition results
     */
    private createSubtasksFromDecomposition;
    /**
     * Execute subtasks with intelligent remediation for failures
     */
    private executeSubtasks;
    /**
     * Build execution batches from subtasks based on dependencies, handling failed dependencies
     * @param subtasks - Subtasks to schedule
     * @param alreadyCompleted - IDs of subtasks that have already completed
     * @param alreadyFailed - IDs of subtasks that have failed
     */
    private buildExecutionBatchesWithFailureHandling;
    /**
     * Find which failed subtask is blocking the most work
     */
    private findBlockingFailure;
    /**
     * Create a subtask to fix a failed subtask's errors and unblock dependents
     */
    private createFixSubtask;
    /**
     * Get current task progress
     */
    private getProgress;
    /**
     * Get task status
     */
    getTaskStatus(taskId: string): Promise<Task | null>;
    /**
     * Get worker pool statistics
     */
    getWorkerStats(): {
        total: number;
        idle: number;
        busy: number;
        pending: number;
    };
    /**
     * Get health report for all agents
     */
    getHealthReport(): Promise<{
        healthy: number;
        warning: number;
        critical: number;
        dead: number;
        agents: import("./health-monitor.js").AgentHealth[];
    }>;
    /**
     * Get subtasks for a task
     */
    getSubtasks(taskId: string): Promise<{
        status: "pending" | "executing" | "completed" | "failed" | "blocked" | "queued" | "assigned";
        id: string;
        description: string;
        createdAt: number;
        updatedAt: number;
        parentTaskId: string;
        agentType: "researcher" | "implementer" | "reviewer" | "tester" | "documenter" | "builder";
        dependencies: string[];
        attempts: number;
        maxAttempts: number;
        error?: string | undefined;
        assignedAgentId?: string | undefined;
        result?: unknown;
    }[]>;
    /**
     * Get the event bus for subscribing to events
     */
    getEventBus(): EventBus;
    /**
     * Subscribe to progress events with a callback
     */
    onProgress(callback: (data: {
        type: string;
        subtaskId?: string;
        workerId?: string;
        message?: string;
    }) => void): void;
    /**
     * Resume a failed task by analyzing progress and re-decomposing for remaining work
     */
    resume(taskId: string): Promise<TaskResult>;
    /**
     * Shutdown the orchestrator gracefully
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=orchestrator.d.ts.map