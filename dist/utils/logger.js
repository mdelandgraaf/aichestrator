import pino from 'pino';
export function createLogger(name, level = 'info') {
    return pino({
        name,
        level,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
    });
}
//# sourceMappingURL=logger.js.map