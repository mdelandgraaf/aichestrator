import { AgentType, Subtask, SubtaskResult } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { Logger } from '../utils/logger.js';

export interface AgentConfig {
  id: string;
  type: AgentType;
  model: string;
  systemPrompt: string;
}

export interface AgentProgress {
  type: 'thinking' | 'tool_use' | 'text' | 'error' | 'complete' | 'file' | 'web';
  content: string;
  timestamp: number;
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected memory: SharedMemory;
  protected logger: Logger;
  protected aborted: boolean = false;

  constructor(config: AgentConfig, memory: SharedMemory, logger: Logger) {
    this.config = config;
    this.memory = memory;
    this.logger = logger;
  }

  abstract execute(subtask: Subtask): AsyncGenerator<AgentProgress, SubtaskResult>;

  async abort(): Promise<void> {
    this.aborted = true;
    this.logger.warn({ agentId: this.config.id }, 'Agent aborted');
  }

  protected async shareDiscovery(
    taskId: string,
    type: 'file' | 'pattern' | 'insight' | 'discovery',
    data: unknown
  ): Promise<void> {
    await this.memory.appendContext(taskId, {
      agentId: this.config.id,
      timestamp: Date.now(),
      type,
      data
    });
  }

  protected createProgress(type: AgentProgress['type'], content: string): AgentProgress {
    return {
      type,
      content,
      timestamp: Date.now()
    };
  }

  get id(): string {
    return this.config.id;
  }

  get type(): AgentType {
    return this.config.type;
  }
}
