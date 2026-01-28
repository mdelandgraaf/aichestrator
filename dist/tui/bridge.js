import { EventTypes } from '../events/event-types.js';
export function connectBridge(orchestrator, store) {
    const bus = orchestrator.getEventBus();
    // Task started - fetch subtasks and populate the list
    bus.on(EventTypes.TASK_STARTED, (e) => {
        store.setTotalSubtasks(e.subtaskCount);
        store.updatePhase('executing');
        store.addOrchestratorLog(`Decomposed into ${e.subtaskCount} subtasks`);
        // Fetch subtasks and add them to the store
        orchestrator.getSubtasks(e.taskId).then((subtasks) => {
            for (const st of subtasks) {
                store.addSubtask(st.id, st.description, st.agentType, st.dependencies || []);
            }
        }).catch((err) => {
            store.addOrchestratorLog(`Error fetching subtasks: ${err}`);
        });
    });
    // Subtask assigned to an agent
    bus.on(EventTypes.SUBTASK_ASSIGNED, (e) => {
        store.addAgent(e.agentId, e.subtaskId, e.subtaskId, e.agentType || 'unknown');
        store.addOrchestratorLog(`Assigned ${e.subtaskId.substring(0, 8)} → agent ${e.agentId.substring(0, 8)}`);
    });
    // Subtask completed
    bus.on(EventTypes.SUBTASK_COMPLETED, (e) => {
        const state = store.getState();
        for (const [agentId, agent] of state.agents) {
            if (agent.subtaskId === e.subtaskId) {
                store.completeAgent(agentId, e.success);
                break;
            }
        }
        const status = e.success ? '✓' : '✗';
        store.addOrchestratorLog(`${status} Subtask ${e.subtaskId.substring(0, 8)} ${e.success ? 'completed' : 'failed'}`);
    });
    // Task completed
    bus.on(EventTypes.TASK_COMPLETED, (e) => {
        store.updatePhase('done');
        store.addOrchestratorLog(`Task completed (success: ${e.success})`);
    });
    // Task failed
    bus.on(EventTypes.TASK_FAILED, (e) => {
        store.setError(e.error);
    });
    // Task progress
    bus.on(EventTypes.TASK_PROGRESS, (e) => {
        store.addOrchestratorLog(`Progress: ${e.completed}/${e.total} subtasks`);
    });
    // Wire progress events from worker pool
    orchestrator.onProgress((data) => {
        if (data.workerId) {
            store.updateAgentProgress(data.workerId, data.stage || 'working', data.message || '');
        }
    });
}
//# sourceMappingURL=bridge.js.map