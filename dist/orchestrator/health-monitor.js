import { createLogger } from '../utils/logger.js';
export class HealthMonitor {
    memory;
    eventBus;
    config;
    logger;
    checkInterval = null;
    isRunning = false;
    agentHealthCache = new Map();
    constructor(memory, eventBus, config) {
        this.memory = memory;
        this.eventBus = eventBus;
        this.config = config;
        this.logger = createLogger('health-monitor');
    }
    /**
     * Start monitoring agent health
     */
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.checkInterval = setInterval(() => this.checkAllAgents(), this.config.checkIntervalMs);
        this.logger.info({ intervalMs: this.config.checkIntervalMs }, 'Health monitor started');
    }
    /**
     * Stop monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        this.logger.info('Health monitor stopped');
    }
    /**
     * Check all registered agents
     */
    async checkAllAgents() {
        try {
            const agents = await this.memory.getAllAgents();
            for (const agent of agents) {
                await this.checkAgent(agent);
            }
            // Clean up cache for removed agents
            const agentIds = new Set(agents.map((a) => a.id));
            for (const cachedId of this.agentHealthCache.keys()) {
                if (!agentIds.has(cachedId)) {
                    this.agentHealthCache.delete(cachedId);
                }
            }
        }
        catch (error) {
            this.logger.error({ error: String(error) }, 'Failed to check agents');
        }
    }
    /**
     * Check a single agent's health
     */
    async checkAgent(agent) {
        const now = Date.now();
        const isAlive = await this.memory.isAgentAlive(agent.id);
        const timeSinceHeartbeat = now - agent.lastHeartbeat;
        // Get cached health or create new
        let health = this.agentHealthCache.get(agent.id);
        if (!health) {
            health = {
                agentId: agent.id,
                isAlive,
                lastHeartbeat: agent.lastHeartbeat,
                missedHeartbeats: 0,
                status: 'healthy'
            };
        }
        // Update health based on heartbeat
        health.isAlive = isAlive;
        health.lastHeartbeat = agent.lastHeartbeat;
        if (!isAlive) {
            // Calculate missed heartbeats
            health.missedHeartbeats = Math.floor(timeSinceHeartbeat / this.config.heartbeatIntervalMs);
            // Determine status
            if (health.missedHeartbeats >= 3) {
                health.status = 'dead';
            }
            else if (health.missedHeartbeats >= 2) {
                health.status = 'critical';
            }
            else if (health.missedHeartbeats >= 1) {
                health.status = 'warning';
            }
            // Handle dead agents
            if (health.status === 'dead') {
                await this.handleDeadAgent(agent, health);
            }
        }
        else {
            health.missedHeartbeats = 0;
            health.status = 'healthy';
        }
        this.agentHealthCache.set(agent.id, health);
        return health;
    }
    /**
     * Handle an agent that has stopped responding
     */
    async handleDeadAgent(agent, health) {
        this.logger.warn({
            agentId: agent.id,
            lastHeartbeat: agent.lastHeartbeat,
            missedHeartbeats: health.missedHeartbeats
        }, 'Agent is dead');
        // Emit event
        await this.eventBus.emitAgentOffline(agent.id, agent.lastHeartbeat);
        // Update agent status
        await this.memory.updateAgentStatus(agent.id, 'offline');
        // Reschedule the agent's current subtask if any
        if (agent.currentSubtaskId) {
            await this.rescheduleSubtask(agent.currentSubtaskId, agent.id);
        }
        // Remove the agent from registry
        await this.memory.removeAgent(agent.id);
    }
    /**
     * Reschedule a subtask from a dead agent
     */
    async rescheduleSubtask(subtaskId, agentId) {
        const subtask = await this.memory.getSubtask(subtaskId);
        if (!subtask)
            return;
        // Only reschedule if not already completed/failed
        if (subtask.status === 'executing' || subtask.status === 'assigned') {
            // Check if we should retry
            if (subtask.attempts < subtask.maxAttempts) {
                this.logger.info({ subtaskId, agentId, attempts: subtask.attempts }, 'Rescheduling subtask from dead agent');
                // Reset subtask to pending (queue will pick it up)
                await this.memory.updateSubtaskStatus(subtaskId, 'pending', {
                    assignedAgentId: undefined,
                    error: `Agent ${agentId} became unresponsive`
                });
            }
            else {
                // Max attempts reached, mark as failed
                this.logger.error({ subtaskId, agentId, attempts: subtask.attempts }, 'Subtask exceeded max attempts');
                await this.memory.updateSubtaskStatus(subtaskId, 'failed', {
                    error: `Exceeded max attempts (${subtask.maxAttempts}). Last failure: Agent ${agentId} became unresponsive`
                });
            }
        }
    }
    /**
     * Get health status for all agents
     */
    async getHealthReport() {
        await this.checkAllAgents();
        const agents = Array.from(this.agentHealthCache.values());
        return {
            healthy: agents.filter((a) => a.status === 'healthy').length,
            warning: agents.filter((a) => a.status === 'warning').length,
            critical: agents.filter((a) => a.status === 'critical').length,
            dead: agents.filter((a) => a.status === 'dead').length,
            agents
        };
    }
    /**
     * Get health for a specific agent
     */
    getAgentHealth(agentId) {
        return this.agentHealthCache.get(agentId);
    }
    /**
     * Force check a specific agent
     */
    async checkAgentHealth(agentId) {
        const agent = await this.memory.getAgent(agentId);
        if (!agent)
            return null;
        return this.checkAgent(agent);
    }
}
//# sourceMappingURL=health-monitor.js.map