import { Task, AgentType } from '../../config/schema.js';
export interface DecompositionResult {
    description: string;
    agentType: AgentType;
    dependencies: number[];
    priority?: number;
    estimatedComplexity?: number;
}
export interface CompletedWork {
    description: string;
    agentType: AgentType;
    output?: string;
    filesCreated?: string[];
}
export interface FailedWork {
    description: string;
    agentType: AgentType;
    error?: string;
}
export interface ResumeContext {
    completedWork: CompletedWork[];
    failedWork: FailedWork[];
}
export interface DecompositionStrategy {
    name: string;
    decompose(task: Task, resumeContext?: ResumeContext): Promise<DecompositionResult[]>;
}
/**
 * Base class for decomposition strategies
 */
export declare abstract class BaseDecompositionStrategy implements DecompositionStrategy {
    abstract name: string;
    abstract decompose(task: Task, resumeContext?: ResumeContext): Promise<DecompositionResult[]>;
    /**
     * Validate decomposition results
     */
    protected validateResults(results: DecompositionResult[], allowEmpty?: boolean): void;
    /**
     * Check for circular dependencies using DFS
     */
    private checkCircularDependencies;
    /**
     * Sort subtasks topologically
     */
    protected topologicalSort(results: DecompositionResult[]): DecompositionResult[];
}
//# sourceMappingURL=base-strategy.d.ts.map