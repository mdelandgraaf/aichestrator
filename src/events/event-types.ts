import { TaskStatus, SubtaskStatus, AgentStatus, AgentType } from '../config/schema.js';

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
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

// Event payload types
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

// Union type of all events
export type OrchestratorEvent =
  | TaskCreatedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | SubtaskCreatedEvent
  | SubtaskAssignedEvent
  | SubtaskProgressEvent
  | SubtaskCompletedEvent
  | AgentRegisteredEvent
  | AgentHeartbeatEvent
  | AgentErrorEvent
  | AgentOfflineEvent
  | DiscoverySharedEvent
  | SystemShutdownEvent
  | SystemErrorEvent;

// Event handler type
export type EventHandler<T extends OrchestratorEvent = OrchestratorEvent> = (
  event: T
) => void | Promise<void>;
