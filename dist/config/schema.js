import { z } from 'zod';
export const TaskTypeSchema = z.enum(['feature', 'bugfix', 'refactor', 'research']);
export const TaskStatusSchema = z.enum([
    'pending',
    'decomposing',
    'executing',
    'aggregating',
    'completed',
    'failed',
    'cancelled'
]);
export const SubtaskStatusSchema = z.enum([
    'pending',
    'blocked',
    'queued',
    'assigned',
    'executing',
    'completed',
    'failed'
]);
export const AgentTypeSchema = z.enum([
    'researcher',
    'implementer',
    'reviewer',
    'tester',
    'documenter'
]);
export const AgentStatusSchema = z.enum(['idle', 'busy', 'error', 'offline']);
export const TaskConstraintsSchema = z.object({
    maxAgents: z.number().int().min(1).max(10).default(4),
    timeoutMs: z.number().int().min(1000).default(300000),
    allowedTools: z.array(z.string()).optional()
});
export const TaskSchema = z.object({
    id: z.string(),
    description: z.string().min(1),
    projectPath: z.string(),
    type: TaskTypeSchema,
    status: TaskStatusSchema,
    constraints: TaskConstraintsSchema,
    createdAt: z.number(),
    updatedAt: z.number(),
    error: z.string().optional()
});
export const SubtaskSchema = z.object({
    id: z.string(),
    parentTaskId: z.string(),
    description: z.string().min(1),
    agentType: AgentTypeSchema,
    dependencies: z.array(z.string()).default([]),
    status: SubtaskStatusSchema,
    assignedAgentId: z.string().optional(),
    result: z.unknown().optional(),
    attempts: z.number().int().default(0),
    maxAttempts: z.number().int().default(3),
    createdAt: z.number(),
    updatedAt: z.number(),
    error: z.string().optional()
});
export const AgentEntrySchema = z.object({
    id: z.string(),
    type: AgentTypeSchema,
    pid: z.number().int().optional(),
    status: AgentStatusSchema,
    currentSubtaskId: z.string().optional(),
    lastHeartbeat: z.number(),
    metrics: z.object({
        tasksCompleted: z.number().int().default(0),
        tasksFailed: z.number().int().default(0),
        avgExecutionMs: z.number().default(0)
    })
});
export const ContextEntrySchema = z.object({
    agentId: z.string(),
    timestamp: z.number(),
    type: z.enum(['file', 'pattern', 'insight', 'discovery', 'error']),
    data: z.unknown()
});
export const SharedContextSchema = z.object({
    taskId: z.string(),
    projectPath: z.string(),
    discoveries: z.array(ContextEntrySchema).default([])
});
export const ConfigSchema = z.object({
    redis: z.object({
        url: z.string().url().default('redis://localhost:6379')
    }),
    anthropic: z.object({
        apiKey: z.string().default(''),
        model: z.string().default('claude-sonnet-4-20250514')
    }),
    orchestrator: z.object({
        maxWorkers: z.number().int().min(1).max(10).default(4),
        defaultTimeoutMs: z.number().int().min(1000).default(300000),
        heartbeatIntervalMs: z.number().int().default(5000),
        heartbeatTimeoutMs: z.number().int().default(15000)
    }),
    logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info')
});
export const TaskInputSchema = z.object({
    description: z.string().min(1),
    projectPath: z.string(),
    type: TaskTypeSchema.optional().default('feature'),
    maxAgents: z.number().int().min(1).max(10).optional(),
    timeoutMs: z.number().int().min(1000).optional()
});
export const SubtaskResultSchema = z.object({
    subtaskId: z.string(),
    success: z.boolean(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    executionMs: z.number()
});
export const TaskResultSchema = z.object({
    taskId: z.string(),
    status: TaskStatusSchema,
    output: z.unknown().optional(),
    subtaskResults: z.array(SubtaskResultSchema),
    totalExecutionMs: z.number(),
    error: z.string().optional()
});
//# sourceMappingURL=schema.js.map