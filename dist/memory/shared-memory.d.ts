import { Task, TaskStatus, Subtask, SubtaskStatus, AgentEntry, AgentStatus, SharedContext, ContextEntry, SubtaskResult } from '../config/schema.js';
declare const KEYS: {
    task: (id: string) => string;
    taskSubtasks: (id: string) => string;
    taskProgress: (id: string) => string;
    taskContext: (id: string) => string;
    taskResults: (id: string) => string;
    subtask: (id: string) => string;
    agentRegistry: () => string;
    agentStatus: (id: string) => string;
    agentHeartbeat: (id: string) => string;
};
declare const CHANNELS: {
    taskCreated: string;
    taskProgress: string;
    taskCompleted: string;
    subtaskAssigned: string;
    subtaskCompleted: string;
    agentHeartbeat: string;
    agentError: string;
};
export declare class SharedMemory {
    private redis;
    private logger;
    constructor(redisUrl: string);
    createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
    getTask(taskId: string): Promise<Task | null>;
    updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void>;
    createSubtask(subtask: Omit<Subtask, 'id' | 'createdAt' | 'updatedAt' | 'attempts'>): Promise<Subtask>;
    getSubtask(subtaskId: string): Promise<Subtask | null>;
    getSubtasksForTask(taskId: string): Promise<Subtask[]>;
    updateSubtaskStatus(subtaskId: string, status: SubtaskStatus, updates?: {
        assignedAgentId?: string;
        error?: string;
        result?: unknown;
    }): Promise<void>;
    registerAgent(agent: Omit<AgentEntry, 'lastHeartbeat' | 'metrics'>): Promise<AgentEntry>;
    getAgent(agentId: string): Promise<AgentEntry | null>;
    getAllAgents(): Promise<AgentEntry[]>;
    updateAgentStatus(agentId: string, status: AgentStatus, currentSubtaskId?: string): Promise<void>;
    updateHeartbeat(agentId: string): Promise<void>;
    isAgentAlive(agentId: string): Promise<boolean>;
    removeAgent(agentId: string): Promise<void>;
    initContext(taskId: string, projectPath: string): Promise<SharedContext>;
    getContext(taskId: string): Promise<SharedContext | null>;
    appendContext(taskId: string, entry: ContextEntry): Promise<void>;
    storeResult(taskId: string, result: SubtaskResult): Promise<void>;
    getResults(taskId: string): Promise<SubtaskResult[]>;
    onTaskCreated(callback: (taskId: string) => void): Promise<void>;
    onTaskCompleted(callback: (taskId: string, status: TaskStatus) => void): Promise<void>;
    onSubtaskCompleted(callback: (subtaskId: string, status: SubtaskStatus) => void): Promise<void>;
    onAgentError(callback: (agentId: string, status: AgentStatus) => void): Promise<void>;
    ping(): Promise<boolean>;
    disconnect(): Promise<void>;
}
export { KEYS, CHANNELS };
//# sourceMappingURL=shared-memory.d.ts.map