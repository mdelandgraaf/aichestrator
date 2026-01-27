import { SharedMemory } from '../memory/shared-memory.js';
import { EventBus } from '../events/event-bus.js';
export interface HealthMonitorConfig {
    heartbeatIntervalMs: number;
    heartbeatTimeoutMs: number;
    checkIntervalMs: number;
}
export interface AgentHealth {
    agentId: string;
    isAlive: boolean;
    lastHeartbeat: number;
    missedHeartbeats: number;
    status: 'healthy' | 'warning' | 'critical' | 'dead';
}
export declare class HealthMonitor {
    private memory;
    private eventBus;
    private config;
    private logger;
    private checkInterval;
    private isRunning;
    private agentHealthCache;
    constructor(memory: SharedMemory, eventBus: EventBus, config: HealthMonitorConfig);
    /**
     * Start monitoring agent health
     */
    start(): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Check all registered agents
     */
    checkAllAgents(): Promise<void>;
    /**
     * Check a single agent's health
     */
    private checkAgent;
    /**
     * Handle an agent that has stopped responding
     */
    private handleDeadAgent;
    /**
     * Reschedule a subtask from a dead agent
     */
    private rescheduleSubtask;
    /**
     * Get health status for all agents
     */
    getHealthReport(): Promise<{
        healthy: number;
        warning: number;
        critical: number;
        dead: number;
        agents: AgentHealth[];
    }>;
    /**
     * Get health for a specific agent
     */
    getAgentHealth(agentId: string): AgentHealth | undefined;
    /**
     * Force check a specific agent
     */
    checkAgentHealth(agentId: string): Promise<AgentHealth | null>;
}
//# sourceMappingURL=health-monitor.d.ts.map