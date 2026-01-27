import pino from 'pino';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
// Global log file path - set by setLogFile()
let logFilePath = null;
export function setLogFile(projectPath) {
    const logsDir = join(projectPath, '.aichestrator');
    if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logFilePath = join(logsDir, `run-${timestamp}.log`);
    return logFilePath;
}
export function getLogFile() {
    return logFilePath;
}
export function logToFile(message) {
    if (logFilePath) {
        try {
            const timestamp = new Date().toISOString();
            appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
        }
        catch {
            // Ignore file write errors
        }
    }
}
export function createLogger(name, level) {
    const logLevel = level ?? process.env['LOG_LEVEL'] ?? 'info';
    const logger = pino({
        name,
        level: logLevel,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
    });
    // Wrap logger to also write to file
    const originalInfo = logger.info.bind(logger);
    const originalWarn = logger.warn.bind(logger);
    const originalError = logger.error.bind(logger);
    logger.info = ((obj, msg) => {
        if (typeof obj === 'string') {
            logToFile(`INFO [${name}] ${obj}`);
        }
        else if (msg) {
            logToFile(`INFO [${name}] ${msg} ${JSON.stringify(obj)}`);
        }
        return originalInfo(obj, msg);
    });
    logger.warn = ((obj, msg) => {
        if (typeof obj === 'string') {
            logToFile(`WARN [${name}] ${obj}`);
        }
        else if (msg) {
            logToFile(`WARN [${name}] ${msg} ${JSON.stringify(obj)}`);
        }
        return originalWarn(obj, msg);
    });
    logger.error = ((obj, msg) => {
        if (typeof obj === 'string') {
            logToFile(`ERROR [${name}] ${obj}`);
        }
        else if (msg) {
            logToFile(`ERROR [${name}] ${msg} ${JSON.stringify(obj)}`);
        }
        return originalError(obj, msg);
    });
    return logger;
}
//# sourceMappingURL=logger.js.map