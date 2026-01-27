// Event type definitions
export const EventTypes = {
    // Task lifecycle events
    TASK_CREATED: 'task:created',
    TASK_STARTED: 'task:started',
    TASK_PROGRESS: 'task:progress',
    TASK_COMPLETED: 'task:completed',
    TASK_FAILED: 'task:failed',
    TASK_CANCELLED: 'task:cancelled',
    // Subtask lifecycle events
    SUBTASK_CREATED: 'subtask:created',
    SUBTASK_QUEUED: 'subtask:queued',
    SUBTASK_ASSIGNED: 'subtask:assigned',
    SUBTASK_STARTED: 'subtask:started',
    SUBTASK_PROGRESS: 'subtask:progress',
    SUBTASK_COMPLETED: 'subtask:completed',
    SUBTASK_FAILED: 'subtask:failed',
    SUBTASK_RETRYING: 'subtask:retrying',
    // Agent lifecycle events
    AGENT_REGISTERED: 'agent:registered',
    AGENT_HEARTBEAT: 'agent:heartbeat',
    AGENT_BUSY: 'agent:busy',
    AGENT_IDLE: 'agent:idle',
    AGENT_ERROR: 'agent:error',
    AGENT_OFFLINE: 'agent:offline',
    AGENT_REMOVED: 'agent:removed',
    // Discovery events (agent collaboration)
    DISCOVERY_SHARED: 'discovery:shared',
    // System events
    SYSTEM_SHUTDOWN: 'system:shutdown',
    SYSTEM_ERROR: 'system:error'
};
//# sourceMappingURL=event-types.js.map