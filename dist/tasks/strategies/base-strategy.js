/**
 * Base class for decomposition strategies
 */
export class BaseDecompositionStrategy {
    /**
     * Validate decomposition results
     */
    validateResults(results) {
        if (results.length === 0) {
            throw new Error('Decomposition produced no subtasks');
        }
        // Check for invalid dependency references
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            for (const dep of result.dependencies) {
                if (dep < 0 || dep >= results.length) {
                    throw new Error(`Invalid dependency index ${dep} in subtask ${i}`);
                }
                if (dep === i) {
                    throw new Error(`Subtask ${i} cannot depend on itself`);
                }
            }
        }
        // Check for circular dependencies
        this.checkCircularDependencies(results);
    }
    /**
     * Check for circular dependencies using DFS
     */
    checkCircularDependencies(results) {
        const visited = new Set();
        const inStack = new Set();
        const dfs = (index) => {
            visited.add(index);
            inStack.add(index);
            const deps = results[index]?.dependencies ?? [];
            for (const dep of deps) {
                if (!visited.has(dep)) {
                    if (dfs(dep))
                        return true;
                }
                else if (inStack.has(dep)) {
                    return true; // Circular dependency found
                }
            }
            inStack.delete(index);
            return false;
        };
        for (let i = 0; i < results.length; i++) {
            if (!visited.has(i)) {
                if (dfs(i)) {
                    throw new Error('Circular dependency detected in decomposition');
                }
            }
        }
    }
    /**
     * Sort subtasks topologically
     */
    topologicalSort(results) {
        const inDegree = new Array(results.length).fill(0);
        const adjacency = results.map(() => []);
        // Build adjacency list and calculate in-degrees
        for (let i = 0; i < results.length; i++) {
            for (const dep of results[i].dependencies) {
                adjacency[dep].push(i);
                inDegree[i]++;
            }
        }
        // Find all nodes with no dependencies
        const queue = [];
        for (let i = 0; i < results.length; i++) {
            if (inDegree[i] === 0) {
                queue.push(i);
            }
        }
        const sorted = [];
        while (queue.length > 0) {
            const current = queue.shift();
            sorted.push(results[current]);
            for (const neighbor of adjacency[current]) {
                inDegree[neighbor]--;
                if (inDegree[neighbor] === 0) {
                    queue.push(neighbor);
                }
            }
        }
        return sorted;
    }
}
//# sourceMappingURL=base-strategy.js.map