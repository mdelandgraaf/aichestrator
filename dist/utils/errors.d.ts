export declare class AIChestError extends Error {
    code: string;
    cause?: unknown | undefined;
    constructor(message: string, code: string, cause?: unknown | undefined);
}
export declare class TaskError extends AIChestError {
    taskId: string;
    constructor(message: string, taskId: string, cause?: unknown);
}
export declare class SubtaskError extends AIChestError {
    subtaskId: string;
    parentTaskId: string;
    constructor(message: string, subtaskId: string, parentTaskId: string, cause?: unknown);
}
export declare class AgentError extends AIChestError {
    agentId: string;
    constructor(message: string, agentId: string, cause?: unknown);
}
export declare class TimeoutError extends AIChestError {
    timeoutMs: number;
    constructor(message: string, timeoutMs: number);
}
export declare class RedisError extends AIChestError {
    constructor(message: string, cause?: unknown);
}
//# sourceMappingURL=errors.d.ts.map