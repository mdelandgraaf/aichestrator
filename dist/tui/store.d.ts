import { EventEmitter } from 'events';
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
    orchestratorLog: string[];
    subtasks: Map<string, SubtaskState>;
    subtaskOrder: string[];
    agents: Map<string, AgentState>;
    agentOrder: string[];
    activePanel: Panel;
    subtaskSelectedIndex: number;
    agentSelectedIndex: number;
    startTime: number;
    taskDescription: string;
    error?: string;
}
export declare class TUIStore extends EventEmitter {
    private state;
    constructor(taskDescription: string);
    getState(): Readonly<TUIState>;
    getSelectedAgent(): AgentState | undefined;
    getSelectedSubtask(): SubtaskState | undefined;
    switchPanel(panel: Panel): void;
    nextPanel(): void;
    prevPanel(): void;
    addOrchestratorLog(message: string): void;
    updatePhase(phase: TUIState['phase']): void;
    setTotalSubtasks(count: number): void;
    setError(error: string): void;
    addSubtask(id: string, description: string, agentType: string, dependencies: string[]): void;
    updateSubtaskStatus(subtaskId: string, status: SubtaskState['status'], agentId?: string): void;
    addAgent(agentId: string, subtaskId: string, subtaskDesc: string, agentType: string): void;
    completeAgent(agentId: string, success: boolean): void;
    updateAgentProgress(agentId: string, stage: string, message: string): void;
    moveSelection(delta: number): void;
    private changed;
}
//# sourceMappingURL=store.d.ts.map