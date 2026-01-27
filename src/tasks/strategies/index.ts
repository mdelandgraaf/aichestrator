export * from './base-strategy.js';
export * from './parallel-strategy.js';
export * from './hierarchical-strategy.js';

import { DecompositionStrategy } from './base-strategy.js';
import { ParallelStrategy } from './parallel-strategy.js';
import { HierarchicalStrategy } from './hierarchical-strategy.js';

export type StrategyType = 'parallel' | 'hierarchical' | 'auto';

export function createStrategy(
  type: StrategyType,
  apiKey: string,
  model: string
): DecompositionStrategy {
  switch (type) {
    case 'parallel':
      return new ParallelStrategy(apiKey, model);
    case 'hierarchical':
      return new HierarchicalStrategy(apiKey, model);
    case 'auto':
      // Default to parallel for most tasks
      return new ParallelStrategy(apiKey, model);
    default:
      return new ParallelStrategy(apiKey, model);
  }
}
