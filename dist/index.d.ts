/**
 * AIChestrator - Multi-agent AI orchestrator for parallel task execution
 *
 * This module exports the main classes and types for programmatic use.
 * For CLI usage, see cli.ts
 */
export { Orchestrator } from './orchestrator/orchestrator.js';
export { TaskDecomposer } from './orchestrator/decomposer.js';
export { HealthMonitor, HealthMonitorConfig, AgentHealth } from './orchestrator/health-monitor.js';
export { ResultAggregator, AggregatedResult } from './orchestrator/aggregator.js';
export { BaseAgent, AgentConfig, AgentProgress } from './agents/base-agent.js';
export { WorkerAgent, createWorkerAgent } from './agents/worker-agent.js';
export { WorkerPool, WorkerPoolConfig, WorkerMessage, WorkerCommand } from './workers/worker-pool.js';
export { TaskQueue, TaskQueueConfig, QueuedSubtask } from './tasks/task-queue.js';
export { TaskManager, TaskManagerConfig } from './tasks/task-manager.js';
export { DecompositionStrategy, DecompositionResult, ParallelStrategy, HierarchicalStrategy, createStrategy, StrategyType } from './tasks/strategies/index.js';
export { EventBus } from './events/event-bus.js';
export { EventTypes, EventType, OrchestratorEvent, EventHandler, TaskCreatedEvent, TaskCompletedEvent, SubtaskCompletedEvent, AgentHeartbeatEvent } from './events/event-types.js';
export { SharedMemory, KEYS, CHANNELS } from './memory/shared-memory.js';
export { RedisClient } from './memory/redis-client.js';
export { loadConfig, Config, Task, TaskInput, TaskResult, TaskStatus, TaskType, Subtask, SubtaskResult, SubtaskStatus, AgentEntry, AgentType, AgentStatus, SharedContext, ContextEntry } from './config/index.js';
export { createLogger, Logger } from './utils/logger.js';
export { AIChestError, TaskError, SubtaskError, AgentError, TimeoutError, RedisError } from './utils/errors.js';
//# sourceMappingURL=index.d.ts.map