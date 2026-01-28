import { TUIStore } from './store.js';
export declare class TUIRenderer {
    private store;
    private timer;
    private lastRender;
    private renderQueued;
    constructor(store: TUIStore);
    start(): void;
    stop(): void;
    private queueRender;
    private render;
    private drawPanel;
    private drawSubtasksPanel;
    private drawAgentsPanel;
}
//# sourceMappingURL=renderer.d.ts.map