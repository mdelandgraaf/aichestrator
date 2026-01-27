import pino from 'pino';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

// Global log file path - set by setLogFile()
let logFilePath: string | null = null;

export function setLogFile(projectPath: string): string {
  const logsDir = join(projectPath, '.aichestrator');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  logFilePath = join(logsDir, `run-${timestamp}.log`);
  return logFilePath;
}

export function getLogFile(): string | null {
  return logFilePath;
}

export function logToFile(message: string): void {
  if (logFilePath) {
    try {
      const timestamp = new Date().toISOString();
      appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
    } catch {
      // Ignore file write errors
    }
  }
}

export function createLogger(name: string, level?: string) {
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

  logger.info = ((obj: unknown, msg?: string) => {
    if (typeof obj === 'string') {
      logToFile(`INFO [${name}] ${obj}`);
    } else if (msg) {
      logToFile(`INFO [${name}] ${msg} ${JSON.stringify(obj)}`);
    }
    return originalInfo(obj as object, msg as string);
  }) as typeof logger.info;

  logger.warn = ((obj: unknown, msg?: string) => {
    if (typeof obj === 'string') {
      logToFile(`WARN [${name}] ${obj}`);
    } else if (msg) {
      logToFile(`WARN [${name}] ${msg} ${JSON.stringify(obj)}`);
    }
    return originalWarn(obj as object, msg as string);
  }) as typeof logger.warn;

  logger.error = ((obj: unknown, msg?: string) => {
    if (typeof obj === 'string') {
      logToFile(`ERROR [${name}] ${obj}`);
    } else if (msg) {
      logToFile(`ERROR [${name}] ${msg} ${JSON.stringify(obj)}`);
    }
    return originalError(obj as object, msg as string);
  }) as typeof logger.error;

  return logger;
}

export type Logger = ReturnType<typeof createLogger>;
