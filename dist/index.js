/**
 * AIChestrator - Multi-agent AI orchestrator for parallel task execution
 *
 * This module exports the main classes and types for programmatic use.
 * For CLI usage, see cli.ts
 */
// Core orchestrator
export { Orchestrator } from './orchestrator/orchestrator.js';
export { TaskDecomposer } from './orchestrator/decomposer.js';
export { HealthMonitor } from './orchestrator/health-monitor.js';
export { ResultAggregator } from './orchestrator/aggregator.js';
// Agents
export { BaseAgent } from './agents/base-agent.js';
export { WorkerAgent, createWorkerAgent } from './agents/worker-agent.js';
// Workers
export { WorkerPool } from './workers/worker-pool.js';
// Tasks
export { TaskQueue } from './tasks/task-queue.js';
export { TaskManager } from './tasks/task-manager.js';
export { ParallelStrategy, HierarchicalStrategy, createStrategy } from './tasks/strategies/index.js';
// Events
export { EventBus } from './events/event-bus.js';
export { EventTypes } from './events/event-types.js';
// Memory
export { SharedMemory, KEYS, CHANNELS } from './memory/shared-memory.js';
export { RedisClient } from './memory/redis-client.js';
// Config and types
export { loadConfig } from './config/index.js';
// Utilities
export { createLogger } from './utils/logger.js';
export { AIChestError, TaskError, SubtaskError, AgentError, TimeoutError, RedisError } from './utils/errors.js';
//# sourceMappingURL=index.js.map