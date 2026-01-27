import { AgentType } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
export interface AggregatedResult {
    summary: {
        total: number;
        successful: number;
        failed: number;
        totalDurationMs: number;
        avgDurationMs: number;
    };
    byAgentType: Record<AgentType, {
        count: number;
        successful: number;
        failed: number;
        avgDurationMs: number;
    }>;
    outputs: Array<{
        subtaskId: string;
        agentType: AgentType;
        description: string;
        output: unknown;
        durationMs: number;
    }>;
    errors: Array<{
        subtaskId: string;
        agentType: AgentType;
        description: string;
        error: string;
        attempts: number;
    }>;
    insights: string[];
    filesModified: string[];
    timeline: Array<{
        subtaskId: string;
        agentType: AgentType;
        startTime: number;
        endTime: number;
        success: boolean;
    }>;
}
export declare class ResultAggregator {
    private memory;
    private logger;
    constructor(memory: SharedMemory);
    /**
     * Aggregate all results for a task
     */
    aggregate(taskId: string): Promise<AggregatedResult>;
    /**
     * Generate a human-readable summary
     */
    generateSummary(result: AggregatedResult): string;
    /**
     * Merge outputs from all successful subtasks
     */
    mergeOutputs(result: AggregatedResult): string;
}
//# sourceMappingURL=aggregator.d.ts.map