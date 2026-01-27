export class AIChestError extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = 'AIChestError';
    }
}
export class TaskError extends AIChestError {
    taskId;
    constructor(message, taskId, cause) {
        super(message, 'TASK_ERROR', cause);
        this.taskId = taskId;
        this.name = 'TaskError';
    }
}
export class SubtaskError extends AIChestError {
    subtaskId;
    parentTaskId;
    constructor(message, subtaskId, parentTaskId, cause) {
        super(message, 'SUBTASK_ERROR', cause);
        this.subtaskId = subtaskId;
        this.parentTaskId = parentTaskId;
        this.name = 'SubtaskError';
    }
}
export class AgentError extends AIChestError {
    agentId;
    constructor(message, agentId, cause) {
        super(message, 'AGENT_ERROR', cause);
        this.agentId = agentId;
        this.name = 'AgentError';
    }
}
export class TimeoutError extends AIChestError {
    timeoutMs;
    constructor(message, timeoutMs) {
        super(message, 'TIMEOUT_ERROR');
        this.timeoutMs = timeoutMs;
        this.name = 'TimeoutError';
    }
}
export class RedisError extends AIChestError {
    constructor(message, cause) {
        super(message, 'REDIS_ERROR', cause);
        this.name = 'RedisError';
    }
}
//# sourceMappingURL=errors.js.map