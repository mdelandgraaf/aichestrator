import { EventEmitter } from 'events';
const MAX_OUTPUT_LINES = 200;
const MAX_LOG_LINES = 100;
export class TUIStore extends EventEmitter {
    state;
    constructor(taskDescription) {
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
    getState() {
        return this.state;
    }
    getSelectedAgent() {
        const id = this.state.agentOrder[this.state.agentSelectedIndex];
        return id ? this.state.agents.get(id) : undefined;
    }
    getSelectedSubtask() {
        const id = this.state.subtaskOrder[this.state.subtaskSelectedIndex];
        return id ? this.state.subtasks.get(id) : undefined;
    }
    // Panel navigation
    switchPanel(panel) {
        this.state.activePanel = panel;
        this.changed();
    }
    nextPanel() {
        const panels = ['orchestrator', 'subtasks', 'agents'];
        const idx = panels.indexOf(this.state.activePanel);
        this.state.activePanel = panels[(idx + 1) % panels.length];
        this.changed();
    }
    prevPanel() {
        const panels = ['orchestrator', 'subtasks', 'agents'];
        const idx = panels.indexOf(this.state.activePanel);
        this.state.activePanel = panels[(idx - 1 + panels.length) % panels.length];
        this.changed();
    }
    // Orchestrator log
    addOrchestratorLog(message) {
        this.state.orchestratorLog.push(message);
        if (this.state.orchestratorLog.length > MAX_LOG_LINES) {
            this.state.orchestratorLog.splice(0, this.state.orchestratorLog.length - MAX_LOG_LINES);
        }
        this.changed();
    }
    updatePhase(phase) {
        this.state.phase = phase;
        this.addOrchestratorLog(`Phase: ${phase}`);
    }
    setTotalSubtasks(count) {
        this.state.totalSubtasks = count;
        this.changed();
    }
    setError(error) {
        this.state.error = error;
        this.state.phase = 'done';
        this.addOrchestratorLog(`ERROR: ${error}`);
    }
    // Subtask management
    addSubtask(id, description, agentType, dependencies) {
        const subtask = {
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
    updateSubtaskStatus(subtaskId, status, agentId) {
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
    addAgent(agentId, subtaskId, subtaskDesc, agentType) {
        const agent = {
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
    completeAgent(agentId, success) {
        const agent = this.state.agents.get(agentId);
        if (agent) {
            agent.status = success ? 'completed' : 'failed';
            agent.completedAt = Date.now();
            if (success) {
                this.state.completedSubtasks++;
            }
            else {
                this.state.failedSubtasks++;
            }
            // Update subtask status
            this.updateSubtaskStatus(agent.subtaskId, success ? 'completed' : 'failed');
        }
        this.changed();
    }
    updateAgentProgress(agentId, stage, message) {
        const agent = this.state.agents.get(agentId);
        if (!agent)
            return;
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
    moveSelection(delta) {
        if (this.state.activePanel === 'subtasks') {
            const len = this.state.subtaskOrder.length;
            if (len === 0)
                return;
            this.state.subtaskSelectedIndex = Math.max(0, Math.min(len - 1, this.state.subtaskSelectedIndex + delta));
        }
        else if (this.state.activePanel === 'agents') {
            const len = this.state.agentOrder.length;
            if (len === 0)
                return;
            this.state.agentSelectedIndex = Math.max(0, Math.min(len - 1, this.state.agentSelectedIndex + delta));
        }
        // orchestrator panel has no selection (just scrolling log)
        this.changed();
    }
    changed() {
        this.emit('change');
    }
}
//# sourceMappingURL=store.js.map