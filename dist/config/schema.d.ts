import { z } from 'zod';
export declare const TaskTypeSchema: z.ZodEnum<["feature", "bugfix", "refactor", "research"]>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export declare const TaskStatusSchema: z.ZodEnum<["pending", "decomposing", "executing", "aggregating", "completed", "failed", "cancelled"]>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export declare const SubtaskStatusSchema: z.ZodEnum<["pending", "blocked", "queued", "assigned", "executing", "completed", "failed"]>;
export type SubtaskStatus = z.infer<typeof SubtaskStatusSchema>;
export declare const AgentTypeSchema: z.ZodEnum<["researcher", "implementer", "reviewer", "tester", "documenter"]>;
export type AgentType = z.infer<typeof AgentTypeSchema>;
export declare const AgentStatusSchema: z.ZodEnum<["idle", "busy", "error", "offline"]>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export declare const TaskConstraintsSchema: z.ZodObject<{
    maxAgents: z.ZodDefault<z.ZodNumber>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
    allowedTools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    maxAgents: number;
    timeoutMs: number;
    allowedTools?: string[] | undefined;
}, {
    maxAgents?: number | undefined;
    timeoutMs?: number | undefined;
    allowedTools?: string[] | undefined;
}>;
export type TaskConstraints = z.infer<typeof TaskConstraintsSchema>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    projectPath: z.ZodString;
    type: z.ZodEnum<["feature", "bugfix", "refactor", "research"]>;
    status: z.ZodEnum<["pending", "decomposing", "executing", "aggregating", "completed", "failed", "cancelled"]>;
    constraints: z.ZodObject<{
        maxAgents: z.ZodDefault<z.ZodNumber>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
        allowedTools: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        maxAgents: number;
        timeoutMs: number;
        allowedTools?: string[] | undefined;
    }, {
        maxAgents?: number | undefined;
        timeoutMs?: number | undefined;
        allowedTools?: string[] | undefined;
    }>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "feature" | "bugfix" | "refactor" | "research";
    status: "pending" | "decomposing" | "executing" | "aggregating" | "completed" | "failed" | "cancelled";
    id: string;
    description: string;
    projectPath: string;
    constraints: {
        maxAgents: number;
        timeoutMs: number;
        allowedTools?: string[] | undefined;
    };
    createdAt: number;
    updatedAt: number;
    error?: string | undefined;
}, {
    type: "feature" | "bugfix" | "refactor" | "research";
    status: "pending" | "decomposing" | "executing" | "aggregating" | "completed" | "failed" | "cancelled";
    id: string;
    description: string;
    projectPath: string;
    constraints: {
        maxAgents?: number | undefined;
        timeoutMs?: number | undefined;
        allowedTools?: string[] | undefined;
    };
    createdAt: number;
    updatedAt: number;
    error?: string | undefined;
}>;
export type Task = z.infer<typeof TaskSchema>;
export declare const SubtaskSchema: z.ZodObject<{
    id: z.ZodString;
    parentTaskId: z.ZodString;
    description: z.ZodString;
    agentType: z.ZodEnum<["researcher", "implementer", "reviewer", "tester", "documenter"]>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    status: z.ZodEnum<["pending", "blocked", "queued", "assigned", "executing", "completed", "failed"]>;
    assignedAgentId: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodUnknown>;
    attempts: z.ZodDefault<z.ZodNumber>;
    maxAttempts: z.ZodDefault<z.ZodNumber>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "executing" | "completed" | "failed" | "blocked" | "queued" | "assigned";
    id: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    parentTaskId: string;
    agentType: "researcher" | "implementer" | "reviewer" | "tester" | "documenter";
    dependencies: string[];
    attempts: number;
    maxAttempts: number;
    error?: string | undefined;
    assignedAgentId?: string | undefined;
    result?: unknown;
}, {
    status: "pending" | "executing" | "completed" | "failed" | "blocked" | "queued" | "assigned";
    id: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    parentTaskId: string;
    agentType: "researcher" | "implementer" | "reviewer" | "tester" | "documenter";
    error?: string | undefined;
    dependencies?: string[] | undefined;
    assignedAgentId?: string | undefined;
    result?: unknown;
    attempts?: number | undefined;
    maxAttempts?: number | undefined;
}>;
export type Subtask = z.infer<typeof SubtaskSchema>;
export declare const AgentEntrySchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["researcher", "implementer", "reviewer", "tester", "documenter"]>;
    pid: z.ZodOptional<z.ZodNumber>;
    status: z.ZodEnum<["idle", "busy", "error", "offline"]>;
    currentSubtaskId: z.ZodOptional<z.ZodString>;
    lastHeartbeat: z.ZodNumber;
    metrics: z.ZodObject<{
        tasksCompleted: z.ZodDefault<z.ZodNumber>;
        tasksFailed: z.ZodDefault<z.ZodNumber>;
        avgExecutionMs: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        tasksCompleted: number;
        tasksFailed: number;
        avgExecutionMs: number;
    }, {
        tasksCompleted?: number | undefined;
        tasksFailed?: number | undefined;
        avgExecutionMs?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "researcher" | "implementer" | "reviewer" | "tester" | "documenter";
    status: "idle" | "busy" | "error" | "offline";
    id: string;
    lastHeartbeat: number;
    metrics: {
        tasksCompleted: number;
        tasksFailed: number;
        avgExecutionMs: number;
    };
    pid?: number | undefined;
    currentSubtaskId?: string | undefined;
}, {
    type: "researcher" | "implementer" | "reviewer" | "tester" | "documenter";
    status: "idle" | "busy" | "error" | "offline";
    id: string;
    lastHeartbeat: number;
    metrics: {
        tasksCompleted?: number | undefined;
        tasksFailed?: number | undefined;
        avgExecutionMs?: number | undefined;
    };
    pid?: number | undefined;
    currentSubtaskId?: string | undefined;
}>;
export type AgentEntry = z.infer<typeof AgentEntrySchema>;
export declare const ContextEntrySchema: z.ZodObject<{
    agentId: z.ZodString;
    timestamp: z.ZodNumber;
    type: z.ZodEnum<["file", "pattern", "insight", "discovery", "error"]>;
    data: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    type: "error" | "file" | "pattern" | "insight" | "discovery";
    agentId: string;
    timestamp: number;
    data?: unknown;
}, {
    type: "error" | "file" | "pattern" | "insight" | "discovery";
    agentId: string;
    timestamp: number;
    data?: unknown;
}>;
export type ContextEntry = z.infer<typeof ContextEntrySchema>;
export declare const SharedContextSchema: z.ZodObject<{
    taskId: z.ZodString;
    projectPath: z.ZodString;
    discoveries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        agentId: z.ZodString;
        timestamp: z.ZodNumber;
        type: z.ZodEnum<["file", "pattern", "insight", "discovery", "error"]>;
        data: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        type: "error" | "file" | "pattern" | "insight" | "discovery";
        agentId: string;
        timestamp: number;
        data?: unknown;
    }, {
        type: "error" | "file" | "pattern" | "insight" | "discovery";
        agentId: string;
        timestamp: number;
        data?: unknown;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    projectPath: string;
    taskId: string;
    discoveries: {
        type: "error" | "file" | "pattern" | "insight" | "discovery";
        agentId: string;
        timestamp: number;
        data?: unknown;
    }[];
}, {
    projectPath: string;
    taskId: string;
    discoveries?: {
        type: "error" | "file" | "pattern" | "insight" | "discovery";
        agentId: string;
        timestamp: number;
        data?: unknown;
    }[] | undefined;
}>;
export type SharedContext = z.infer<typeof SharedContextSchema>;
export declare const ConfigSchema: z.ZodObject<{
    redis: z.ZodObject<{
        url: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
    }, {
        url?: string | undefined;
    }>;
    anthropic: z.ZodObject<{
        apiKey: z.ZodDefault<z.ZodString>;
        model: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        apiKey: string;
        model: string;
    }, {
        apiKey?: string | undefined;
        model?: string | undefined;
    }>;
    orchestrator: z.ZodObject<{
        maxWorkers: z.ZodDefault<z.ZodNumber>;
        defaultTimeoutMs: z.ZodDefault<z.ZodNumber>;
        heartbeatIntervalMs: z.ZodDefault<z.ZodNumber>;
        heartbeatTimeoutMs: z.ZodDefault<z.ZodNumber>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxWorkers: number;
        defaultTimeoutMs: number;
        heartbeatIntervalMs: number;
        heartbeatTimeoutMs: number;
        maxRetries: number;
    }, {
        maxWorkers?: number | undefined;
        defaultTimeoutMs?: number | undefined;
        heartbeatIntervalMs?: number | undefined;
        heartbeatTimeoutMs?: number | undefined;
        maxRetries?: number | undefined;
    }>;
    logLevel: z.ZodDefault<z.ZodEnum<["trace", "debug", "info", "warn", "error", "fatal"]>>;
}, "strip", z.ZodTypeAny, {
    redis: {
        url: string;
    };
    anthropic: {
        apiKey: string;
        model: string;
    };
    orchestrator: {
        maxWorkers: number;
        defaultTimeoutMs: number;
        heartbeatIntervalMs: number;
        heartbeatTimeoutMs: number;
        maxRetries: number;
    };
    logLevel: "error" | "trace" | "debug" | "info" | "warn" | "fatal";
}, {
    redis: {
        url?: string | undefined;
    };
    anthropic: {
        apiKey?: string | undefined;
        model?: string | undefined;
    };
    orchestrator: {
        maxWorkers?: number | undefined;
        defaultTimeoutMs?: number | undefined;
        heartbeatIntervalMs?: number | undefined;
        heartbeatTimeoutMs?: number | undefined;
        maxRetries?: number | undefined;
    };
    logLevel?: "error" | "trace" | "debug" | "info" | "warn" | "fatal" | undefined;
}>;
export type Config = z.infer<typeof ConfigSchema>;
export declare const TaskInputSchema: z.ZodObject<{
    description: z.ZodString;
    projectPath: z.ZodString;
    type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["feature", "bugfix", "refactor", "research"]>>>;
    maxAgents: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "feature" | "bugfix" | "refactor" | "research";
    description: string;
    projectPath: string;
    maxAgents?: number | undefined;
    timeoutMs?: number | undefined;
}, {
    description: string;
    projectPath: string;
    type?: "feature" | "bugfix" | "refactor" | "research" | undefined;
    maxAgents?: number | undefined;
    timeoutMs?: number | undefined;
}>;
export type TaskInput = z.infer<typeof TaskInputSchema>;
export declare const SubtaskResultSchema: z.ZodObject<{
    subtaskId: z.ZodString;
    success: z.ZodBoolean;
    output: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
    executionMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    subtaskId: string;
    success: boolean;
    executionMs: number;
    error?: string | undefined;
    output?: unknown;
}, {
    subtaskId: string;
    success: boolean;
    executionMs: number;
    error?: string | undefined;
    output?: unknown;
}>;
export type SubtaskResult = z.infer<typeof SubtaskResultSchema>;
export declare const TaskResultSchema: z.ZodObject<{
    taskId: z.ZodString;
    status: z.ZodEnum<["pending", "decomposing", "executing", "aggregating", "completed", "failed", "cancelled"]>;
    output: z.ZodOptional<z.ZodUnknown>;
    subtaskResults: z.ZodArray<z.ZodObject<{
        subtaskId: z.ZodString;
        success: z.ZodBoolean;
        output: z.ZodOptional<z.ZodUnknown>;
        error: z.ZodOptional<z.ZodString>;
        executionMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        subtaskId: string;
        success: boolean;
        executionMs: number;
        error?: string | undefined;
        output?: unknown;
    }, {
        subtaskId: string;
        success: boolean;
        executionMs: number;
        error?: string | undefined;
        output?: unknown;
    }>, "many">;
    totalExecutionMs: z.ZodNumber;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "decomposing" | "executing" | "aggregating" | "completed" | "failed" | "cancelled";
    taskId: string;
    subtaskResults: {
        subtaskId: string;
        success: boolean;
        executionMs: number;
        error?: string | undefined;
        output?: unknown;
    }[];
    totalExecutionMs: number;
    error?: string | undefined;
    output?: unknown;
}, {
    status: "pending" | "decomposing" | "executing" | "aggregating" | "completed" | "failed" | "cancelled";
    taskId: string;
    subtaskResults: {
        subtaskId: string;
        success: boolean;
        executionMs: number;
        error?: string | undefined;
        output?: unknown;
    }[];
    totalExecutionMs: number;
    error?: string | undefined;
    output?: unknown;
}>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
//# sourceMappingURL=schema.d.ts.map