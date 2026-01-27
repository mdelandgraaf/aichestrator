import { OrchestratorEvent, EventHandler } from './event-types.js';
import { TaskStatus } from '../config/schema.js';
export declare class EventBus {
    private publisher;
    private subscriber;
    private localEmitter;
    private logger;
    private _isConnected;
    private handlers;
    constructor(redisUrl: string);
    private setupSubscriber;
    private handleEvent;
    /**
     * Publish an event to all subscribers
     */
    emit<T extends OrchestratorEvent>(event: T): Promise<void>;
    /**
     * Subscribe to events of a specific type
     */
    on<T extends OrchestratorEvent>(eventType: T['type'], handler: EventHandler<T>): () => void;
    /**
     * Subscribe to events once
     */
    once<T extends OrchestratorEvent>(eventType: T['type'], handler: EventHandler<T>): void;
    /**
     * Wait for an event of a specific type
     */
    waitFor<T extends OrchestratorEvent>(eventType: T['type'], filter?: (event: T) => boolean, timeoutMs?: number): Promise<T>;
    emitTaskCreated(taskId: string, description: string, projectPath: string): Promise<void>;
    emitTaskStarted(taskId: string, subtaskCount: number): Promise<void>;
    emitTaskProgress(taskId: string, status: TaskStatus, completed: number, total: number): Promise<void>;
    emitTaskCompleted(taskId: string, success: boolean, duration: number): Promise<void>;
    emitTaskFailed(taskId: string, error: string): Promise<void>;
    emitSubtaskAssigned(subtaskId: string, taskId: string, agentId: string): Promise<void>;
    emitSubtaskCompleted(subtaskId: string, taskId: string, success: boolean, duration: number): Promise<void>;
    emitAgentHeartbeat(agentId: string, status: 'idle' | 'busy' | 'error' | 'offline', currentSubtaskId?: string): Promise<void>;
    emitAgentError(agentId: string, error: string, subtaskId?: string): Promise<void>;
    emitAgentOffline(agentId: string, lastHeartbeat: number): Promise<void>;
    emitDiscoveryShared(taskId: string, agentId: string, discoveryType: 'file' | 'pattern' | 'insight' | 'discovery', data: unknown): Promise<void>;
    emitSystemShutdown(reason: string): Promise<void>;
    /**
     * Check if the event bus is connected
     */
    isConnected(): boolean;
    /**
     * Close the event bus
     */
    close(): Promise<void>;
}
//# sourceMappingURL=event-bus.d.ts.map