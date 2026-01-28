import { Orchestrator } from './bridge.js';
export interface TUIOptions {
    taskDescription: string;
}
export interface TUIHandle {
    waitForExit(): Promise<void>;
}
export declare function launchTUI(orchestrator: Orchestrator, opts: TUIOptions): TUIHandle;
export { TUIStore } from './store.js';
export { TUIRenderer } from './renderer.js';
export { TUIInput } from './input.js';
//# sourceMappingURL=index.d.ts.map