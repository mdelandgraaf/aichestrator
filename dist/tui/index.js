import { TUIStore } from './store.js';
import { TUIRenderer } from './renderer.js';
import { TUIInput } from './input.js';
import { connectBridge } from './bridge.js';
export function launchTUI(orchestrator, opts) {
    const store = new TUIStore(opts.taskDescription);
    const renderer = new TUIRenderer(store);
    let exitResolve;
    const exitPromise = new Promise((resolve) => {
        exitResolve = resolve;
    });
    function cleanup() {
        input.stop();
        renderer.stop();
        exitResolve();
    }
    const input = new TUIInput(store, {
        onQuit: () => cleanup(),
        onCancelAgent: (agentId) => {
            const success = orchestrator.cancelWorker(agentId);
            if (success) {
                store.addOrchestratorLog(`Cancel signal sent to agent ${agentId.substring(0, 8)}`);
            }
            else {
                store.addOrchestratorLog(`Failed to cancel agent ${agentId.substring(0, 8)}`);
            }
        }
    });
    // Stop TUI when task is done
    store.on('change', () => {
        const state = store.getState();
        if (state.phase === 'done') {
            // Give a moment for final render
            setTimeout(() => {
                cleanup();
                // Print summary
                const completed = state.completedSubtasks;
                const failed = state.failedSubtasks;
                const total = state.totalSubtasks;
                const elapsed = Math.round((Date.now() - state.startTime) / 1000);
                console.log(`\nCompleted: ${completed}/${total} subtasks (${failed} failed) in ${elapsed}s`);
                if (state.error) {
                    console.error(`Error: ${state.error}`);
                }
            }, 500);
        }
    });
    connectBridge(orchestrator, store);
    renderer.start();
    input.start();
    return { waitForExit: () => exitPromise };
}
export { TUIStore } from './store.js';
export { TUIRenderer } from './renderer.js';
export { TUIInput } from './input.js';
//# sourceMappingURL=index.js.map