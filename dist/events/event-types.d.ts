import { TaskStatus, SubtaskStatus, AgentStatus, AgentType } from '../config/schema.js';
export declare const EventTypes: {
    readonly TASK_CREATED: "task:created";
    readonly TASK_STARTED: "task:started";
    readonly TASK_PROGRESS: "task:progress";
    readonly TASK_COMPLETED: "task:completed";
    readonly TASK_FAILED: "task:failed";
    readonly TASK_CANCELLED: "task:cancelled";
    readonly SUBTASK_CREATED: "subtask:created";
    readonly SUBTASK_QUEUED: "subtask:queued";
    readonly SUBTASK_ASSIGNED: "subtask:assigned";
    readonly SUBTASK_STARTED: "subtask:started";
    readonly SUBTASK_PROGRESS: "subtask:progress";
    readonly SUBTASK_COMPLETED: "subtask:completed";
    readonly SUBTASK_FAILED: "subtask:failed";
    readonly SUBTASK_RETRYING: "subtask:retrying";
    readonly AGENT_REGISTERED: "agent:registered";
    readonly AGENT_HEARTBEAT: "agent:heartbeat";
    readonly AGENT_BUSY: "agent:busy";
    readonly AGENT_IDLE: "agent:idle";
    readonly AGENT_ERROR: "agent:error";
    readonly AGENT_OFFLINE: "agent:offline";
    readonly AGENT_REMOVED: "agent:removed";
    readonly DISCOVERY_SHARED: "discovery:shared";
    readonly SYSTEM_SHUTDOWN: "system:shutdown";
    readonly SYSTEM_ERROR: "system:error";
};
export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
export interface TaskCreatedEvent {
    type: typeof EventTypes.TASK_CREATED;
    taskId: string;
    description: string;
    projectPath: string;
    timestamp: number;
}
export interface TaskStartedEvent {
    type: typeof EventTypes.TASK_STARTED;
    taskId: string;
    subtaskCount: number;
    timestamp: number;
}
export interface TaskProgressEvent {
    type: typeof EventTypes.TASK_PROGRESS;
    taskId: string;
    status: TaskStatus;
    completed: number;
    total: number;
    timestamp: number;
}
export interface TaskCompletedEvent {
    type: typeof EventTypes.TASK_COMPLETED;
    taskId: string;
    success: boolean;
    duration: number;
    timestamp: number;
}
export interface TaskFailedEvent {
    type: typeof EventTypes.TASK_FAILED;
    taskId: string;
    error: string;
    timestamp: number;
}
export interface SubtaskCreatedEvent {
    type: typeof EventTypes.SUBTASK_CREATED;
    subtaskId: string;
    taskId: string;
    agentType: AgentType;
    timestamp: number;
}
export interface SubtaskAssignedEvent {
    type: typeof EventTypes.SUBTASK_ASSIGNED;
    subtaskId: string;
    taskId: string;
    agentId: string;
    timestamp: number;
}
export interface SubtaskProgressEvent {
    type: typeof EventTypes.SUBTASK_PROGRESS;
    subtaskId: string;
    taskId: string;
    status: SubtaskStatus;
    message?: string;
    timestamp: number;
}
export interface SubtaskCompletedEvent {
    type: typeof EventTypes.SUBTASK_COMPLETED;
    subtaskId: string;
    taskId: string;
    success: boolean;
    duration: number;
    timestamp: number;
}
export interface AgentRegisteredEvent {
    type: typeof EventTypes.AGENT_REGISTERED;
    agentId: string;
    agentType: AgentType;
    pid?: number;
    timestamp: number;
}
export interface AgentHeartbeatEvent {
    type: typeof EventTypes.AGENT_HEARTBEAT;
    agentId: string;
    status: AgentStatus;
    currentSubtaskId?: string;
    timestamp: number;
}
export interface AgentErrorEvent {
    type: typeof EventTypes.AGENT_ERROR;
    agentId: string;
    error: string;
    subtaskId?: string;
    timestamp: number;
}
export interface AgentOfflineEvent {
    type: typeof EventTypes.AGENT_OFFLINE;
    agentId: string;
    lastHeartbeat: number;
    timestamp: number;
}
export interface DiscoverySharedEvent {
    type: typeof EventTypes.DISCOVERY_SHARED;
    taskId: string;
    agentId: string;
    discoveryType: 'file' | 'pattern' | 'insight' | 'discovery';
    data: unknown;
    timestamp: number;
}
export interface SystemShutdownEvent {
    type: typeof EventTypes.SYSTEM_SHUTDOWN;
    reason: string;
    timestamp: number;
}
export interface SystemErrorEvent {
    type: typeof EventTypes.SYSTEM_ERROR;
    error: string;
    component: string;
    timestamp: number;
}
export type OrchestratorEvent = TaskCreatedEvent | TaskStartedEvent | TaskProgressEvent | TaskCompletedEvent | TaskFailedEvent | SubtaskCreatedEvent | SubtaskAssignedEvent | SubtaskProgressEvent | SubtaskCompletedEvent | AgentRegisteredEvent | AgentHeartbeatEvent | AgentErrorEvent | AgentOfflineEvent | DiscoverySharedEvent | SystemShutdownEvent | SystemErrorEvent;
export type EventHandler<T extends OrchestratorEvent = OrchestratorEvent> = (event: T) => void | Promise<void>;
//# sourceMappingURL=event-types.d.ts.map