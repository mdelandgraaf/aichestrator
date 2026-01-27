import { Task, TaskInput, TaskResult, Config } from '../config/schema.js';
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
     * Execute subtasks respecting dependencies
     */
    private executeSubtasks;
    /**
     * Build execution batches from subtasks based on dependencies
     */
    private buildExecutionBatches;
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
     * Shutdown the orchestrator gracefully
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=orchestrator.d.ts.map