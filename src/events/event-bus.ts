import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { createLogger, Logger } from '../utils/logger.js';
import {
  EventType,
  EventTypes,
  OrchestratorEvent,
  EventHandler
} from './event-types.js';
import { TaskStatus } from '../config/schema.js';

const CHANNEL_PREFIX = 'aichestrator:events';

export class EventBus {
  private publisher: Redis;
  private subscriber: Redis;
  private localEmitter: EventEmitter;
  private logger: Logger;
  private _isConnected: boolean = false;
  private handlers: Map<EventType, Set<EventHandler>> = new Map();

  constructor(redisUrl: string) {
    this.logger = createLogger('event-bus');
    this.localEmitter = new EventEmitter();
    this.localEmitter.setMaxListeners(100);

    this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.setupSubscriber();
  }

  private setupSubscriber(): void {
    this.subscriber.on('connect', () => {
      this._isConnected = true;
      this.logger.info('Event bus connected');
    });

    this.subscriber.on('error', (err: Error) => {
      this.logger.error({ err }, 'Subscriber error');
    });

    // Subscribe to all event channels
    this.subscriber.psubscribe(`${CHANNEL_PREFIX}:*`);

    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as OrchestratorEvent;
        this.handleEvent(event);
      } catch (error) {
        this.logger.error({ channel, error: String(error) }, 'Failed to parse event');
      }
    });
  }

  private handleEvent(event: OrchestratorEvent): void {
    const handlers = this.handlers.get(event.type as EventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result instanceof Promise) {
            result.catch((error) => {
              this.logger.error(
                { eventType: event.type, error: String(error) },
                'Event handler error'
              );
            });
          }
        } catch (error) {
          this.logger.error(
            { eventType: event.type, error: String(error) },
            'Event handler error'
          );
        }
      }
    }

    // Also emit locally for synchronous handlers
    this.localEmitter.emit(event.type, event);
  }

  /**
   * Publish an event to all subscribers
   */
  async emit<T extends OrchestratorEvent>(event: T): Promise<void> {
    const channel = `${CHANNEL_PREFIX}:${event.type}`;
    const message = JSON.stringify(event);

    await this.publisher.publish(channel, message);
    this.logger.debug({ type: event.type }, 'Event emitted');
  }

  /**
   * Subscribe to events of a specific type
   */
  on<T extends OrchestratorEvent>(
    eventType: T['type'],
    handler: EventHandler<T>
  ): () => void {
    if (!this.handlers.has(eventType as EventType)) {
      this.handlers.set(eventType as EventType, new Set());
    }

    this.handlers.get(eventType as EventType)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType as EventType)?.delete(handler as EventHandler);
    };
  }

  /**
   * Subscribe to events once
   */
  once<T extends OrchestratorEvent>(
    eventType: T['type'],
    handler: EventHandler<T>
  ): void {
    const wrappedHandler: EventHandler<T> = (event) => {
      this.handlers.get(eventType as EventType)?.delete(wrappedHandler as EventHandler);
      return handler(event);
    };

    this.on(eventType, wrappedHandler);
  }

  /**
   * Wait for an event of a specific type
   */
  waitFor<T extends OrchestratorEvent>(
    eventType: T['type'],
    filter?: (event: T) => boolean,
    timeoutMs: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeoutMs);

      const unsubscribe = this.on<T>(eventType, (event) => {
        if (!filter || filter(event)) {
          clearTimeout(timer);
          unsubscribe();
          resolve(event);
        }
      });
    });
  }

  // Convenience methods for common events

  async emitTaskCreated(taskId: string, description: string, projectPath: string): Promise<void> {
    await this.emit({
      type: EventTypes.TASK_CREATED,
      taskId,
      description,
      projectPath,
      timestamp: Date.now()
    });
  }

  async emitTaskStarted(taskId: string, subtaskCount: number): Promise<void> {
    await this.emit({
      type: EventTypes.TASK_STARTED,
      taskId,
      subtaskCount,
      timestamp: Date.now()
    });
  }

  async emitTaskProgress(
    taskId: string,
    status: TaskStatus,
    completed: number,
    total: number
  ): Promise<void> {
    await this.emit({
      type: EventTypes.TASK_PROGRESS,
      taskId,
      status,
      completed,
      total,
      timestamp: Date.now()
    });
  }

  async emitTaskCompleted(taskId: string, success: boolean, duration: number): Promise<void> {
    await this.emit({
      type: EventTypes.TASK_COMPLETED,
      taskId,
      success,
      duration,
      timestamp: Date.now()
    });
  }

  async emitTaskFailed(taskId: string, error: string): Promise<void> {
    await this.emit({
      type: EventTypes.TASK_FAILED,
      taskId,
      error,
      timestamp: Date.now()
    });
  }

  async emitSubtaskAssigned(subtaskId: string, taskId: string, agentId: string): Promise<void> {
    await this.emit({
      type: EventTypes.SUBTASK_ASSIGNED,
      subtaskId,
      taskId,
      agentId,
      timestamp: Date.now()
    });
  }

  async emitSubtaskCompleted(
    subtaskId: string,
    taskId: string,
    success: boolean,
    duration: number
  ): Promise<void> {
    await this.emit({
      type: EventTypes.SUBTASK_COMPLETED,
      subtaskId,
      taskId,
      success,
      duration,
      timestamp: Date.now()
    });
  }

  async emitAgentHeartbeat(
    agentId: string,
    status: 'idle' | 'busy' | 'error' | 'offline',
    currentSubtaskId?: string
  ): Promise<void> {
    await this.emit({
      type: EventTypes.AGENT_HEARTBEAT,
      agentId,
      status,
      currentSubtaskId,
      timestamp: Date.now()
    });
  }

  async emitAgentError(agentId: string, error: string, subtaskId?: string): Promise<void> {
    await this.emit({
      type: EventTypes.AGENT_ERROR,
      agentId,
      error,
      subtaskId,
      timestamp: Date.now()
    });
  }

  async emitAgentOffline(agentId: string, lastHeartbeat: number): Promise<void> {
    await this.emit({
      type: EventTypes.AGENT_OFFLINE,
      agentId,
      lastHeartbeat,
      timestamp: Date.now()
    });
  }

  async emitDiscoveryShared(
    taskId: string,
    agentId: string,
    discoveryType: 'file' | 'pattern' | 'insight' | 'discovery',
    data: unknown
  ): Promise<void> {
    await this.emit({
      type: EventTypes.DISCOVERY_SHARED,
      taskId,
      agentId,
      discoveryType,
      data,
      timestamp: Date.now()
    });
  }

  async emitSystemShutdown(reason: string): Promise<void> {
    await this.emit({
      type: EventTypes.SYSTEM_SHUTDOWN,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Check if the event bus is connected
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Close the event bus
   */
  async close(): Promise<void> {
    this._isConnected = false;
    this.handlers.clear();
    this.localEmitter.removeAllListeners();

    await this.subscriber.punsubscribe();
    await this.subscriber.quit();
    await this.publisher.quit();

    this.logger.info('Event bus closed');
  }
}
