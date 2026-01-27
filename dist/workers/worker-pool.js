import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class WorkerPool extends EventEmitter {
    workers = new Map();
    idleWorkers = [];
    pendingTasks = [];
    config;
    memory;
    eventBus;
    logger;
    isShuttingDown = false;
    healthCheckInterval = null;
    constructor(config, memory, eventBus) {
        super();
        this.config = config;
        this.memory = memory;
        this.eventBus = eventBus;
        this.logger = createLogger('worker-pool');
        this.startHealthCheck();
    }
    /**
     * Initialize the worker pool with minimum workers
     */
    async initialize(minWorkers = 0) {
        this.logger.info({ minWorkers }, 'Initializing worker pool');
        for (let i = 0; i < minWorkers; i++) {
            await this.spawnWorker();
        }
    }
    /**
     * Execute a subtask using an available worker
     */
    async execute(subtask, taskId) {
        if (this.isShuttingDown) {
            throw new Error('Worker pool is shutting down');
        }
        return new Promise((resolve, reject) => {
            // Try to get an idle worker
            const workerId = this.idleWorkers.shift();
            if (workerId) {
                const worker = this.workers.get(workerId);
                if (worker && worker.status === 'idle') {
                    this.assignTask(worker, subtask, taskId, resolve, reject);
                    return;
                }
            }
            // No idle workers available
            if (this.workers.size < this.config.maxWorkers) {
                // Spawn a new worker
                this.spawnWorker().then((worker) => {
                    this.assignTask(worker, subtask, taskId, resolve, reject);
                }).catch(reject);
            }
            else {
                // Queue the task
                this.pendingTasks.push({ subtask, taskId, resolve, reject });
                this.logger.debug({ subtaskId: subtask.id, queueLength: this.pendingTasks.length }, 'Task queued');
            }
        });
    }
    /**
     * Execute multiple subtasks in parallel
     */
    async executeAll(items) {
        const promises = items.map((item) => this.execute(item.subtask, item.taskId));
        return Promise.all(promises);
    }
    async spawnWorker() {
        const workerId = nanoid();
        this.logger.debug({ workerId }, 'Spawning worker');
        const workerPath = join(__dirname, 'worker-process.js');
        const child = fork(workerPath, [], {
            env: {
                ...process.env,
                WORKER_ID: workerId,
                REDIS_URL: this.config.redisUrl,
                ANTHROPIC_API_KEY: this.config.apiKey,
                ANTHROPIC_MODEL: this.config.model,
                TIMEOUT_MS: String(this.config.workerTimeoutMs),
                HEARTBEAT_INTERVAL_MS: String(this.config.heartbeatIntervalMs)
            },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });
        const worker = {
            id: workerId,
            process: child,
            status: 'idle',
            createdAt: Date.now(),
            lastActivityAt: Date.now()
        };
        this.workers.set(workerId, worker);
        this.setupWorkerHandlers(worker);
        // Wait for worker to be ready
        await this.waitForWorkerReady(worker);
        this.idleWorkers.push(workerId);
        this.logger.info({ workerId }, 'Worker spawned and ready');
        return worker;
    }
    setupWorkerHandlers(worker) {
        const { process: child, id: workerId } = worker;
        // Handle IPC messages
        child.on('message', (msg) => {
            worker.lastActivityAt = Date.now();
            switch (msg.type) {
                case 'ready':
                    this.logger.debug({ workerId }, 'Worker ready');
                    break;
                case 'heartbeat':
                    this.handleHeartbeat(worker, msg);
                    break;
                case 'progress':
                    this.handleProgress(worker, msg);
                    break;
                case 'result':
                    this.handleResult(worker, msg);
                    break;
                case 'discovery':
                    this.handleDiscovery(worker, msg);
                    break;
                case 'error':
                    this.handleWorkerError(worker, msg);
                    break;
            }
        });
        // Handle stdout/stderr
        child.stdout?.on('data', (data) => {
            this.logger.debug({ workerId }, data.toString().trim());
        });
        child.stderr?.on('data', (data) => {
            this.logger.error({ workerId }, data.toString().trim());
        });
        // Handle exit
        child.on('exit', (code, signal) => {
            this.handleWorkerExit(worker, code, signal);
        });
        // Handle error
        child.on('error', (error) => {
            this.logger.error({ workerId, error: error.message }, 'Worker error');
            worker.status = 'error';
        });
    }
    waitForWorkerReady(worker) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Worker ${worker.id} failed to become ready`));
            }, 10000);
            const handler = (msg) => {
                if (msg.type === 'ready' && msg.workerId === worker.id) {
                    clearTimeout(timeout);
                    worker.process.off('message', handler);
                    resolve();
                }
            };
            worker.process.on('message', handler);
        });
    }
    assignTask(worker, subtask, taskId, resolve, reject) {
        worker.status = 'busy';
        worker.currentSubtaskId = subtask.id;
        // Store the callbacks for this task
        worker._taskCallbacks = { resolve, reject };
        // Send execute command to worker
        const command = {
            type: 'execute',
            subtask,
            taskId
        };
        worker.process.send(command);
        this.logger.debug({ workerId: worker.id, subtaskId: subtask.id }, 'Task assigned to worker');
        // Emit event
        this.eventBus.emitSubtaskAssigned(subtask.id, taskId, worker.id);
    }
    handleHeartbeat(worker, _msg) {
        // Update memory with heartbeat
        this.memory.updateHeartbeat(worker.id).catch((error) => {
            this.logger.error({ workerId: worker.id, error: String(error) }, 'Failed to update heartbeat');
        });
    }
    handleProgress(worker, msg) {
        this.emit('progress', {
            workerId: worker.id,
            subtaskId: msg.subtaskId,
            data: msg.data
        });
    }
    handleResult(worker, msg) {
        const callbacks = worker._taskCallbacks;
        if (callbacks) {
            const result = msg.data;
            callbacks.resolve(result);
            delete worker._taskCallbacks;
        }
        // Return worker to idle pool
        this.returnWorkerToPool(worker);
    }
    handleDiscovery(worker, msg) {
        const { taskId, type, data } = msg.data;
        this.eventBus.emitDiscoveryShared(taskId, worker.id, type, data);
    }
    handleWorkerError(worker, msg) {
        const callbacks = worker._taskCallbacks;
        if (callbacks) {
            callbacks.reject(new Error(String(msg.data)));
            delete worker._taskCallbacks;
        }
        worker.status = 'error';
        this.eventBus.emitAgentError(worker.id, String(msg.data), msg.subtaskId);
        // Try to recover the worker
        this.recoverWorker(worker);
    }
    handleWorkerExit(worker, code, signal) {
        this.logger.warn({ workerId: worker.id, code, signal }, 'Worker exited');
        worker.status = 'dead';
        this.workers.delete(worker.id);
        // Remove from idle list if present
        const idleIndex = this.idleWorkers.indexOf(worker.id);
        if (idleIndex !== -1) {
            this.idleWorkers.splice(idleIndex, 1);
        }
        // Reject any pending task
        const callbacks = worker._taskCallbacks;
        if (callbacks) {
            callbacks.reject(new Error(`Worker ${worker.id} exited unexpectedly`));
        }
        // Spawn replacement if not shutting down
        if (!this.isShuttingDown && this.pendingTasks.length > 0) {
            this.spawnWorker().catch((error) => {
                this.logger.error({ error: String(error) }, 'Failed to spawn replacement worker');
            });
        }
    }
    returnWorkerToPool(worker) {
        worker.status = 'idle';
        worker.currentSubtaskId = undefined;
        // Check if there are pending tasks
        const pending = this.pendingTasks.shift();
        if (pending) {
            this.assignTask(worker, pending.subtask, pending.taskId, pending.resolve, pending.reject);
        }
        else {
            this.idleWorkers.push(worker.id);
        }
    }
    async recoverWorker(worker) {
        this.logger.info({ workerId: worker.id }, 'Attempting to recover worker');
        // Kill the problematic worker
        worker.process.kill('SIGTERM');
        this.workers.delete(worker.id);
        // Spawn a replacement
        try {
            await this.spawnWorker();
        }
        catch (error) {
            this.logger.error({ error: String(error) }, 'Failed to recover worker');
        }
    }
    startHealthCheck() {
        this.healthCheckInterval = setInterval(() => {
            this.checkWorkerHealth();
        }, this.config.heartbeatIntervalMs * 2);
    }
    checkWorkerHealth() {
        const now = Date.now();
        const timeout = this.config.heartbeatIntervalMs * 3;
        for (const [workerId, worker] of this.workers) {
            if (worker.status === 'busy') {
                const elapsed = now - worker.lastActivityAt;
                if (elapsed > timeout) {
                    this.logger.warn({ workerId, elapsed }, 'Worker appears stuck');
                    // Abort the current task
                    const command = { type: 'abort' };
                    worker.process.send(command);
                }
            }
        }
    }
    /**
     * Get pool statistics
     */
    getStats() {
        let busy = 0;
        for (const worker of this.workers.values()) {
            if (worker.status === 'busy')
                busy++;
        }
        return {
            total: this.workers.size,
            idle: this.idleWorkers.length,
            busy,
            pending: this.pendingTasks.length
        };
    }
    /**
     * Shutdown the worker pool
     */
    async shutdown() {
        this.isShuttingDown = true;
        this.logger.info('Shutting down worker pool');
        // Stop health check
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        // Reject all pending tasks
        for (const pending of this.pendingTasks) {
            pending.reject(new Error('Worker pool shutting down'));
        }
        this.pendingTasks = [];
        // Send shutdown command to all workers
        const shutdownPromises = [];
        for (const [, worker] of this.workers) {
            shutdownPromises.push(new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    worker.process.kill('SIGKILL');
                    resolve();
                }, 5000);
                worker.process.on('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                const command = { type: 'shutdown' };
                worker.process.send(command);
            }));
        }
        await Promise.all(shutdownPromises);
        this.workers.clear();
        this.idleWorkers = [];
        this.logger.info('Worker pool shutdown complete');
    }
}
//# sourceMappingURL=worker-pool.js.map