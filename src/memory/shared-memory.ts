import { nanoid } from 'nanoid';
import { RedisClient } from './redis-client.js';
import { createLogger, Logger } from '../utils/logger.js';
import {
  Task,
  TaskSchema,
  TaskStatus,
  Subtask,
  SubtaskSchema,
  SubtaskStatus,
  AgentEntry,
  AgentEntrySchema,
  AgentStatus,
  SharedContext,
  SharedContextSchema,
  ContextEntry,
  SubtaskResult
} from '../config/schema.js';

const KEYS = {
  task: (id: string) => `aichestrator:tasks:${id}:meta`,
  taskSubtasks: (id: string) => `aichestrator:tasks:${id}:subtasks`,
  taskProgress: (id: string) => `aichestrator:tasks:${id}:progress`,
  taskContext: (id: string) => `aichestrator:tasks:${id}:context`,
  taskResults: (id: string) => `aichestrator:tasks:${id}:results`,
  subtask: (id: string) => `aichestrator:subtasks:${id}`,
  agentRegistry: () => `aichestrator:agents:registry`,
  agentStatus: (id: string) => `aichestrator:agents:${id}:status`,
  agentHeartbeat: (id: string) => `aichestrator:agents:${id}:heartbeat`
};

const CHANNELS = {
  taskCreated: 'aichestrator:tasks:created',
  taskProgress: 'aichestrator:tasks:progress',
  taskCompleted: 'aichestrator:tasks:completed',
  subtaskAssigned: 'aichestrator:subtasks:assigned',
  subtaskCompleted: 'aichestrator:subtasks:completed',
  agentHeartbeat: 'aichestrator:agents:heartbeat',
  agentError: 'aichestrator:agents:error'
};

export class SharedMemory {
  private redis: RedisClient;
  private logger: Logger;

  constructor(redisUrl: string) {
    this.redis = new RedisClient(redisUrl);
    this.logger = createLogger('shared-memory');
  }

  // === Task Operations ===

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const now = Date.now();
    const fullTask: Task = {
      ...task,
      id: nanoid(),
      createdAt: now,
      updatedAt: now
    };

    const validated = TaskSchema.parse(fullTask);
    await this.redis.set(KEYS.task(validated.id), JSON.stringify(validated));
    await this.redis.publish(CHANNELS.taskCreated, JSON.stringify({ taskId: validated.id }));

    this.logger.info({ taskId: validated.id }, 'Task created');
    return validated;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const data = await this.redis.get(KEYS.task(taskId));
    if (!data) return null;
    return TaskSchema.parse(JSON.parse(data));
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = status;
    task.updatedAt = Date.now();
    if (error) task.error = error;

    await this.redis.set(KEYS.task(taskId), JSON.stringify(task));

    if (status === 'completed' || status === 'failed') {
      await this.redis.publish(CHANNELS.taskCompleted, JSON.stringify({ taskId, status }));
    } else {
      await this.redis.publish(CHANNELS.taskProgress, JSON.stringify({ taskId, status }));
    }

    this.logger.info({ taskId, status }, 'Task status updated');
  }

  // === Subtask Operations ===

  async createSubtask(subtask: Omit<Subtask, 'id' | 'createdAt' | 'updatedAt' | 'attempts'>): Promise<Subtask> {
    const now = Date.now();
    const fullSubtask: Subtask = {
      ...subtask,
      id: nanoid(),
      attempts: 0,
      createdAt: now,
      updatedAt: now
    };

    const validated = SubtaskSchema.parse(fullSubtask);
    await this.redis.set(KEYS.subtask(validated.id), JSON.stringify(validated));
    await this.redis.rpush(KEYS.taskSubtasks(validated.parentTaskId), validated.id);

    this.logger.debug({ subtaskId: validated.id, parentTaskId: validated.parentTaskId }, 'Subtask created');
    return validated;
  }

  async getSubtask(subtaskId: string): Promise<Subtask | null> {
    const data = await this.redis.get(KEYS.subtask(subtaskId));
    if (!data) return null;
    return SubtaskSchema.parse(JSON.parse(data));
  }

  async getSubtasksForTask(taskId: string): Promise<Subtask[]> {
    const subtaskIds = await this.redis.lrange(KEYS.taskSubtasks(taskId), 0, -1);
    const subtasks: Subtask[] = [];

    for (const id of subtaskIds) {
      const subtask = await this.getSubtask(id);
      if (subtask) subtasks.push(subtask);
    }

    return subtasks;
  }

  async updateSubtaskStatus(
    subtaskId: string,
    status: SubtaskStatus,
    updates?: { assignedAgentId?: string; error?: string; result?: unknown }
  ): Promise<void> {
    const subtask = await this.getSubtask(subtaskId);
    if (!subtask) throw new Error(`Subtask not found: ${subtaskId}`);

    subtask.status = status;
    subtask.updatedAt = Date.now();

    if (updates?.assignedAgentId) subtask.assignedAgentId = updates.assignedAgentId;
    if (updates?.error) subtask.error = updates.error;
    if (updates?.result !== undefined) subtask.result = updates.result;
    if (status === 'executing') subtask.attempts += 1;

    await this.redis.set(KEYS.subtask(subtaskId), JSON.stringify(subtask));

    if (status === 'assigned') {
      await this.redis.publish(CHANNELS.subtaskAssigned, JSON.stringify({ subtaskId }));
    } else if (status === 'completed' || status === 'failed') {
      await this.redis.publish(CHANNELS.subtaskCompleted, JSON.stringify({ subtaskId, status }));
    }

    this.logger.debug({ subtaskId, status }, 'Subtask status updated');
  }

  // === Agent Registry ===

  async registerAgent(agent: Omit<AgentEntry, 'lastHeartbeat' | 'metrics'>): Promise<AgentEntry> {
    const fullAgent: AgentEntry = {
      ...agent,
      lastHeartbeat: Date.now(),
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        avgExecutionMs: 0
      }
    };

    const validated = AgentEntrySchema.parse(fullAgent);
    await this.redis.hset(KEYS.agentRegistry(), validated.id, JSON.stringify(validated));
    await this.updateHeartbeat(validated.id);

    this.logger.info({ agentId: validated.id, type: validated.type }, 'Agent registered');
    return validated;
  }

  async getAgent(agentId: string): Promise<AgentEntry | null> {
    const data = await this.redis.hget(KEYS.agentRegistry(), agentId);
    if (!data) return null;
    return AgentEntrySchema.parse(JSON.parse(data));
  }

  async getAllAgents(): Promise<AgentEntry[]> {
    const data = await this.redis.hgetall(KEYS.agentRegistry());
    return Object.values(data).map((d) => AgentEntrySchema.parse(JSON.parse(d)));
  }

  async updateAgentStatus(agentId: string, status: AgentStatus, currentSubtaskId?: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    agent.status = status;
    agent.currentSubtaskId = currentSubtaskId;

    await this.redis.hset(KEYS.agentRegistry(), agentId, JSON.stringify(agent));

    if (status === 'error' || status === 'offline') {
      await this.redis.publish(CHANNELS.agentError, JSON.stringify({ agentId, status }));
    }
  }

  async updateHeartbeat(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) return;

    agent.lastHeartbeat = Date.now();
    await this.redis.hset(KEYS.agentRegistry(), agentId, JSON.stringify(agent));
    await this.redis.set(KEYS.agentHeartbeat(agentId), 'alive', 15000); // 15s TTL
    await this.redis.publish(CHANNELS.agentHeartbeat, JSON.stringify({ agentId }));
  }

  async isAgentAlive(agentId: string): Promise<boolean> {
    return await this.redis.exists(KEYS.agentHeartbeat(agentId));
  }

  async removeAgent(agentId: string): Promise<void> {
    await this.redis.hdel(KEYS.agentRegistry(), agentId);
    await this.redis.del(KEYS.agentHeartbeat(agentId));
    this.logger.info({ agentId }, 'Agent removed');
  }

  // === Shared Context ===

  async initContext(taskId: string, projectPath: string): Promise<SharedContext> {
    const context: SharedContext = {
      taskId,
      projectPath,
      discoveries: []
    };

    await this.redis.set(KEYS.taskContext(taskId), JSON.stringify(context));
    return context;
  }

  async getContext(taskId: string): Promise<SharedContext | null> {
    const data = await this.redis.get(KEYS.taskContext(taskId));
    if (!data) return null;
    return SharedContextSchema.parse(JSON.parse(data));
  }

  async appendContext(taskId: string, entry: ContextEntry): Promise<void> {
    const context = await this.getContext(taskId);
    if (!context) throw new Error(`Context not found for task: ${taskId}`);

    context.discoveries.push(entry);
    await this.redis.set(KEYS.taskContext(taskId), JSON.stringify(context));

    this.logger.debug({ taskId, entryType: entry.type }, 'Context entry added');
  }

  // === Results ===

  async storeResult(taskId: string, result: SubtaskResult): Promise<void> {
    await this.redis.hset(KEYS.taskResults(taskId), result.subtaskId, JSON.stringify(result));
  }

  async getResults(taskId: string): Promise<SubtaskResult[]> {
    const data = await this.redis.hgetall(KEYS.taskResults(taskId));
    return Object.values(data).map((d) => JSON.parse(d) as SubtaskResult);
  }

  // === Subscriptions ===

  async onTaskCreated(callback: (taskId: string) => void): Promise<void> {
    await this.redis.subscribe(CHANNELS.taskCreated, (msg) => {
      const { taskId } = JSON.parse(msg);
      callback(taskId);
    });
  }

  async onTaskCompleted(callback: (taskId: string, status: TaskStatus) => void): Promise<void> {
    await this.redis.subscribe(CHANNELS.taskCompleted, (msg) => {
      const { taskId, status } = JSON.parse(msg);
      callback(taskId, status);
    });
  }

  async onSubtaskCompleted(callback: (subtaskId: string, status: SubtaskStatus) => void): Promise<void> {
    await this.redis.subscribe(CHANNELS.subtaskCompleted, (msg) => {
      const { subtaskId, status } = JSON.parse(msg);
      callback(subtaskId, status);
    });
  }

  async onAgentError(callback: (agentId: string, status: AgentStatus) => void): Promise<void> {
    await this.redis.subscribe(CHANNELS.agentError, (msg) => {
      const { agentId, status } = JSON.parse(msg);
      callback(agentId, status);
    });
  }

  // === Utility ===

  async ping(): Promise<boolean> {
    return await this.redis.ping();
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

export { KEYS, CHANNELS };
