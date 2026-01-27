export class AIChestError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'AIChestError';
  }
}

export class TaskError extends AIChestError {
  constructor(message: string, public taskId: string, cause?: unknown) {
    super(message, 'TASK_ERROR', cause);
    this.name = 'TaskError';
  }
}

export class SubtaskError extends AIChestError {
  constructor(
    message: string,
    public subtaskId: string,
    public parentTaskId: string,
    cause?: unknown
  ) {
    super(message, 'SUBTASK_ERROR', cause);
    this.name = 'SubtaskError';
  }
}

export class AgentError extends AIChestError {
  constructor(message: string, public agentId: string, cause?: unknown) {
    super(message, 'AGENT_ERROR', cause);
    this.name = 'AgentError';
  }
}

export class TimeoutError extends AIChestError {
  constructor(message: string, public timeoutMs: number) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

export class RedisError extends AIChestError {
  constructor(message: string, cause?: unknown) {
    super(message, 'REDIS_ERROR', cause);
    this.name = 'RedisError';
  }
}
