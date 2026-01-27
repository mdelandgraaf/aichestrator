import { AgentType, Subtask, SubtaskResult } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { Logger } from '../utils/logger.js';
export interface AgentConfig {
    id: string;
    type: AgentType;
    model: string;
    systemPrompt: string;
}
export interface AgentProgress {
    type: 'thinking' | 'tool_use' | 'text' | 'error' | 'complete';
    content: string;
    timestamp: number;
}
export declare abstract class BaseAgent {
    protected config: AgentConfig;
    protected memory: SharedMemory;
    protected logger: Logger;
    protected aborted: boolean;
    constructor(config: AgentConfig, memory: SharedMemory, logger: Logger);
    abstract execute(subtask: Subtask): AsyncGenerator<AgentProgress, SubtaskResult>;
    abort(): Promise<void>;
    protected shareDiscovery(taskId: string, type: 'file' | 'pattern' | 'insight' | 'discovery', data: unknown): Promise<void>;
    protected createProgress(type: AgentProgress['type'], content: string): AgentProgress;
    get id(): string;
    get type(): AgentType;
}
//# sourceMappingURL=base-agent.d.ts.map