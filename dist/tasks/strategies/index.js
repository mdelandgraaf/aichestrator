export * from './base-strategy.js';
export * from './parallel-strategy.js';
export * from './hierarchical-strategy.js';
import { ParallelStrategy } from './parallel-strategy.js';
import { HierarchicalStrategy } from './hierarchical-strategy.js';
export function createStrategy(type, apiKey, model) {
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
//# sourceMappingURL=index.js.map