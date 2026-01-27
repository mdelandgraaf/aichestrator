import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import { EventTypes } from './event-types.js';
const CHANNEL_PREFIX = 'aichestrator:events';
export class EventBus {
    publisher;
    subscriber;
    localEmitter;
    logger;
    _isConnected = false;
    handlers = new Map();
    constructor(redisUrl) {
        this.logger = createLogger('event-bus');
        this.localEmitter = new EventEmitter();
        this.localEmitter.setMaxListeners(100);
        this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
        this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
        this.setupSubscriber();
    }
    setupSubscriber() {
        this.subscriber.on('connect', () => {
            this._isConnected = true;
            this.logger.info('Event bus connected');
        });
        this.subscriber.on('error', (err) => {
            this.logger.error({ err }, 'Subscriber error');
        });
        // Subscribe to all event channels
        this.subscriber.psubscribe(`${CHANNEL_PREFIX}:*`);
        this.subscriber.on('pmessage', (_pattern, channel, message) => {
            try {
                const event = JSON.parse(message);
                this.handleEvent(event);
            }
            catch (error) {
                this.logger.error({ channel, error: String(error) }, 'Failed to parse event');
            }
        });
    }
    handleEvent(event) {
        const handlers = this.handlers.get(event.type);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    const result = handler(event);
                    if (result instanceof Promise) {
                        result.catch((error) => {
                            this.logger.error({ eventType: event.type, error: String(error) }, 'Event handler error');
                        });
                    }
                }
                catch (error) {
                    this.logger.error({ eventType: event.type, error: String(error) }, 'Event handler error');
                }
            }
        }
        // Also emit locally for synchronous handlers
        this.localEmitter.emit(event.type, event);
    }
    /**
     * Publish an event to all subscribers
     */
    async emit(event) {
        const channel = `${CHANNEL_PREFIX}:${event.type}`;
        const message = JSON.stringify(event);
        await this.publisher.publish(channel, message);
        this.logger.debug({ type: event.type }, 'Event emitted');
    }
    /**
     * Subscribe to events of a specific type
     */
    on(eventType, handler) {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Set());
        }
        this.handlers.get(eventType).add(handler);
        // Return unsubscribe function
        return () => {
            this.handlers.get(eventType)?.delete(handler);
        };
    }
    /**
     * Subscribe to events once
     */
    once(eventType, handler) {
        const wrappedHandler = (event) => {
            this.handlers.get(eventType)?.delete(wrappedHandler);
            return handler(event);
        };
        this.on(eventType, wrappedHandler);
    }
    /**
     * Wait for an event of a specific type
     */
    waitFor(eventType, filter, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                unsubscribe();
                reject(new Error(`Timeout waiting for event: ${eventType}`));
            }, timeoutMs);
            const unsubscribe = this.on(eventType, (event) => {
                if (!filter || filter(event)) {
                    clearTimeout(timer);
                    unsubscribe();
                    resolve(event);
                }
            });
        });
    }
    // Convenience methods for common events
    async emitTaskCreated(taskId, description, projectPath) {
        await this.emit({
            type: EventTypes.TASK_CREATED,
            taskId,
            description,
            projectPath,
            timestamp: Date.now()
        });
    }
    async emitTaskStarted(taskId, subtaskCount) {
        await this.emit({
            type: EventTypes.TASK_STARTED,
            taskId,
            subtaskCount,
            timestamp: Date.now()
        });
    }
    async emitTaskProgress(taskId, status, completed, total) {
        await this.emit({
            type: EventTypes.TASK_PROGRESS,
            taskId,
            status,
            completed,
            total,
            timestamp: Date.now()
        });
    }
    async emitTaskCompleted(taskId, success, duration) {
        await this.emit({
            type: EventTypes.TASK_COMPLETED,
            taskId,
            success,
            duration,
            timestamp: Date.now()
        });
    }
    async emitTaskFailed(taskId, error) {
        await this.emit({
            type: EventTypes.TASK_FAILED,
            taskId,
            error,
            timestamp: Date.now()
        });
    }
    async emitSubtaskAssigned(subtaskId, taskId, agentId) {
        await this.emit({
            type: EventTypes.SUBTASK_ASSIGNED,
            subtaskId,
            taskId,
            agentId,
            timestamp: Date.now()
        });
    }
    async emitSubtaskCompleted(subtaskId, taskId, success, duration) {
        await this.emit({
            type: EventTypes.SUBTASK_COMPLETED,
            subtaskId,
            taskId,
            success,
            duration,
            timestamp: Date.now()
        });
    }
    async emitAgentHeartbeat(agentId, status, currentSubtaskId) {
        await this.emit({
            type: EventTypes.AGENT_HEARTBEAT,
            agentId,
            status,
            currentSubtaskId,
            timestamp: Date.now()
        });
    }
    async emitAgentError(agentId, error, subtaskId) {
        await this.emit({
            type: EventTypes.AGENT_ERROR,
            agentId,
            error,
            subtaskId,
            timestamp: Date.now()
        });
    }
    async emitAgentOffline(agentId, lastHeartbeat) {
        await this.emit({
            type: EventTypes.AGENT_OFFLINE,
            agentId,
            lastHeartbeat,
            timestamp: Date.now()
        });
    }
    async emitDiscoveryShared(taskId, agentId, discoveryType, data) {
        await this.emit({
            type: EventTypes.DISCOVERY_SHARED,
            taskId,
            agentId,
            discoveryType,
            data,
            timestamp: Date.now()
        });
    }
    async emitSystemShutdown(reason) {
        await this.emit({
            type: EventTypes.SYSTEM_SHUTDOWN,
            reason,
            timestamp: Date.now()
        });
    }
    /**
     * Check if the event bus is connected
     */
    isConnected() {
        return this._isConnected;
    }
    /**
     * Close the event bus
     */
    async close() {
        this._isConnected = false;
        this.handlers.clear();
        this.localEmitter.removeAllListeners();
        await this.subscriber.punsubscribe();
        await this.subscriber.quit();
        await this.publisher.quit();
        this.logger.info('Event bus closed');
    }
}
//# sourceMappingURL=event-bus.js.map