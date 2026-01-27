import { Task, AgentType } from '../../config/schema.js';
export interface DecompositionResult {
    description: string;
    agentType: AgentType;
    dependencies: number[];
    priority?: number;
    estimatedComplexity?: number;
}
export interface DecompositionStrategy {
    name: string;
    decompose(task: Task): Promise<DecompositionResult[]>;
}
/**
 * Base class for decomposition strategies
 */
export declare abstract class BaseDecompositionStrategy implements DecompositionStrategy {
    abstract name: string;
    abstract decompose(task: Task): Promise<DecompositionResult[]>;
    /**
     * Validate decomposition results
     */
    protected validateResults(results: DecompositionResult[]): void;
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