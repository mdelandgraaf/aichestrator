import { BaseAgent, AgentConfig, AgentProgress } from './base-agent.js';
import { Subtask, SubtaskResult } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
interface WorkerAgentConfig extends AgentConfig {
    apiKey: string;
    maxTokens: number;
    timeoutMs: number;
}
export declare class WorkerAgent extends BaseAgent {
    private client;
    private maxTokens;
    private timeoutMs;
    constructor(config: WorkerAgentConfig, memory: SharedMemory);
    execute(subtask: Subtask): AsyncGenerator<AgentProgress, SubtaskResult>;
    private executeTool;
    private buildPrompt;
    private extractAndShareDiscoveries;
}
export declare function createWorkerAgent(type: WorkerAgentConfig['type'], apiKey: string, model: string, memory: SharedMemory, options?: {
    maxTokens?: number;
    timeoutMs?: number;
}): WorkerAgent;
export {};
//# sourceMappingURL=worker-agent.d.ts.map