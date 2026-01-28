import { TUIStore } from './store.js';

export interface TUIInputCallbacks {
  onQuit: () => void;
  onCancelAgent: (agentId: string) => void;
}

export class TUIInput {
  private store: TUIStore;
  private callbacks: TUIInputCallbacks;

  constructor(store: TUIStore, callbacks: TUIInputCallbacks) {
    this.store = store;
    this.callbacks = callbacks;
  }

  start(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => this.handleKey(key));
  }

  stop(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  private handleKey(key: string): void {
    // Ctrl+C
    if (key === '\x03') {
      this.callbacks.onQuit();
      return;
    }

    // q - quit
    if (key === 'q' || key === 'Q') {
      this.callbacks.onQuit();
      return;
    }

    // x or Delete - cancel selected agent
    if (key === 'x' || key === 'X' || key === '\x7f' || key === '\x1b[3~') {
      this.cancelSelectedAgent();
      return;
    }

    // Arrow up / k - move selection up
    if (key === '\x1b[A' || key === 'k') {
      this.store.moveSelection(-1);
      return;
    }

    // Arrow down / j - move selection down
    if (key === '\x1b[B' || key === 'j') {
      this.store.moveSelection(1);
      return;
    }

    // Arrow right / l / Tab - next panel
    if (key === '\x1b[C' || key === 'l' || key === '\t') {
      this.store.nextPanel();
      return;
    }

    // Arrow left / h / Shift+Tab - previous panel
    if (key === '\x1b[D' || key === 'h' || key === '\x1b[Z') {
      this.store.prevPanel();
      return;
    }

    // 1, 2, 3 - switch to specific panel
    if (key === '1') {
      this.store.switchPanel('orchestrator');
      return;
    }
    if (key === '2') {
      this.store.switchPanel('subtasks');
      return;
    }
    if (key === '3') {
      this.store.switchPanel('agents');
      return;
    }
  }

  private cancelSelectedAgent(): void {
    const state = this.store.getState();
    let agentId: string | undefined;

    if (state.activePanel === 'agents') {
      const agent = this.store.getSelectedAgent();
      if (agent && agent.status === 'executing') {
        agentId = agent.id;
      }
    } else if (state.activePanel === 'subtasks') {
      const subtask = this.store.getSelectedSubtask();
      if (subtask?.assignedAgentId) {
        const agent = state.agents.get(subtask.assignedAgentId);
        if (agent && agent.status === 'executing') {
          agentId = agent.id;
        }
      }
    }

    if (agentId) {
      this.callbacks.onCancelAgent(agentId);
      this.store.addOrchestratorLog(`Cancelling agent ${agentId.substring(0, 8)}...`);
    }
  }
}
