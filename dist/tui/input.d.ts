import { TUIStore } from './store.js';
export interface TUIInputCallbacks {
    onQuit: () => void;
    onCancelAgent: (agentId: string) => void;
}
export declare class TUIInput {
    private store;
    private callbacks;
    constructor(store: TUIStore, callbacks: TUIInputCallbacks);
    start(): void;
    stop(): void;
    private handleKey;
    private cancelSelectedAgent;
}
//# sourceMappingURL=input.d.ts.map