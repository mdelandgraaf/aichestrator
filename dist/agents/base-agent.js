export class BaseAgent {
    config;
    memory;
    logger;
    aborted = false;
    constructor(config, memory, logger) {
        this.config = config;
        this.memory = memory;
        this.logger = logger;
    }
    async abort() {
        this.aborted = true;
        this.logger.warn({ agentId: this.config.id }, 'Agent aborted');
    }
    async shareDiscovery(taskId, type, data) {
        await this.memory.appendContext(taskId, {
            agentId: this.config.id,
            timestamp: Date.now(),
            type,
            data
        });
    }
    createProgress(type, content) {
        return {
            type,
            content,
            timestamp: Date.now()
        };
    }
    get id() {
        return this.config.id;
    }
    get type() {
        return this.config.type;
    }
}
//# sourceMappingURL=base-agent.js.map