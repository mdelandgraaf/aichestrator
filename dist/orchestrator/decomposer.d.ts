import { Task, Subtask } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
export declare class TaskDecomposer {
    private client;
    private memory;
    private logger;
    private model;
    constructor(apiKey: string, model: string, memory: SharedMemory);
    decompose(task: Task): Promise<Subtask[]>;
    private buildDecompositionPrompt;
    private parseDecomposition;
    private createSubtasks;
    /**
     * Build execution batches from subtasks based on dependencies.
     * Returns arrays of subtasks that can be executed in parallel.
     */
    buildExecutionBatches(subtasks: Subtask[]): Subtask[][];
}
//# sourceMappingURL=decomposer.d.ts.map