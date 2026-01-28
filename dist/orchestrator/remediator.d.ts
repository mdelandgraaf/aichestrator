import { Subtask, SubtaskResult } from '../config/schema.js';
export interface RemediationDecision {
    action: 'retry' | 'decompose' | 'skip' | 'fail';
    reason: string;
    modifiedDescription?: string;
    newSubtasks?: Array<{
        description: string;
        agentType: string;
        dependencies: number[];
    }>;
}
export interface FailedSubtaskContext {
    subtask: Subtask;
    result: SubtaskResult;
    attemptNumber: number;
    maxAttempts: number;
    completedSubtasks: Subtask[];
    projectPath: string;
}
export declare class Remediator {
    private client;
    private model;
    private logger;
    constructor(apiKey: string, model: string);
    /**
     * Analyze a failed subtask and decide how to remediate
     */
    analyzeFailure(context: FailedSubtaskContext): Promise<RemediationDecision>;
    private buildSystemPrompt;
    private buildAnalysisPrompt;
    private parseDecision;
}
//# sourceMappingURL=remediator.d.ts.map