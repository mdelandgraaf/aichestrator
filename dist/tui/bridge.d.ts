import type { EventBus } from '../events/event-bus.js';
import type { TUIStore } from './store.js';
export interface ProgressData {
    workerId?: string;
    subtaskId?: string;
    stage?: string;
    message?: string;
}
export interface SubtaskInfo {
    id: string;
    description: string;
    agentType: string;
    dependencies: string[];
}
export interface Orchestrator {
    getEventBus(): EventBus;
    onProgress(callback: (data: ProgressData) => void): void;
    getSubtasks(taskId: string): Promise<SubtaskInfo[]>;
    cancelWorker(workerId: string): boolean;
}
export declare function connectBridge(orchestrator: Orchestrator, store: TUIStore): void;
//# sourceMappingURL=bridge.d.ts.map