import { Task } from '../../config/schema.js';
import { BaseDecompositionStrategy, DecompositionResult } from './base-strategy.js';
/**
 * Hierarchical decomposition strategy
 * Breaks tasks into a tree structure, then flattens with proper dependencies
 */
export declare class HierarchicalStrategy extends BaseDecompositionStrategy {
    name: string;
    private client;
    private model;
    private logger;
    private maxDepth;
    constructor(apiKey: string, model: string, maxDepth?: number);
    decompose(task: Task): Promise<DecompositionResult[]>;
    private decomposeIntoPhases;
    private expandPhase;
    private parsePhases;
    private flattenTree;
}
//# sourceMappingURL=hierarchical-strategy.d.ts.map