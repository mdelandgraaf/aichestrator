import { Task } from '../../config/schema.js';
import { BaseDecompositionStrategy, DecompositionResult } from './base-strategy.js';
/**
 * Parallel decomposition strategy
 * Optimizes for maximum parallelization with minimal dependencies
 */
export declare class ParallelStrategy extends BaseDecompositionStrategy {
    name: string;
    private client;
    private model;
    private logger;
    constructor(apiKey: string, model: string);
    decompose(task: Task): Promise<DecompositionResult[]>;
    private buildPrompt;
    private parseResponse;
}
//# sourceMappingURL=parallel-strategy.d.ts.map