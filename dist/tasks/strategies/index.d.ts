export * from './base-strategy.js';
export * from './parallel-strategy.js';
export * from './hierarchical-strategy.js';
import { DecompositionStrategy } from './base-strategy.js';
export type StrategyType = 'parallel' | 'hierarchical' | 'auto';
export declare function createStrategy(type: StrategyType, apiKey: string, model: string): DecompositionStrategy;
//# sourceMappingURL=index.d.ts.map