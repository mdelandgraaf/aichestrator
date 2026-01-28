import { EventEmitter } from 'events';

const MAX_OUTPUT_LINES = 200;
const MAX_LOG_LINES = 100;

export type Panel = 'orchestrator' | 'subtasks' | 'agents';

export interface SubtaskState {
  id: string;
  description: string;
  agentType: string;
  status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed';
  dependencies: string[];
  assignedAgentId?: string;
}

export interface AgentState {
  id: string;
  subtaskId: string;
  subtaskDesc: string;
  agentType: string;
  status: 'queued' | 'executing' | 'completed' | 'failed';
  stage: string;
  startedAt: number;
  completedAt?: number;
  outputLines: string[];
  lastMessage: string;
}

export interface TUIState {
  phase: 'initializing' | 'decomposing' | 'executing' | 'aggregating' | 'done';
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;

  // Orchestrator log (decomposition reasoning, etc.)
  orchestratorLog: string[];

  // Subtasks created by decomposition
  subtasks: Map<string, SubtaskState>;
  subtaskOrder: string[];

  // Running agents
  agents: Map<string, AgentState>;
  agentOrder: string[];

  // Panel navigation
  activePanel: Panel;
  subtaskSelectedIndex: number;
  agentSelectedIndex: number;

  startTime: number;
  taskDescription: string;
  error?: string;
}

export class TUIStore extends EventEmitter {
  private state: TUIState;

  constructor(taskDescription: string) {
    super();
    this.state = {
      phase: 'initializing',
      totalSubtasks: 0,
      completedSubtasks: 0,
      failedSubtasks: 0,
      orchestratorLog: [],
      subtasks: new Map(),
      subtaskOrder: [],
      agents: new Map(),
      agentOrder: [],
      activePanel: 'subtasks',
      subtaskSelectedIndex: 0,
      agentSelectedIndex: 0,
      startTime: Date.now(),
      taskDescription
    };
  }

  getState(): Readonly<TUIState> {
    return this.state;
  }

  getSelectedAgent(): AgentState | undefined {
    const id = this.state.agentOrder[this.state.agentSelectedIndex];
    return id ? this.state.agents.get(id) : undefined;
  }

  getSelectedSubtask(): SubtaskState | undefined {
    const id = this.state.subtaskOrder[this.state.subtaskSelectedIndex];
    return id ? this.state.subtasks.get(id) : undefined;
  }

  // Panel navigation
  switchPanel(panel: Panel): void {
    this.state.activePanel = panel;
    this.changed();
  }

  nextPanel(): void {
    const panels: Panel[] = ['orchestrator', 'subtasks', 'agents'];
    const idx = panels.indexOf(this.state.activePanel);
    this.state.activePanel = panels[(idx + 1) % panels.length]!;
    this.changed();
  }

  prevPanel(): void {
    const panels: Panel[] = ['orchestrator', 'subtasks', 'agents'];
    const idx = panels.indexOf(this.state.activePanel);
    this.state.activePanel = panels[(idx - 1 + panels.length) % panels.length]!;
    this.changed();
  }

  // Orchestrator log
  addOrchestratorLog(message: string): void {
    this.state.orchestratorLog.push(message);
    if (this.state.orchestratorLog.length > MAX_LOG_LINES) {
      this.state.orchestratorLog.splice(0, this.state.orchestratorLog.length - MAX_LOG_LINES);
    }
    this.changed();
  }

  updatePhase(phase: TUIState['phase']): void {
    this.state.phase = phase;
    this.addOrchestratorLog(`Phase: ${phase}`);
  }

  setTotalSubtasks(count: number): void {
    this.state.totalSubtasks = count;
    this.changed();
  }

  setError(error: string): void {
    this.state.error = error;
    this.state.phase = 'done';
    this.addOrchestratorLog(`ERROR: ${error}`);
  }

  // Subtask management
  addSubtask(id: string, description: string, agentType: string, dependencies: string[]): void {
    const subtask: SubtaskState = {
      id,
      description,
      agentType,
      status: 'pending',
      dependencies
    };
    this.state.subtasks.set(id, subtask);
    if (!this.state.subtaskOrder.includes(id)) {
      this.state.subtaskOrder.push(id);
    }
    this.changed();
  }

  updateSubtaskStatus(subtaskId: string, status: SubtaskState['status'], agentId?: string): void {
    const subtask = this.state.subtasks.get(subtaskId);
    if (subtask) {
      subtask.status = status;
      if (agentId) {
        subtask.assignedAgentId = agentId;
      }
    }
    this.changed();
  }

  // Agent management
  addAgent(agentId: string, subtaskId: string, subtaskDesc: string, agentType: string): void {
    const agent: AgentState = {
      id: agentId,
      subtaskId,
      subtaskDesc,
      agentType,
      status: 'executing',
      stage: '',
      startedAt: Date.now(),
      outputLines: [],
      lastMessage: ''
    };
    this.state.agents.set(agentId, agent);
    if (!this.state.agentOrder.includes(agentId)) {
      this.state.agentOrder.push(agentId);
    }

    // Update subtask status
    this.updateSubtaskStatus(subtaskId, 'executing', agentId);
  }

  completeAgent(agentId: string, success: boolean): void {
    const agent = this.state.agents.get(agentId);
    if (agent) {
      agent.status = success ? 'completed' : 'failed';
      agent.completedAt = Date.now();
      if (success) {
        this.state.completedSubtasks++;
      } else {
        this.state.failedSubtasks++;
      }

      // Update subtask status
      this.updateSubtaskStatus(agent.subtaskId, success ? 'completed' : 'failed');
    }
    this.changed();
  }

  updateAgentProgress(agentId: string, stage: string, message: string): void {
    const agent = this.state.agents.get(agentId);
    if (!agent) return;

    agent.stage = stage;
    agent.lastMessage = message;

    if (message) {
      agent.outputLines.push(`[${stage}] ${message}`);
      if (agent.outputLines.length > MAX_OUTPUT_LINES) {
        agent.outputLines.splice(0, agent.outputLines.length - MAX_OUTPUT_LINES);
      }
    }
    this.changed();
  }

  // Selection within active panel
  moveSelection(delta: number): void {
    if (this.state.activePanel === 'subtasks') {
      const len = this.state.subtaskOrder.length;
      if (len === 0) return;
      this.state.subtaskSelectedIndex = Math.max(0, Math.min(len - 1, this.state.subtaskSelectedIndex + delta));
    } else if (this.state.activePanel === 'agents') {
      const len = this.state.agentOrder.length;
      if (len === 0) return;
      this.state.agentSelectedIndex = Math.max(0, Math.min(len - 1, this.state.agentSelectedIndex + delta));
    }
    // orchestrator panel has no selection (just scrolling log)
    this.changed();
  }

  private changed(): void {
    this.emit('change');
  }
}
